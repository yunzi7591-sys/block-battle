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
    createdAt: number;
    winner?: string; // UID
    loser?: string;  // UID
    isFinished?: boolean;

    // Phase 19: Turn-based shared board
    board: Board;
    currentTurn: string; // UID
    currentBlocks: (BlockShape | null)[];
    placedCount: number; // 0, 1, 2
    turnStartTime: any; // Server Timestamp
    turnDuration: number; // 30000ms
    lastMove?: LastMove;
}

/**
 * Normalize Firebase RTDB sparse object/array into a proper 3-element array.
 * Firebase deletes keys set to null, turning [A, null, B] into {0: A, 2: B}.
 * This restores it to [A, null, B] with guaranteed length 3.
 */
function normalizeBlocks(raw: any): (BlockShape | null)[] {
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
     * Creates a new match room in RTDB.
     */
    createRoom: async (player1: PlayerInfo, isPrivate: boolean = false): Promise<string> => {
        console.log(`[RTDB/Diag] createRoom invoked. Auth: ${auth.currentUser?.uid || 'NONE'}`);
        const roomsRef = ref(rtdb, 'rooms');
        const newRoomRef = push(roomsRef);
        const roomId = newRoomRef.key!;

        // Initial board and blocks
        const initialBoard = Array.from({ length: 8 }, () => Array(8).fill(0));
        const initialBlocks = generatePvPBlocks(initialBoard);

        const roomData: RoomData = {
            status: 'waiting',
            player1,
            isPrivate,
            createdAt: Date.now(),
            isFinished: false,
            board: initialBoard,
            currentTurn: player1.uid,
            currentBlocks: initialBlocks,
            placedCount: 0,
            turnStartTime: serverTimestamp(),
            turnDuration: 30000
        };

        await onDisconnect(newRoomRef).remove();
        await set(newRoomRef, roomData);
        console.log(`[RTDB/Path] Created Room at: rooms/${roomId}`);
        return roomId;
    },

    /**
     * Atomically executes a move and handles turn turnover.
     * Optimized: Use 'update' for moves 1-2, and 'runTransaction' for move 3 (turn switch).
     */
    makeMove: async (roomId: string, uid: string, index: number, row: number, col: number, nextBoard: Board): Promise<boolean> => {
        const roomRef = ref(rtdb, `rooms/${roomId}`);

        try {
            // 1. Fetch current status to decide between 'update' (fast) and 'transaction' (safe switch)
            const snapshot = await get(roomRef);
            if (!snapshot.exists()) return false;
            const currentData = snapshot.val() as RoomData;

            // Basic Guards
            if (currentData.currentTurn !== uid || currentData.isFinished) return false;

            // CRITICAL: Normalize sparse Firebase object into proper 3-element array
            const blocks = normalizeBlocks(currentData.currentBlocks);
            if (!blocks[index]) {
                console.warn(`[Lobby/Move] Block at index ${index} is null/undefined. Aborting.`);
                return false;
            }

            const nextPlacedCount = (currentData.placedCount || 0) + 1;
            const nextBlocks = [...blocks];
            nextBlocks[index] = null;

            const remainingBlocks = nextBlocks.filter((b): b is BlockShape => b != null);
            const canProceed = remainingBlocks.some(b => hasAnyValidPlacement(nextBoard, b));
            const isTurnEnding = nextPlacedCount >= 3 || !canProceed;

            if (!isTurnEnding) {
                // PHASE 36 OPTIMIZATION: Use 'update' for intermediate moves (Low Latency)
                console.log(`[Lobby/Move] Intermediate move (${nextPlacedCount}/3). Using fast update.`);
                const updates: any = {};
                updates[`board`] = nextBoard;
                updates[`currentBlocks/${index}`] = null;
                updates[`placedCount`] = nextPlacedCount;
                updates[`lastMove`] = { uid, index, row, col, timestamp: Date.now() };

                await update(roomRef, updates);
                return true;
            } else {
                // PHASE 36: Use 'runTransaction' for Turn Switch (Atomic Consistency)
                console.log(`[Lobby/Move] Final move (${nextPlacedCount}/3) or No Moves Left. Using transaction to switch turns.`);
                const result = await runTransaction(roomRef, (data: RoomData | null) => {
                    if (!data) return;
                    if (data.currentTurn !== uid || data.isFinished) return;

                    data.board = nextBoard;

                    // CRITICAL: Normalize sparse Firebase blocks before mutation
                    data.currentBlocks = normalizeBlocks(data.currentBlocks);
                    data.currentBlocks[index] = null;
                    data.placedCount = 0; // Reset for next turn
                    data.lastMove = { uid, index, row, col, timestamp: Date.now() };

                    // Turn Switch Logic
                    const player1Uid = data.player1.uid;
                    const player2Uid = data.player2?.uid || "";
                    const nextTurnUid = data.currentTurn === player1Uid ? player2Uid : player1Uid;

                    console.log(`[Lobby/Turn] Switching from ${data.currentTurn} to ${nextTurnUid}`);
                    data.currentTurn = nextTurnUid;

                    // Generate new blocks for next turn (guaranteed proper 3-element array)
                    const newBlocks = generatePvPBlocks(data.board);
                    if (!newBlocks || newBlocks.length !== 3) {
                        console.error(`[Lobby/Turn] generatePvPBlocks returned invalid result: ${JSON.stringify(newBlocks)}`);
                        return; // Abort transaction
                    }
                    data.currentBlocks = newBlocks;
                    data.turnStartTime = serverTimestamp();

                    return data;
                });
                return result.committed;
            }
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
            const initialBlocks = generatePvPBlocks(initialBoard);

            const updates: Partial<RoomData> = {
                status: 'playing',
                board: initialBoard,
                currentBlocks: initialBlocks,
                currentTurn: myUid, // Explicitly use my current UID (Host)
                placedCount: 0,
                turnStartTime: serverTimestamp(),
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

            // Find the first room that is Public (Self-match filtering REMOVED for testing)
            const validRoomId = roomIds.find(key => {
                const room = rooms[key];
                return !room.isPrivate;
                // && room.player1.uid !== myUid; // REMOVED FOR TESTING
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
