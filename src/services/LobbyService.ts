import {
    ref,
    set,
    push,
    onValue,
    remove,
    runTransaction,
    query,
    orderByChild,
    equalTo,
    limitToFirst,
    get,
    update,
    onDisconnect,
    serverTimestamp
} from "firebase/database";
import { rtdb, auth } from "../config/firebase";
import { Board, BlockShape } from "../game/types";
import { generatePvPBlocks } from "../game/survivalAlgorithm";
import { hasAnyValidPlacement } from "../game/board";

export interface PlayerInfo {
    uid: string;
    name: string;
    rate: number;
}

export interface LastMove {
    uid: string;
    index: number;
    row: number;
    col: number;
    timestamp: number;
}

export interface RoomData {
    id?: string;
    status: 'waiting' | 'playing' | 'finished';
    player1: PlayerInfo;
    player2?: PlayerInfo;
    isPrivate: boolean;
    isRanked: boolean;
    createdAt: number;
    winner?: string; // UID
    loser?: string;  // UID
    isFinished?: boolean;
    isRatingCalculated?: boolean; // Cloud Functions idempotency flag

    // Phase 19: Turn-based shared board
    board: Board;
    currentTurn: string; // UID
    currentBlocks: (BlockShape | null)[];
    placedCount: number; // 0, 1, 2
    turnNumber: number; // 1-based cumulative turn counter (both players combined)
    turnStartTime: any; // Server Timestamp
    turnDuration: number; // 30000ms
    gameStartTime?: any; // Server Timestamp — cheat detection (Cloud Functions)
    lastMove?: LastMove;
}

/**
 * Normalize Firebase RTDB sparse object/array into a proper 3-element array.
 * Firebase deletes keys set to null, turning [A, null, B] into {0: A, 2: B}.
 * This restores it to [A, null, B] with guaranteed length 3.
 */
export function normalizeBlocks(raw: any): (BlockShape | null)[] {
    if (!raw) return [null, null, null];
    const result: (BlockShape | null)[] = [null, null, null];
    if (Array.isArray(raw)) {
        for (let i = 0; i < 3; i++) {
            result[i] = (raw[i] != null && raw[i].cells) ? raw[i] : null;
        }
    } else if (typeof raw === 'object') {
        for (let i = 0; i < 3; i++) {
            const val = raw[i] ?? raw[String(i)];
            result[i] = (val != null && val.cells) ? val : null;
        }
    }
    return result;
}

/**
 * Robustly normalize Board (8x8) from sparse Firebase object or nested sparse objects.
 */
export function normalizeBoard(boardRaw: any): Board {
    const emptyBoard = (): Board => Array.from({ length: 8 }, () => Array(8).fill(0));
    if (!boardRaw) return emptyBoard();

    const board: Board = emptyBoard();

    // Map rows (could be array or object-like from RTDB)
    for (let r = 0; r < 8; r++) {
        const rowRaw = boardRaw[r] ?? boardRaw[String(r)];
        if (rowRaw) {
            for (let c = 0; c < 8; c++) {
                const cell = rowRaw[c] ?? rowRaw[String(c)];
                if (cell !== undefined) {
                    board[r][c] = cell;
                }
            }
        }
    }
    return board;
}

export const LobbyService = {
    /**
     * Diagnostic: Monitor RTDB Connection State
     */
    monitorConnection: () => {
        const connectedRef = ref(rtdb, ".info/connected");
        console.log(`[RTDB/Diag] Monitoring Connection... (URL: ${rtdb.app.options.databaseURL})`);
        const unsub = onValue(connectedRef, (snap) => {
            if (snap.val() === true) {
                console.log("[RTDB/Diag] Status: CONNECTED");
            } else {
                console.warn("[RTDB/Diag] Status: DISCONNECTED");
            }
        });
        return unsub;
    },

    /**
     * Helper to generate a 4-digit numeric string (0000-9999)
     */
    generate4DigitCode: (): string => {
        return Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    },

    /**
     * Creates a new match room in RTDB.
     */
    createRoom: async (player1: PlayerInfo, isPrivate: boolean = false, isRanked: boolean = false): Promise<string> => {
        console.log(`[RTDB/Diag] createRoom invoked (isPrivate: ${isPrivate}, isRanked: ${isRanked}). Auth: ${auth.currentUser?.uid || 'NONE'}`);

        // Initial board and blocks for fresh room data
        const initialBoard = Array.from({ length: 8 }, () => Array(8).fill(0));
        const initialBlocks = generatePvPBlocks(initialBoard);

        const freshRoomData: RoomData = {
            status: 'waiting',
            player1,
            isPrivate,
            isRanked,
            createdAt: Date.now(),
            isFinished: false,
            board: initialBoard,
            currentTurn: player1.uid,
            currentBlocks: initialBlocks,
            placedCount: 0,
            turnNumber: 1,
            turnStartTime: serverTimestamp(),
            turnDuration: 30000
        };

        if (!isPrivate) {
            // Standard Public/Ranked Room: Use Firebase Push ID
            const roomsRef = ref(rtdb, 'rooms');
            const newRoomRef = push(roomsRef);
            const roomId = newRoomRef.key!;
            await onDisconnect(newRoomRef).remove();
            await set(newRoomRef, freshRoomData);
            console.log(`[RTDB/Path] Created Public Room at: rooms/${roomId}`);
            return roomId;
        }

        // --- Private Room: 4-Digit ID with Collision Retry Loop ---
        let attempts = 0;
        const maxAttempts = 10;

        while (attempts < maxAttempts) {
            const code = LobbyService.generate4DigitCode();
            const roomRef = ref(rtdb, `rooms/${code}`);

            console.log(`[RTDB/Private] Attempting to claim ID: ${code} (Attempt ${attempts + 1}/${maxAttempts})`);

            try {
                const result = await runTransaction(roomRef, (currentData: RoomData | null) => {
                    // ID is available if it doesn't exist OR if previous match is 'finished'
                    if (currentData === null || currentData.status === 'finished') {
                        // CRITICAL: Return the NEW object to completely OVERWRITE the node.
                        // This wipes board, player2, and any other stale session data.
                        return freshRoomData;
                    }
                    // Node is active ('waiting' or 'playing'): Reject and retry
                    return; // Abort transaction
                });

                if (result.committed) {
                    console.log(`[RTDB/Private] Successfully claimed ID: ${code}`);
                    await onDisconnect(roomRef).remove();
                    return code;
                }
            } catch (error) {
                console.error(`[RTDB/Private] Transaction error for ${code}:`, error);
            }

            attempts++;
        }

        throw new Error("Failed to generate a unique 4-digit Room ID after 10 attempts. Please try again.");
    },

    /**
     * Atomically executes a move via runTransaction.
     * All moves (intermediate + turn switch) use transaction for race-condition safety.
     * DFS (generatePvPBlocks) is NEVER called inside the transaction callback.
     * Pre-generated blocks for the next turn are passed via newBlocksForNextTurn.
     */
    makeMove: async (
        roomId: string,
        uid: string,
        index: number,
        row: number,
        col: number,
        nextBoard: Board,
        newBlocksForNextTurn?: BlockShape[]
    ): Promise<boolean> => {
        const roomRef = ref(rtdb, `rooms/${roomId}`);

        try {
            const result = await runTransaction(roomRef, (data: RoomData | null) => {
                if (!data) return;
                if (data.currentTurn !== uid || data.isFinished) return;

                // 1. Normalize & validate
                data.currentBlocks = normalizeBlocks(data.currentBlocks);
                if (!data.currentBlocks[index]) return; // Already placed (race guard)

                // 2. Apply move: board + null out placed block
                data.board = nextBoard;
                data.currentBlocks[index] = null;

                // 3. Determine turn state
                const nextPlacedCount = (data.placedCount || 0) + 1;
                const remainingBlocks = data.currentBlocks.filter((b): b is BlockShape => b != null);
                const canProceed = remainingBlocks.some(b => hasAnyValidPlacement(data.board, b));
                const isTurnEnding = nextPlacedCount >= 3 || !canProceed;

                // ─── 中間配置: ターン継続 ─────────────────────
                if (!isTurnEnding) {
                    data.placedCount = nextPlacedCount;
                    data.lastMove = { uid, index, row, col, timestamp: Date.now() };
                    return data;
                }

                // ─── Mid-turn Stalemate: 残りブロック配置不可 → ゲーム終了 ───
                if (nextPlacedCount < 3 && !canProceed) {
                    data.status = 'finished';
                    data.isFinished = true;
                    data.winner = data.player1.uid === uid ? (data.player2?.uid || "") : data.player1.uid;
                    data.loser = uid;
                    data.lastMove = { uid, index, row, col, timestamp: Date.now() };
                    // Stalemate — ブロック生成不要。Abort しない。
                    return data;
                }

                // ─── 正常ターン切替: 3ブロック配置完了 ────────────
                // 【厳守】newBlocksForNextTurn 必須。無ければ Abort。
                if (!newBlocksForNextTurn || newBlocksForNextTurn.length !== 3) {
                    console.error(`[Lobby/Turn] newBlocksForNextTurn missing or invalid. Aborting transaction.`);
                    return; // Abort — クライアント側の再試行を待つ
                }

                data.placedCount = 0;
                data.lastMove = { uid, index, row, col, timestamp: Date.now() };

                const player1Uid = data.player1.uid;
                const player2Uid = data.player2?.uid || "";
                data.currentTurn = data.currentTurn === player1Uid ? player2Uid : player1Uid;

                data.turnNumber = (data.turnNumber || 1) + 1;
                data.currentBlocks = newBlocksForNextTurn;
                data.turnStartTime = serverTimestamp();

                return data;
            });
            return result.committed;
        } catch (error) {
            console.error('[RTDB] makeMove error:', error);
            return false;
        }
    },

    /**
     * Reports game over.
     */
    reportGameOver: async (roomId: string, loserUid: string, winnerUid: string): Promise<boolean> => {
        const roomRef = ref(rtdb, `rooms/${roomId}`);
        try {
            const result = await runTransaction(roomRef, (currentData: RoomData | null) => {
                if (!currentData || currentData.winner) return;

                // Phase 42: Player validation — winner and loser must be actual participants
                const p1 = currentData.player1?.uid;
                const p2 = currentData.player2?.uid;
                if (!p1 || !p2) return; // Room incomplete
                if (winnerUid !== p1 && winnerUid !== p2) return; // Winner not a participant
                if (loserUid !== p1 && loserUid !== p2) return;  // Loser not a participant
                if (winnerUid === loserUid) return; // Same player can't be both

                currentData.winner = winnerUid;
                currentData.loser = loserUid;
                currentData.status = 'finished';
                currentData.isFinished = true;
                return currentData;
            });
            return result.committed;
        } catch (error) {
            console.error('[RTDB] Game Over Error:', error);
            return false;
        }
    },

    /**
     * Atomically joins a room.
     */
    joinRoom: async (roomId: string, player2: PlayerInfo): Promise<boolean> => {
        console.log(`[RTDB/Diag] joinRoom invoked (${roomId}). Auth: ${auth.currentUser?.uid || 'NONE'}`);
        const roomRef = ref(rtdb, `rooms/${roomId}`);
        try {
            const result = await runTransaction(roomRef, (currentData: RoomData | null) => {
                if (currentData === null) return currentData;
                if (currentData.status !== 'waiting') return;
                if (currentData.player2) return;

                currentData.player2 = player2;
                // DO NOT set playing here. Let the Host do it for atomic consistency.
                console.log(`[RTDB/Tx] Guest ${player2.uid} joined room/${roomId}. Waiting for Host to start...`);
                return currentData;
            });
            return result.committed;
        } catch (error) {
            console.error(`[RTDB] Join Error:`, error);
            return false;
        }
    },

    /**
     * Host-only: Atomically starts the game.
     */
    startGame: async (roomId: string): Promise<boolean> => {
        console.log(`[RTDB/Diag] startGame requested for room: ${roomId}`);
        const roomRef = ref(rtdb, `rooms/${roomId}`);
        const myUid = auth.currentUser?.uid;

        try {
            // 1. Fetch current data to verify Host status
            const snapshot = await get(roomRef);
            if (!snapshot.exists()) return false;
            const roomData = snapshot.val() as RoomData;

            // 2. STRONG GUARD: Only the HOST (player1) can initiate start
            if (myUid !== roomData.player1.uid) {
                console.warn(`[RTDB/Guard] Non-host ${myUid} tried to startGame. Ignored.`);
                return false;
            }

            if (roomData.status !== 'waiting' || !roomData.player2) {
                console.warn(`[RTDB/Guard] Room not ready or already started (status: ${roomData.status})`);
                return false;
            }

            // 3. ATOMIC UPDATE: Write everything in one network trip
            const initialBoard = Array.from({ length: 8 }, () => Array(8).fill(0));
            const initialBlocks = generatePvPBlocks(initialBoard, 1);

            const updates: Partial<RoomData> = {
                status: 'playing',
                board: initialBoard,
                currentBlocks: initialBlocks,
                currentTurn: myUid, // Explicitly use my current UID (Host)
                placedCount: 0,
                turnNumber: 1,
                turnStartTime: serverTimestamp(),
                gameStartTime: serverTimestamp(), // Phase 42: Cheat detection — Cloud Functions validates min duration
            };

            await update(roomRef, updates);
            console.log(`[RTDB/Atomic] Host successfully initialized room/${roomId} to 'playing'.`);
            return true;
        } catch (error) {
            console.error(`[RTDB] Atomic Start Game Error:`, error);
            return false;
        }
    },

    /**
     * Finds public room.
     */
    findPublicRoom: async (): Promise<string | null> => {
        const roomsRef = ref(rtdb, 'rooms');
        const myUid = auth.currentUser?.uid;

        console.log(`[RTDB/Find] Searching for public rooms... MyUID: ${myUid}`);

        // Fetch top 10 waiting rooms to avoid only picking our own room if it's first
        const q = query(roomsRef, orderByChild('status'), equalTo('waiting'), limitToFirst(10));
        const snapshot = await get(q);

        if (snapshot.exists()) {
            const rooms = snapshot.val();
            const roomIds = Object.keys(rooms);
            console.log(`[RTDB/Find] Found ${roomIds.length} waiting rooms.`);

            const validRoomId = roomIds.find(key => {
                const room = rooms[key];
                return !room.isPrivate && room.player1.uid !== myUid;
            });

            if (validRoomId) {
                console.log(`[RTDB/Find] Selected room: ${validRoomId}`);
                return validRoomId;
            }
        } else {
            console.log(`[RTDB/Find] No waiting rooms found.`);
        }
        return null;
    },

    /**
     * Cancels room.
     */
    cancelRoom: async (roomId: string): Promise<void> => {
        const roomRef = ref(rtdb, `rooms/${roomId}`);
        try {
            await runTransaction(roomRef, (currentData: RoomData | null) => {
                if (!currentData) return;
                // Only allow room deletion if it's still in 'waiting' status
                if (currentData.status === 'waiting') {
                    return null; // This deletes the node in runTransaction
                }
                console.log(`[RTDB/Protect] cancelRoom blocked because status is ${currentData.status}`);
                return currentData; // Keep it as is
            });
            await onDisconnect(roomRef).cancel();
            console.log(`[RTDB/Debug] cancelRoom transaction finished for rooms/${roomId}`);
        } catch (error) {
            console.error(`[RTDB] cancelRoom error:`, error);
        }
    },

    /**
     * Subscribes to room.
     */
    subscribeToRoom: (roomId: string, onUpdate: (data: RoomData) => void) => {
        const roomRef = ref(rtdb, `rooms/${roomId}`);
        const unsub = onValue(roomRef, (snap) => {
            if (snap.exists()) {
                const data = snap.val();
                console.log(`[RTDB] Room Updated: status = ${data.status}, player2 = ${data.player2 ? 'PRESENT' : 'NONE'}`);
                onUpdate(data);
            }
        });
        return () => unsub();
    },

    /**
     * High-precision Server Time Offset.
     */
    getServerTimeOffset: (onOffset: (offset: number) => void) => {
        const offsetRef = ref(rtdb, '.info/serverTimeOffset');
        const unsub = onValue(offsetRef, (snap) => onOffset(snap.val() || 0));
        return () => unsub();
    }
};
