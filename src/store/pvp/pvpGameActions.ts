/**
 * pvpGameActions.ts — placeBlockSync, tickTimer, reportDefeat, calculateRatingChange
 */
import { canPlace, placeBlock, clearLines, hasAnyValidPlacement } from '../../game/board';
import { BlockShape } from '../../game/types';
import { generatePvPBlocks } from '../../game/survivalAlgorithm';
import { LobbyService, RoomData, normalizeBlocks, normalizeBoard } from '../../services/LobbyService';
import { handleRoomSync, handleGameCompletion } from './pvpListenerSync';
import { ref, get as dbGet } from 'firebase/database';
import { rtdb } from '../../config/firebase';
import { useUserStore } from '../userStore';
import { useGameStore } from '../gameStore';
import { playPlaceSound, playClearSound } from '../../utils/sounds';
import { PvPSet, PvPGet } from './pvpTypes';

export function createPlaceBlockSync(set: PvPSet, get: PvPGet) {
    return async (index: number, row: number, col: number) => {
        const state = get();
        const user = useUserStore.getState();
        if (state.status !== 'playing' || state.isGameOver || state.currentTurn !== user.uid) {
            console.warn(`[PvP/placeBlockSync] Guard rejected.`);
            return;
        }

        const shape = state.currentBlocks[index];
        if (!shape || !canPlace(state.sharedBoard, shape, row, col)) {
            console.warn(`[PvP/placeBlockSync] Block/Board guard rejected.`);
            return;
        }

        set({ isProcessingPlacement: true });

        // SFX: 配置音
        playPlaceSound();

        console.log(`[PvP/Optimistic] Placing block ${index} locally...`);
        const gameStore = useGameStore.getState();
        gameStore.placeBlock(index, row, col);

        const nextPendingCount = state.pendingMoveCount + 1;
        set({
            pendingMoveCount: nextPendingCount,
            lastOptimisticMoveTime: Date.now(),
        });

        const newBoard = placeBlock(state.sharedBoard, shape, row, col);
        const { newBoard: boardAfterClear, linesCleared } = clearLines(newBoard);
        set({ sharedBoard: boardAfterClear, preview: null });

        // SFX: ライン消去音
        if (linesCleared > 0) {
            playClearSound(gameStore.comboCount);
        }

        // ─── 次ターンブロック生成判定 ────────────────────
        // 配置後の手札を計算: 今置いた index を null にした状態
        const updatedBlocks = [...state.currentBlocks];
        updatedBlocks[index] = null;
        const remainingBlocks = updatedBlocks.filter((b): b is BlockShape => b !== null);
        const canProceed = remainingBlocks.some(b => hasAnyValidPlacement(boardAfterClear, b));
        const isTurnEnding = nextPendingCount >= 3 || !canProceed;

        // ターン終了時: DFS で次ターンのブロックを事前生成（トランザクション外）
        let preGenBlocks: BlockShape[] | undefined;
        if (isTurnEnding && nextPendingCount >= 3) {
            const nextTurnNumber = (state.turnNumber || 1) + 1;
            preGenBlocks = generatePvPBlocks(boardAfterClear, nextTurnNumber);
            console.log(`[PvP/PreGen] Generated ${preGenBlocks.length} blocks for turn ${nextTurnNumber}`);
        }

        LobbyService.makeMove(
            state.roomId!,
            user.uid!,
            index,
            row,
            col,
            boardAfterClear,
            preGenBlocks
        ).then(success => {
            if (!success) console.error("[PvP/Sync] makeMove failed.");
        }).catch(err => {
            console.error("[PvP/Sync] makeMove threw:", err);
        }).finally(() => {
            set({ isProcessingPlacement: false });

            const currentState = get();
            if (currentState.roomId && !currentState.isGameOver) {
                const roomRef = ref(rtdb, `rooms/${currentState.roomId}`);
                dbGet(roomRef).then(snap => {
                    if (!snap.exists()) return;
                    const roomData = snap.val() as RoomData;
                    const serverBoard = normalizeBoard(roomData.board);
                    const serverBlocks = normalizeBlocks(roomData.currentBlocks);
                    const gs = useGameStore.getState();

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
    };
}

export function createTickTimer(set: PvPSet, get: PvPGet) {
    return () => {
        const state = get();
        const user = useUserStore.getState();
        if (state.status !== 'playing' || state.isGameOver || !state.turnStartTime) return;
        if (state.isProcessingPlacement) return;

        const now = Date.now() + state.serverTimeOffset;
        const elapsed = now - state.turnStartTime;
        const remaining = Math.max(-10, Math.ceil((state.turnDuration - elapsed) / 1000));

        if (remaining !== state.timeLeft && remaining >= 0) {
            set({ timeLeft: remaining });
        }

        if (remaining <= 0 && elapsed > 0) {
            if (state.currentTurn === user.uid) {
                if (!state.isProcessingPlacement) {
                    const now = Date.now();
                    if (now - state.lastTimeoutReportTime > 5000) {
                        console.warn(`[Timer] My timeout detected. Reporting defeat.`);
                        get().reportDefeat();
                        set({ lastTimeoutReportTime: now });
                    }
                } else {
                    if (state.timeLeft > 0) set({ timeLeft: 0 });
                }
            } else if (remaining <= -5) {
                const opponentUid = state.currentTurn;
                if (opponentUid && user.uid && state.roomId) {
                    LobbyService.reportGameOver(state.roomId, opponentUid, user.uid);
                }
            }
        }
    };
}

export function createReportDefeat(set: PvPSet, get: PvPGet) {
    return async () => {
        const state = get();
        if (state.isGameOver || !state.roomId) return;
        try {
            const user = useUserStore.getState();
            const roomRef = ref(rtdb, `rooms/${state.roomId}`);
            const snapshot = await dbGet(roomRef);
            if (!snapshot.exists()) return;
            const roomData = snapshot.val() as RoomData;

            const winnerUid = state.isHost
                ? roomData.player2?.uid
                : roomData.player1.uid;

            if (winnerUid && user.uid) {
                await LobbyService.reportGameOver(state.roomId, user.uid, winnerUid);
            }
        } catch (error) {
            console.error('[Store] reportDefeat Error:', error);
        }
    };
}

export function createCalculateRatingChange(get: PvPGet) {
    return (win: boolean): number => {
        const { rating, opponentRating, isRanked } = get();
        if (!isRanked) return 0;
        const K = 32;
        const actualScore = win ? 1 : 0;
        const expectedScore = 1 / (1 + Math.pow(10, (opponentRating - rating) / 400));
        return Math.round(K * (actualScore - expectedScore));
    };
}

export function createForceResync(set: PvPSet, get: PvPGet) {
    return async () => {
        const state = get();
        // 即座にロック解除
        set({ isProcessingPlacement: false });

        if (!state.roomId || state.isGameOver) {
            console.log('[ForceResync] No active room or game over. Skipping.');
            return;
        }

        try {
            const roomRef = ref(rtdb, `rooms/${state.roomId}`);
            const snapshot = await dbGet(roomRef);
            if (!snapshot.exists()) {
                console.warn('[ForceResync] Room no longer exists.');
                return;
            }

            const roomData = snapshot.val() as RoomData;
            const user = useUserStore.getState();

            // 試合終了チェック
            if (roomData.isFinished && roomData.winner && !state.isGameOver) {
                handleGameCompletion(set, get, roomData, user);
            } else if (roomData.status === 'playing') {
                handleRoomSync(set, get, roomData, user);
            }

            // 再度ロック解除を保証（handleRoomSync内で変わる可能性）
            set({ isProcessingPlacement: false });
            console.log('[ForceResync] Re-synced from Firebase successfully.');
        } catch (err) {
            console.error('[ForceResync] Failed:', err);
            // エラー時もロック解除
            set({ isProcessingPlacement: false });
        }
    };
}
