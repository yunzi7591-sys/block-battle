/**
 * pvpGameActions.ts — placeBlockSync, tickTimer, reportDefeat, calculateRatingChange, processAITurn
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
import { findBestMove } from '../../game/aiPlayer';

// ─── AI Turn Guard (module-level) ───────────────────────
let _aiTurnInProgress = false;

/**
 * AI対戦モードのゲーム終了処理（ローカル完結）
 */
function handleAIGameOver(set: PvPSet, get: PvPGet, winnerUid: string, loserUid: string) {
    const state = get();
    if (state.isGameOver) return;

    const userUid = useUserStore.getState().uid;
    const isWin = winnerUid === userUid;

    let delta = 0;
    const currentRealRating = useUserStore.getState().rating;
    let newRating = currentRealRating;

    if (state.isRanked && !state.ratingApplied) {
        set({ rating: currentRealRating });
        delta = state.calculateRatingChange(isWin);
        newRating = currentRealRating + delta;
        useUserStore.getState().updateRating(newRating);
    }

    set({
        isGameOver: true,
        winner: winnerUid,
        status: 'finished',
        ratingChange: state.isRanked ? delta : null,
        rating: newRating,
        ratingApplied: true,
        isProcessingPlacement: false,
    });

    console.log(`[AI/GameOver] Winner: ${isWin ? 'PLAYER' : 'AI'}, Delta: ${delta}, New rating: ${newRating}`);
}

export function createPlaceBlockSync(set: PvPSet, get: PvPGet) {
    return async (index: number, row: number, col: number) => {
        const state = get();

        // ★ AIモードはローカル処理に分岐
        if (state.isAIMatch) {
            return handleAIModePlacement(set, get, index, row, col);
        }

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

                    // ★ クリアアニメーション中はリコンシリエーションを遅延
                    const applyReconciliation = () => {
                        try {
                            if (!get().isProcessingPlacement) {
                                gs.setBoard(serverBoard);
                                if (serverBlocks.filter(b => b !== null).length > 0) {
                                    gs.setBlocks(serverBlocks as BlockShape[]);
                                }
                                set({ sharedBoard: serverBoard, currentBlocks: serverBlocks });
                            }
                        } catch (err) {
                            console.warn("[PvP/Reconciliation] applyReconciliation error:", err);
                        }
                    };

                    if (gs.clearingCells && gs.clearingCells.length > 0) {
                        setTimeout(applyReconciliation, 150);
                    } else {
                        applyReconciliation();
                    }
                }).catch(err => {
                    console.warn("[PvP/Reconciliation] Failed to re-fetch room:", err);
                });
            }
        });
    };
}

/**
 * AIモードでのプレイヤー配置処理（Firebase不使用）
 */
async function handleAIModePlacement(set: PvPSet, get: PvPGet, index: number, row: number, col: number) {
    const state = get();
    const user = useUserStore.getState();

    if (state.status !== 'playing' || state.isGameOver || state.currentTurn !== user.uid) return;

    const shape = state.currentBlocks[index];
    if (!shape || !canPlace(state.sharedBoard, shape, row, col)) return;

    set({ isProcessingPlacement: true });
    playPlaceSound();

    // ビジュアル更新（gameStore経由でVFX発火）
    const gameStore = useGameStore.getState();
    gameStore.placeBlock(index, row, col);

    // 盤面更新
    const newBoard = placeBlock(state.sharedBoard, shape, row, col);
    const { newBoard: boardAfterClear, linesCleared } = clearLines(newBoard);

    if (linesCleared > 0) playClearSound(gameStore.comboCount);

    // ブロック状態更新
    const updatedBlocks: (BlockShape | null)[] = [...state.currentBlocks];
    updatedBlocks[index] = null;

    const nextPlacedCount = (state.placedCount || 0) + 1;
    const remainingBlocks = updatedBlocks.filter((b): b is BlockShape => b !== null);
    const canProceed = remainingBlocks.some(b => hasAnyValidPlacement(boardAfterClear, b));
    const isTurnEnding = nextPlacedCount >= 3 || !canProceed;

    if (!isTurnEnding) {
        // 中間配置: ターン継続
        set({
            sharedBoard: boardAfterClear,
            currentBlocks: updatedBlocks,
            placedCount: nextPlacedCount,
            pendingMoveCount: nextPlacedCount,
            isProcessingPlacement: false,
            preview: null,
        });
        return;
    }

    // 途中スタック → プレイヤー敗北
    if (nextPlacedCount < 3 && !canProceed) {
        set({ sharedBoard: boardAfterClear, currentBlocks: updatedBlocks, preview: null });
        handleAIGameOver(set, get, state.aiUid!, user.uid!);
        return;
    }

    // ★ ターン切替: プレイヤー → AI
    const nextTurnNumber = (state.turnNumber || 1) + 1;
    const newBlocks = generatePvPBlocks(boardAfterClear, nextTurnNumber);

    gameStore.setBoard(boardAfterClear);
    gameStore.setBlocks(newBlocks as BlockShape[]);
    gameStore.setIsMyTurn(false);

    set({
        sharedBoard: boardAfterClear,
        currentBlocks: newBlocks,
        currentTurn: state.aiUid!,
        turnStartTime: Date.now(),
        timeLeft: 30,
        placedCount: 0,
        turnNumber: nextTurnNumber,
        pendingMoveCount: 0,
        isProcessingPlacement: false,
        preview: null,
    });

    console.log(`[AI/TurnSwitch] Player turn ended. Switching to AI turn ${nextTurnNumber}.`);
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
                    if (state.isAIMatch) {
                        // AIタイムアウト → プレイヤー勝利
                        handleAIGameOver(set, get, user.uid, opponentUid);
                    } else {
                        LobbyService.reportGameOver(state.roomId, opponentUid, user.uid);
                    }
                }
            }
        }
    };
}

export function createReportDefeat(set: PvPSet, get: PvPGet) {
    return async () => {
        const state = get();
        if (state.isGameOver || !state.roomId) return;

        // ★ AIモード: ローカル処理
        if (state.isAIMatch) {
            const userUid = useUserStore.getState().uid || '';
            handleAIGameOver(set, get, state.aiUid!, userUid);
            return;
        }

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

        // ★ AIモード: ロック解除のみ
        if (state.isAIMatch) {
            console.log('[ForceResync/AI] AI mode — clearing locks only.');
            return;
        }

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

// ─── AI Turn Processing ─────────────────────────────────

export function createProcessAITurn(set: PvPSet, get: PvPGet) {
    return async () => {
        // 二重起動防止
        if (_aiTurnInProgress) return;
        _aiTurnInProgress = true;

        try {
            const state = get();
            if (!state.isAIMatch || state.isGameOver || state.currentTurn !== state.aiUid) {
                return;
            }

            console.log('[AI/Turn] AI turn started. Thinking...');

            let currentBoard = state.sharedBoard.map(r => [...r]);
            let currentBlocks: (BlockShape | null)[] = [...state.currentBlocks];
            let placedCount = 0;

            for (let i = 0; i < 3; i++) {
                // ゲーム終了 or ストアリセット済み（画面離脱）チェック
                const guard = get();
                if (guard.isGameOver || !guard.isAIMatch || guard.status === 'matching') return;

                // 最適手を探索
                const move = findBestMove(currentBoard, currentBlocks);
                if (!move) {
                    // AIスタック → プレイヤー勝利
                    console.log('[AI/Turn] AI is stuck. Player wins!');
                    const userUid = useUserStore.getState().uid!;
                    handleAIGameOver(set, get, userUid, state.aiUid!);
                    return;
                }

                // 「考えるフリ」ディレイ (1〜2秒)
                const thinkTime = 1000 + Math.random() * 1000;
                await new Promise(resolve => setTimeout(resolve, thinkTime));

                // ディレイ後の再チェック（画面離脱でreset()された場合もガード）
                const postDelay = get();
                if (postDelay.isGameOver || !postDelay.isAIMatch || postDelay.status === 'matching') return;

                // 手を適用
                const shape = currentBlocks[move.blockIndex]!;
                const newBoard = placeBlock(currentBoard, shape, move.row, move.col);
                const { newBoard: boardAfterClear, linesCleared } = clearLines(newBoard);

                currentBoard = boardAfterClear;
                currentBlocks[move.blockIndex] = null;
                placedCount++;

                // ビジュアル更新
                const gameStore = useGameStore.getState();
                gameStore.setBoard(boardAfterClear);

                // gameStoreのブロック表示を更新（null化されたブロックを反映）
                const blocksForDisplay: (BlockShape | null)[] = [
                    currentBlocks[0] ?? null,
                    currentBlocks[1] ?? null,
                    currentBlocks[2] ?? null,
                ];
                // setBlocks は 3要素を要求。null混在でもOK。
                gameStore.setBlocks(blocksForDisplay as BlockShape[]);

                set({
                    sharedBoard: boardAfterClear,
                    currentBlocks: blocksForDisplay,
                    placedCount: placedCount,
                });

                console.log(`[AI/Turn] AI placed block ${move.blockIndex} at (${move.row}, ${move.col}). Lines: ${linesCleared}`);

                // 途中スタック判定
                const remaining = currentBlocks.filter((b): b is BlockShape => b !== null);
                if (remaining.length > 0 && !remaining.some(b => hasAnyValidPlacement(boardAfterClear, b))) {
                    // AI途中スタック → プレイヤー勝利
                    console.log('[AI/Turn] AI stuck mid-turn. Player wins!');
                    const userUid = useUserStore.getState().uid!;
                    handleAIGameOver(set, get, userUid, state.aiUid!);
                    return;
                }
            }

            // AI 3ブロック配置完了 → プレイヤーターンへ
            const nextTurnNumber = (get().turnNumber || 1) + 1;
            const newBlocks = generatePvPBlocks(currentBoard, nextTurnNumber);

            const gameStore = useGameStore.getState();
            gameStore.setBoard(currentBoard);
            gameStore.setBlocks(newBlocks as BlockShape[]);
            gameStore.setIsMyTurn(true);
            gameStore.resetTurnState(newBlocks, currentBoard);

            const userUid = useUserStore.getState().uid!;

            set({
                sharedBoard: currentBoard,
                currentBlocks: newBlocks,
                currentTurn: userUid,
                turnStartTime: Date.now(),
                timeLeft: 30,
                placedCount: 0,
                turnNumber: nextTurnNumber,
                pendingMoveCount: 0,
                isProcessingPlacement: false,
            });

            console.log(`[AI/Turn] AI turn ended. Switching to player turn ${nextTurnNumber}.`);

            // プレイヤーが配置可能か確認
            const playerCanPlay = newBlocks.some(b => hasAnyValidPlacement(currentBoard, b));
            if (!playerCanPlay) {
                // プレイヤーの新ブロックが配置不可 → AI勝利
                setTimeout(() => {
                    if (!get().isGameOver) {
                        console.log('[AI/Turn] Player has no valid moves with new blocks. AI wins.');
                        handleAIGameOver(set, get, get().aiUid!, userUid);
                    }
                }, 500);
            }
        } finally {
            _aiTurnInProgress = false;
        }
    };
}
