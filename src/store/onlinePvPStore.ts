import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { Board, BlockShape } from '../game/types';
import { createBoard, placeBlock, clearLines, canPlace, hasAnyValidPlacement } from '../game/board';
import { useUserStore } from './userStore';
import { LobbyService, PlayerInfo, RoomData, normalizeBlocks, normalizeBoard } from '../services/LobbyService';
import { ref, get as dbGet } from 'firebase/database';
import { rtdb } from '../config/firebase';
import { apiService } from '../services/apiService';
import { useGameStore } from './gameStore';

interface OnlinePvPState {
    roomId: string | null;
    isHost: boolean;
    sharedBoard: Board;
    myPlayerNumber: number; // 1 or 2
    currentBlocks: (BlockShape | null)[];
    timeLeft: number;
    isGameOver: boolean;
    winner: string | null; // UID
    status: 'matching' | 'playing' | 'finished';
    isMatching: boolean;
    matchingLocked: boolean;
    boardLayout: { x: number, y: number, size: number, cellSize: number } | null;
    preview: { shape: BlockShape, row: number, col: number } | null;
    player1: PlayerInfo | null;
    player2: PlayerInfo | null;

    // Phase 19: Turn-based & Sync
    currentTurn: string | null; // UID
    placedCount: number;
    turnStartTime: number | null;
    turnDuration: number;
    serverTimeOffset: number;
    lastMove: { row: number, col: number, uid: string } | null;
    pendingMoveCount: number; // Tracks optimistic moves (Phase 21)

    // Rating & Elo
    rating: number;
    opponentRating: number;
    ratingChange: number | null;
    isRanked: boolean;
    lastOptimisticMoveTime: number; // Phase 21 Debug

    // Actions
    createRoom: (isPrivate?: boolean, isRanked?: boolean) => void;
    joinRoom: (id: string) => Promise<boolean>;
    startAutoMatch: () => void;
    cancelAutoMatch: () => void;
    placeBlockSync: (index: number, row: number, col: number) => void;
    tickTimer: () => void;
    setBoardLayout: (layout: any) => void;
    setPreview: (preview: any) => void;
    reset: () => void;
    handleDisconnect: () => void;
    calculateRatingChange: (win: boolean) => number;
    reportDefeat: () => void;

    // Internal Cleanup
    _unsubscribeRoom: (() => void) | null;
    _subscribedRoomId: string | null; // Phase 25: Singleton Listener
    isProcessingPlacement: boolean; // Phase 34: Lock timer during placement
    lastTimeoutReportTime: number; // Phase 36: Suppress rapid-fire timeout reports
}

export const useOnlinePvPStore = create<OnlinePvPState>()(subscribeWithSelector((set, get) => ({
    roomId: null,
    isHost: false,
    sharedBoard: createBoard(),
    myPlayerNumber: 0,
    currentBlocks: [],
    timeLeft: 30,
    isGameOver: false,
    winner: null,
    status: 'matching',
    isMatching: false,
    matchingLocked: false,
    boardLayout: null,
    preview: null,
    player1: null,
    player2: null,
    rating: useUserStore.getState().rating,
    opponentRating: 1500,
    ratingChange: null,
    isRanked: false,
    lastOptimisticMoveTime: 0,
    _unsubscribeRoom: null,
    _subscribedRoomId: null,

    currentTurn: null,
    placedCount: 0,
    turnStartTime: null,
    turnDuration: 30000,
    serverTimeOffset: 0,
    lastMove: null,
    pendingMoveCount: 0,
    isProcessingPlacement: false,
    lastTimeoutReportTime: 0,

    createRoom: async (isPrivate: boolean = true, isRanked: boolean = false) => {
        const user = useUserStore.getState();
        const playerInfo: PlayerInfo = {
            uid: user.uid!,
            name: user.userName,
            rate: user.rating,
        };

        const id = await LobbyService.createRoom(playerInfo, isPrivate, isRanked);
        set({ roomId: id, isHost: true, myPlayerNumber: 1, status: 'matching', isRanked });

        // Phase 25: Guard against double subscription
        const state = get();
        if (state._subscribedRoomId === id) return;
        if (state._unsubscribeRoom) state._unsubscribeRoom();

        // Listen for Updates (Guest Join & Win/Sync)
        const unsub = LobbyService.subscribeToRoom(id, (roomData: RoomData) => {
            set({
                player1: roomData.player1,
                player2: roomData.player2 || null,
                isRanked: !!roomData.isRanked
            });
            const state = get();
            const user = useUserStore.getState();

            // 1. Handle Guest Join & Start Game (Host Driven)
            if (roomData.status === 'waiting' && roomData.player2 && !state.matchingLocked) {
                console.log(`[Store] Guest ${roomData.player2.uid} detected. Host starting game...`);
                LobbyService.startGame(id);
                set({
                    isMatching: false,
                    matchingLocked: true,
                    opponentRating: roomData.player2.rate,
                    status: 'playing' // Host sets local status to playing immediately
                });
            }

            // Normalize currentBlocks (Firebase may return object instead of array)
            const blocksRaw = roomData.currentBlocks;
            const blocksArray = Array.isArray(blocksRaw)
                ? blocksRaw
                : blocksRaw ? Object.values(blocksRaw) : [];

            // 2. SYNC Shared State (Phase 19)
            if (roomData.status === 'playing' || roomData.status === 'finished') {
                const gameStore = useGameStore.getState();

                // Ensure PvP mode is set in gameStore (prevents solo-mode refill/gameOver)
                if (!gameStore.isPvP) gameStore.setPvPMode(true);

                // Phase 27/29: Turn Synchronization
                // Phase 21/22: Reconciliation (Moved up for use in Turn Reset)
                const serverMoveCount = roomData.placedCount || 0;
                const serverBoard = normalizeBoard(roomData.board);
                const serverBlocks = normalizeBlocks(roomData.currentBlocks);

                const currentUid = (user.uid || "").trim();
                const serverTurnUid = (roomData.currentTurn || "").trim();

                // Phase 38: Guard against partial room updates (Flicker prevention)
                if (!serverTurnUid && roomData.status === 'playing') {
                    console.log("[PvP/Guard] Skipping sync due to empty serverTurnUid in playing room.");
                    return;
                }

                const isMyTurn = currentUid === serverTurnUid;

                // Phase 38: Robust Turn Change Detection
                const prevTurnUid = state.currentTurn;
                const turnChanged = prevTurnUid !== null && prevTurnUid !== serverTurnUid;

                if (turnChanged) {
                    console.log(`[PvP/Turn] Turn transition detected: ${prevTurnUid} -> ${serverTurnUid}`);
                    // 1. Release PvP locks
                    set({
                        pendingMoveCount: 0,
                        isProcessingPlacement: false,
                        lastOptimisticMoveTime: 0
                    });

                    // 2. FORCE gameStore Reset (Wipes stale placedFlags/counts using fresh server blocks)
                    gameStore.resetTurnState(serverBlocks);
                }

                // Push Turn status to gameStore (Authority for Drag/UI)
                gameStore.setIsMyTurn(isMyTurn);

                // Phase 37: Turn-Transition-Aware Guard
                const isFreshTurn = serverMoveCount === 0 &&
                    serverBlocks.every(b => b !== null);

                // Phase 36: Absolute Guard (Strong Authority Protection)
                const localPlacedCount = gameStore.placedFlags.filter(f => f).length;
                // CRITICAL: If we are in the middle of a local move (localPlacedCount > serverMoveCount),
                // we must protect our optimistic state even if the server thinks it's a "Fresh Turn" (echo lag).
                const isActivelyPlaying = isMyTurn &&
                    (state.isProcessingPlacement || localPlacedCount > serverMoveCount);

                let shouldSyncData = false;

                if (turnChanged) {
                    // ALWAYS sync on turn UID change to avoid stale UI
                    shouldSyncData = true;
                } else if (isFreshTurn) {
                    // Sync on fresh turn start (unless we ALREADY made a move locally)
                    shouldSyncData = !isActivelyPlaying;
                    if (isActivelyPlaying) {
                        console.log("[PvP/Guard] Sync suppressed during Fresh Turn: Local move already in progress.");
                    }
                } else if (!isMyTurn) {
                    shouldSyncData = true;
                } else if (isActivelyPlaying) {
                    shouldSyncData = false;
                    console.log("[PvP/Guard] Active placement detected. Ignoring server echo.");
                } else {
                    shouldSyncData = true;
                }

                // Sync board and blocks (only when safe to do so)
                const incomingBlocks = serverBlocks;
                const incomingCount = incomingBlocks.filter(b => b !== null).length;

                if (shouldSyncData && incomingCount > 0 && incomingCount <= 3) {
                    // CRITICAL: Ensure gameStore and sharedBoard use the SAME object reference to avoid mismatch
                    gameStore.setBoard(serverBoard);
                    if (incomingBlocks.length === 3) {
                        gameStore.setBlocks(incomingBlocks as BlockShape[]);
                    }

                    set({
                        sharedBoard: serverBoard,
                        currentBlocks: incomingBlocks,
                        pendingMoveCount: serverMoveCount
                    });
                    console.log(`[PvP/Sync] Store synced with Server (Count: ${incomingCount}, Turn: ${serverTurnUid}, Fresh: ${isFreshTurn})`);
                }

                // CRITICAL: Always trust server status.
                set({
                    currentTurn: serverTurnUid,
                    placedCount: serverMoveCount,
                    turnStartTime: roomData.turnStartTime || null,
                    status: roomData.status,
                    lastMove: roomData.lastMove ? { row: roomData.lastMove.row, col: roomData.lastMove.col, uid: roomData.lastMove.uid } : null
                });

                // Check for local defeat (No moves at start of turn)
                if (isMyTurn && !state.isGameOver && roomData.status === 'playing') {
                    const usableBlocks = serverBlocks.filter(b => b !== null) as BlockShape[];
                    const canMove = usableBlocks.some(b => hasAnyValidPlacement(serverBoard, b));
                    if (!canMove && usableBlocks.length > 0) {
                        console.log("[Store] Stuck detected. Reporting defeat...");

                        const myUid = user.uid || "";
                        const opponentUid = roomData.player1.uid === myUid ? (roomData.player2?.uid || "") : roomData.player1.uid;

                        if (opponentUid) {
                            LobbyService.reportGameOver(id, myUid, opponentUid).then(success => {
                                if (success) {
                                    console.log("[PvP/GameOver] Defeat synced with RTDB via listener.");
                                    set({ status: 'finished', isGameOver: true, winner: opponentUid });
                                }
                            });
                        }
                    }
                }
            }

            // 3. Handle Game Completion
            if (roomData.status === 'finished' && roomData.winner && !state.isGameOver) {
                const isWin = roomData.winner === user.uid;
                const isRankedMatch = !!roomData.isRanked; // Authority from server

                let delta = 0;
                let newRating = state.rating;

                if (isRankedMatch) {
                    delta = state.calculateRatingChange(isWin);
                    newRating = state.rating + delta;
                }

                set({
                    isGameOver: true,
                    winner: roomData.winner,
                    status: 'finished',
                    ratingChange: isRankedMatch ? delta : null,
                    rating: newRating,
                    isRanked: isRankedMatch
                });

                // Phase 42: Rating is now calculated server-side by Cloud Functions.
                // calculateRatingChange is kept for provisional UI display only.
                // Do NOT call useUserStore.updateRating() here.
                console.log(`[PvP/Rating] Game finished. Delta (UI only): ${delta}. Server will update rating.`);
            }
        });

        const timeUnsub = LobbyService.getServerTimeOffset((offset) => set({ serverTimeOffset: offset }));
        set({
            _unsubscribeRoom: () => { unsub(); timeUnsub(); },
            _subscribedRoomId: id
        });
    },

    joinRoom: async (id: string) => {
        set({ matchingLocked: true, isMatching: true });
        const user = useUserStore.getState();
        const playerInfo: PlayerInfo = {
            uid: user.uid!,
            name: user.userName,
            rate: user.rating,
        };

        const success = await LobbyService.joinRoom(id, playerInfo);
        if (success) {
            set({ roomId: id, isHost: false, myPlayerNumber: 2, isMatching: false, status: 'matching' });

            const state = get();
            if (state._subscribedRoomId === id) return true;
            if (state._unsubscribeRoom) state._unsubscribeRoom();

            const unsub = LobbyService.subscribeToRoom(id, (roomData: RoomData) => {
                set({
                    player1: roomData.player1,
                    player2: roomData.player2 || null,
                    isRanked: !!roomData.isRanked
                });
                const state = get();
                const user = useUserStore.getState();

                if (roomData.status === 'playing' || roomData.status === 'finished') {
                    // Normalize currentBlocks (Firebase may return object instead of array)
                    const blocksRaw = roomData.currentBlocks;
                    const blocksArray = Array.isArray(blocksRaw)
                        ? blocksRaw
                        : blocksRaw ? Object.values(blocksRaw) : [];

                    const gameStore = useGameStore.getState();

                    // Ensure PvP mode is set in gameStore
                    if (!gameStore.isPvP) gameStore.setPvPMode(true);

                    // Phase 27/29: Guest-side Guard & Turn Sync
                    const currentUid = (user.uid || "").trim();
                    const serverTurnUid = (roomData.currentTurn || "").trim();

                    if (!serverTurnUid && roomData.status === 'playing') return;

                    const isMyTurn = currentUid === serverTurnUid;
                    gameStore.setIsMyTurn(isMyTurn);

                    // Reconciliation Logic (Moved up)
                    const serverMoveCount = roomData.placedCount || 0;
                    const serverBoard = normalizeBoard(roomData.board);
                    const serverBlocks = normalizeBlocks(roomData.currentBlocks);

                    // Phase 38: Robust Turn Change Detection
                    const prevTurnUid = state.currentTurn;
                    const turnChanged = prevTurnUid !== null && prevTurnUid !== serverTurnUid;

                    if (turnChanged) {
                        console.log(`[PvP/Turn/Guest] Turn transition detected: ${prevTurnUid} -> ${serverTurnUid}`);
                        set({
                            pendingMoveCount: 0,
                            isProcessingPlacement: false,
                            lastOptimisticMoveTime: 0
                        });
                        gameStore.resetTurnState(serverBlocks);
                    }

                    // Phase 37: Turn-Transition-Aware Guard
                    const isFreshTurn = serverMoveCount === 0 &&
                        serverBlocks.every(b => b !== null);

                    const localPlacedCount = gameStore.placedFlags.filter(f => f).length;
                    const isActivelyPlaying = isMyTurn &&
                        (state.isProcessingPlacement || localPlacedCount > serverMoveCount);

                    let shouldSyncData = false;

                    if (turnChanged) {
                        shouldSyncData = true;
                    } else if (isFreshTurn) {
                        shouldSyncData = !isActivelyPlaying;
                        if (isActivelyPlaying) {
                            console.log("[PvP/Guard/Guest] Sync suppressed during Fresh Turn: Local move already in progress.");
                        }
                    } else if (!isMyTurn) {
                        shouldSyncData = true;
                    } else if (isActivelyPlaying) {
                        shouldSyncData = false;
                        console.log("[PvP/Guard] Active placement detected. Ignoring server echo.");
                    } else {
                        shouldSyncData = true;
                    }

                    // Force sync if server is significantly ahead (Safety Rollback)
                    if (isMyTurn && serverMoveCount > state.pendingMoveCount + 1) {
                        shouldSyncData = true;
                        console.warn("[PvP/Sync] Server move count significantly ahead. Forcing sync.");
                    }

                    // Block sync guard
                    const incomingBlocks = serverBlocks;
                    const incomingCount = incomingBlocks.filter(b => b !== null).length;

                    if (shouldSyncData && incomingCount > 0 && incomingCount <= 3) {
                        gameStore.setBoard(serverBoard);
                        if (incomingBlocks.length === 3) {
                            gameStore.setBlocks(incomingBlocks as BlockShape[]);
                        }

                        const syncUpdate: any = {
                            sharedBoard: serverBoard,
                            currentBlocks: incomingBlocks,
                            pendingMoveCount: serverMoveCount
                        };
                        if (get().pendingMoveCount === 0) {
                            syncUpdate.lastOptimisticMoveTime = 0;
                        }
                        set(syncUpdate);
                        console.log(`[PvP/Sync/Guest] Store synced (Count: ${incomingCount}, Fresh: ${isFreshTurn})`);
                    }

                    // CRITICAL: Always trust server status.
                    set({
                        currentTurn: serverTurnUid,
                        placedCount: serverMoveCount,
                        turnStartTime: roomData.turnStartTime || null,
                        opponentRating: roomData.player1.rate,
                        status: roomData.status,
                        lastMove: roomData.lastMove ? { row: roomData.lastMove.row, col: roomData.lastMove.col, uid: roomData.lastMove.uid } : null
                    });

                    if (isMyTurn && !state.isGameOver && roomData.status === 'playing') {
                        const usableBlocks = blocksArray.filter(b => b !== null) as BlockShape[];
                        const canMove = usableBlocks.some(b => hasAnyValidPlacement(serverBoard, b));
                        if (!canMove && usableBlocks.length > 0) {
                            get().reportDefeat();
                        }
                    }
                }

                if (roomData.isFinished && roomData.winner && !state.isGameOver) {
                    const isWin = roomData.winner === user.uid;
                    const isRankedMatch = !!roomData.isRanked;

                    let delta = 0;
                    let newRating = state.rating;

                    if (isRankedMatch) {
                        delta = state.calculateRatingChange(isWin);
                        newRating = state.rating + delta;
                    }

                    set({
                        isGameOver: true,
                        winner: roomData.winner,
                        status: 'finished',
                        ratingChange: isRankedMatch ? delta : null,
                        rating: newRating,
                        isRanked: isRankedMatch
                    });

                    // Phase 42: Rating is now calculated server-side by Cloud Functions.
                    // Do NOT call useUserStore.updateRating() here.
                    console.log(`[PvP/Rating/Guest] Game finished. Delta (UI only): ${delta}. Server will update rating.`);
                }
            });

            const timeUnsub = LobbyService.getServerTimeOffset((offset) => set({ serverTimeOffset: offset }));
            set({
                _unsubscribeRoom: () => { unsub(); timeUnsub(); },
                _subscribedRoomId: id
            });
            return true;
        } else {
            console.warn(`[Store] joinRoom failed: Transaction not committed.`);
            set({ matchingLocked: false, isMatching: false });
            return false;
        }
    },

    startAutoMatch: async () => {
        const myUid = useUserStore.getState().uid;
        console.log(`[Store] startAutoMatch initiated. My UID: ${myUid}`);

        set({ isMatching: true, matchingLocked: false, roomId: null, isRanked: true });

        const existingRoomId = await LobbyService.findPublicRoom();
        if (existingRoomId) {
            const success = await get().joinRoom(existingRoomId);
            if (!success) {
                console.log(`[Store] joinRoom failed. Waiting 3s before allowing retry...`);
                // Wait 3 seconds to prevent rapid-fire retries that flood logs
                await new Promise(resolve => setTimeout(resolve, 3000));
                set({ isMatching: false });
            }
        } else {
            await get().createRoom(false, true);
        }
    },

    cancelAutoMatch: async () => {
        const state = get();
        // Phase 25 Guard: Never cancel if we are playing or in game screen
        if (state.matchingLocked || state.status === 'playing') {
            console.log("[Store] cancelAutoMatch blocked: Game already in progress.");
            return;
        }
        if (state.roomId) await LobbyService.cancelRoom(state.roomId);
        if (state._unsubscribeRoom) {
            state._unsubscribeRoom();
            set({ _unsubscribeRoom: null, _subscribedRoomId: null });
        }
        set({ isMatching: false, roomId: null, status: 'matching', isHost: false });
    },

    placeBlockSync: async (index: number, row: number, col: number) => {
        const state = get();
        const user = useUserStore.getState();
        if (state.status !== 'playing' || state.isGameOver || state.currentTurn !== user.uid) {
            console.warn(`[PvP/placeBlockSync] Guard rejected: status=${state.status}, isGameOver=${state.isGameOver}, currentTurn=${state.currentTurn}, uid=${user.uid}`);
            return;
        }

        const shape = state.currentBlocks[index];
        if (!shape || !canPlace(state.sharedBoard, shape, row, col)) {
            console.warn(`[PvP/placeBlockSync] Block/Board guard rejected: hasShape=${!!shape}, index=${index}, sharedBoard matches gameStore=${state.sharedBoard === useGameStore.getState().board}`);
            return;
        }

        // --- PHASE 40: Hardened Placement Lock ---
        // Setting this before ANY other state change ensures observers are locked out immediately.
        set({ isProcessingPlacement: true });

        console.log(`[PvP/Optimistic] Placing block ${index} locally...`);
        const gameStore = useGameStore.getState();

        // 1. Update Local gameStore immediately (Zero lag)
        gameStore.placeBlock(index, row, col);

        // 2. Increment pending move count
        const nextPendingCount = state.pendingMoveCount + 1;
        set({
            pendingMoveCount: nextPendingCount,
            lastOptimisticMoveTime: Date.now()
        });

        // 3. Calculate the board state after line clears (needed for Firebase)
        const newBoard = placeBlock(state.sharedBoard, shape, row, col);
        const { newBoard: boardAfterClear } = clearLines(newBoard);

        // 5. Update local sharedBoard reference (Optimistic)
        set({ sharedBoard: boardAfterClear, preview: null });

        // 4. Fire-and-forget Firebase move (Background)
        LobbyService.makeMove(
            state.roomId!,
            user.uid!,
            index,
            row,
            col,
            boardAfterClear
        ).then(success => {
            if (!success) {
                console.error("[PvP/Sync] makeMove failed. Triggering reconciliation.");
            }
        }).catch(err => {
            console.error("[PvP/Sync] makeMove threw:", err);
        }).finally(() => {
            // CRITICAL: Always release placement lock, even on error
            set({ isProcessingPlacement: false });

            // Phase 42: Reconciliation — re-fetch server state to fix any desync
            const currentState = get();
            if (currentState.roomId && !currentState.isGameOver) {
                const roomRef = ref(rtdb, `rooms/${currentState.roomId}`);
                dbGet(roomRef).then(snap => {
                    if (!snap.exists()) return;
                    const roomData = snap.val() as RoomData;
                    const serverBoard = normalizeBoard(roomData.board);
                    const serverBlocks = normalizeBlocks(roomData.currentBlocks);
                    const gs = useGameStore.getState();

                    // Only force-sync if we're NOT actively placing (lock already released)
                    if (!get().isProcessingPlacement) {
                        gs.setBoard(serverBoard);
                        if (serverBlocks.filter(b => b !== null).length > 0) {
                            gs.setBlocks(serverBlocks as BlockShape[]);
                        }
                        set({ sharedBoard: serverBoard, currentBlocks: serverBlocks });
                        console.log("[PvP/Reconciliation] State re-synced from server after makeMove.");
                    }
                }).catch(err => {
                    console.warn("[PvP/Reconciliation] Failed to re-fetch room:", err);
                });
            }
        });
    },

    tickTimer: () => {
        const state = get();
        const user = useUserStore.getState();
        if (state.status !== 'playing' || state.isGameOver || !state.turnStartTime) return;

        // Phase 34: Lock timer while move is being sent to Firebase
        if (state.isProcessingPlacement) return;

        // HIGH PRECISION SYNC
        const now = Date.now() + state.serverTimeOffset;
        const elapsed = (now - state.turnStartTime);
        const remaining = Math.max(-10, Math.ceil((state.turnDuration - elapsed) / 1000));

        // Periodic detailed log (every 2 seconds roughly)
        if (state.timeLeft % 2 === 0 && remaining !== state.timeLeft) {
            console.log(`LOG [Timer] Evaluating timeout: elapsed=${(elapsed / 1000).toFixed(1)}s, turnStartTime=${state.turnStartTime}, isMyTurn=${state.currentTurn === user.uid}`);
        }

        if (remaining !== state.timeLeft && remaining >= 0) {
            set({ timeLeft: remaining });
        }

        // AUTO-TIMEOUT DEFEAT (+ Anti-cheat)
        if (remaining <= 0 && elapsed > 0) {
            if (state.currentTurn === user.uid) {
                // Phase 36: Refined Timeout Suppression
                // We ONLY suppress defeat if a Move is actively being processed in the background.
                // If the player is just idling (even if they placed 1-2 blocks), the timer must expire.
                if (!state.isProcessingPlacement) {
                    const now = Date.now();
                    if (now - state.lastTimeoutReportTime > 5000) {
                        console.warn(`[Timer] My timeout detected. Reporting defeat. (Processing: false)`);
                        get().reportDefeat();
                        set({ lastTimeoutReportTime: now });
                    }
                } else {
                    // Still processing a move: Gracefully wait for Firebase result
                    if (state.timeLeft > 0) {
                        console.log("[Timer] Timeout reached but suppressed due to active processing.");
                        set({ timeLeft: 0 });
                    }
                }
            } else if (remaining <= -5) {
                // Opponent timeout + buffer: Claim victory
                console.log("[Store] Host/Opponent timeout (Anti-cheat). Claiming victory...");
                const opponentUid = state.currentTurn;
                if (opponentUid && user.uid && state.roomId) {
                    LobbyService.reportGameOver(state.roomId, opponentUid, user.uid);
                }
            }
        } else if (elapsed < -5000) {
            // Significant future-timestamp detected (Server clock mismatch)
            console.warn(`[Store/Timer] Future timestamp detected (elapsed: ${elapsed}). Skipping defeat evaluation.`);
        }
    },

    setBoardLayout: (layout) => set({ boardLayout: layout }),
    setPreview: (preview) => set({ preview }),

    calculateRatingChange: (win: boolean) => {
        const { rating, opponentRating, isRanked } = get();
        if (!isRanked) return 0;
        const K = 32;
        const actualScore = win ? 1 : 0;
        const expectedScore = 1 / (1 + Math.pow(10, (opponentRating - rating) / 400));
        const delta = Math.round(K * (actualScore - expectedScore));
        return delta;
    },

    reportDefeat: async () => {
        const state = get();
        if (state.isGameOver || !state.roomId) return;
        try {
            const user = useUserStore.getState();
            const roomRef = ref(rtdb, `rooms/${state.roomId}`);
            const snapshot = await dbGet(roomRef);
            if (!snapshot.exists()) return;
            const roomData = snapshot.val() as RoomData;

            // Winner is the one WHO IS NOT MOVING currently if it's my turn
            const winnerUid = state.isHost ? roomData.player2?.uid : roomData.player1.uid;

            if (winnerUid && user.uid) {
                await LobbyService.reportGameOver(state.roomId, user.uid, winnerUid);
            }
        } catch (error) {
            console.error('[Store] reportDefeat Error:', error);
        }
    },

    reset: () => {
        const state = get();
        // Phase 25: Protect active session during screen transitions
        if (state.status === 'playing') {
            console.log("[Store] reset blocked: Keeping active PvP session.");
            return;
        }
        if (state._unsubscribeRoom) state._unsubscribeRoom();
        set({
            roomId: null,
            isHost: false,
            sharedBoard: createBoard(),
            myPlayerNumber: 0,
            currentBlocks: [],
            timeLeft: 30,
            isGameOver: false,
            winner: null,
            status: 'matching',
            isMatching: false,
            matchingLocked: false,
            boardLayout: null,
            preview: null,
            player1: null,
            player2: null,
            ratingChange: null,
            isRanked: false,
            _unsubscribeRoom: null,
            currentTurn: null,
            placedCount: 0,
            turnStartTime: null,
            turnDuration: 30000,
            serverTimeOffset: 0,
            lastMove: null,
            opponentRating: 1500,
        });
    },

    handleDisconnect: () => {
        set({ status: 'finished', isGameOver: true, winner: null, ratingChange: 0 });
    }
})));

// Phase 39: Observer for Defeat Reporting (Secondary Guard)
useGameStore.subscribe(
    (state) => state.isGameOver,
    (isGameOver) => {
        if (isGameOver) {
            const pvpStore = useOnlinePvPStore.getState();
            if (pvpStore.roomId && pvpStore.status === 'playing') {
                const userUid = useUserStore.getState().uid || "";
                if (pvpStore.currentTurn === userUid) {
                    // PHASE 40 Guard: If we are already processing a placement, 
                    // trust that the LobbyService transaction will handle the outcome.
                    if (pvpStore.isProcessingPlacement) {
                        console.log("[PvP/GameOver] Suppressing reporting during active placement. Service handles atomicity.");
                        return;
                    }
                    console.log("[PvP/GameOver] Defeat detected via store observer. Reporting...");
                    pvpStore.reportDefeat();
                }
            }
        }
    }
);
