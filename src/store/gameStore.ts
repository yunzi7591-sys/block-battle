import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { GameState, BlockShape, Board } from '../game/types';
import {
    createBoard,
    placeBlock as placeBlockFn,
    clearLines,
    getScore,
    hasAnyValidPlacement,
    findCellsToClear,
    canPlace,
} from '../game/board';
import { generateBlocks, generateBlocksAsync } from '../game/survivalAlgorithm';
import { ALL_BLOCKS } from '../game/blocks';
import { playBGM } from '../utils/sounds';
import { useUserStore } from './userStore';
import { apiService } from '../services/apiService';

interface BoardLayout {
    x: number;
    y: number;
    size: number;
    cellSize: number; // total space per cell including margins
}

interface PreviewState {
    shape: BlockShape;
    row: number;
    col: number;
}

interface GameStore extends GameState {
    boardLayout: BoardLayout | null;
    preview: PreviewState | null;
    clearingCells: [number, number][] | null;
    scoreEarned: number | null;
    showPerfectClear: boolean;
    lastLinesCleared: number; // 0, 1, 2, 3, 4
    isCrossClear: boolean;
    isPendingPerfect: boolean;
    isBgmPlaying: boolean;
    isPvP: boolean;
    lastAppliedMoveCount: number;
    isMyTurn: boolean;

    init: () => void;
    setBoard: (board: Board) => void;
    setBlocks: (blocks: BlockShape[]) => void;
    setBoardLayout: (layout: BoardLayout) => void;
    setPreview: (preview: PreviewState | null) => void;
    setPvPMode: (isPvP: boolean) => void;
    setIsMyTurn: (isMyTurn: boolean) => void;
    triggerRollback: (board: Board, blocks: BlockShape[], moveCount: number) => void;
    placeBlock: (blockIndex: number, row: number, col: number) => void;
    finishClear: () => void;
    resetPerfectClear: () => void;
    triggerBGM: () => void;
    setGameOver: (isGameOver: boolean) => void;
    resetTurnState: (blocks: (BlockShape | null)[], board?: Board) => void;
}

function makeInitialState() {
    const board = createBoard();
    const hospitalityEndTarget = Math.floor(Math.random() * 8) + 3;
    const blocks = generateBlocks(board, 0, hospitalityEndTarget);
    return {
        board,
        score: 0,
        comboCount: 0,
        currentBlocks: blocks as (BlockShape | null)[],
        placedFlags: [false, false, false] as boolean[],
        isGameOver: false,
        movesSinceLastClear: 0,
        isPerfectBonusTime: false,
        perfectClearCount: 0,
        hospitalityEndTarget,
        lastLinesCleared: 0,
        isCrossClear: false,
        isPendingPerfect: false,
        isPvP: false,
        lastAppliedMoveCount: 0,
        isMyTurn: true,
    };
}

let perfectClearTimer: ReturnType<typeof setTimeout> | null = null;

function checkGameOverState(
    board: Board,
    blocks: (BlockShape | null)[],
    flags: boolean[]
): boolean {
    const unplacedIndices = flags
        .map((f, i) => (!f && blocks[i] !== null ? i : -1))
        .filter(idx => idx !== -1);

    if (unplacedIndices.length === 0) return false; // All placed or null

    return unplacedIndices.every(idx => !hasAnyValidPlacement(board, blocks[idx] as BlockShape));
}

export const useGameStore = create<GameStore>()(subscribeWithSelector((set, get) => ({
    ...makeInitialState(),
    boardLayout: null,
    preview: null,
    clearingCells: null,
    scoreEarned: null,
    showPerfectClear: false,
    isBgmPlaying: false,

    init: () => {
        // 前回のperfectClearTimerが残留しないよう明示的にクリア
        if (perfectClearTimer) { clearTimeout(perfectClearTimer); perfectClearTimer = null; }
        playBGM();
        set({
            ...makeInitialState(),
            preview: null,
            clearingCells: null,
            scoreEarned: null,
            showPerfectClear: false,
            isBgmPlaying: true,
        });
    },

    setBoardLayout: (layout) => set({ boardLayout: layout }),
    setBoard: (board) => set({ board }),
    setBlocks: (blocks) => {
        const safeBlocks = Array.isArray(blocks)
            ? blocks
            : blocks ? Object.values(blocks) : [];

        // Phase 27 Guard: Always expect exactly 3 blocks (even if some are null)
        if (safeBlocks.length !== 3) {
            console.warn(`[gameStore] Blocked setBlocks with invalid count: ${safeBlocks.length}`);
            return;
        }

        const isFreshSet = safeBlocks.every(b => b !== null);

        set((state) => ({
            currentBlocks: safeBlocks as (BlockShape | null)[],
            placedFlags: safeBlocks.map(b => b === null),
            // Phase 38: If this is a fresh set (3 blocks), reset move count.
            lastAppliedMoveCount: isFreshSet ? 0 : state.lastAppliedMoveCount
        }));
    },
    setPreview: (preview) => set({ preview }),
    setPvPMode: (isPvP) => set({ isPvP }),
    setIsMyTurn: (isMyTurn) => set({ isMyTurn }),

    triggerRollback: (board, blocks, moveCount) => {
        set((state) => {
            console.warn(`[PvP/Reconciliation] ROLLBACK TRIGGERED: Server Count ${moveCount} vs Local ${state.lastAppliedMoveCount}`);
            return {
                board,
                currentBlocks: blocks as (BlockShape | null)[],
                placedFlags: blocks.map(b => b === null),
                lastAppliedMoveCount: moveCount,
                clearingCells: null,
                scoreEarned: null,
                preview: null
            };
        });
    },

    triggerBGM: () => {
        set((state) => {
            if (!state.isBgmPlaying) {
                playBGM();
                return { isBgmPlaying: true };
            }
            return state;
        });
    },

    // ─── placeBlock: VFX最優先 + DFS非同期化 ───────────────
    // generateBlocks (DFS) は同期 set() の外に追い出し、
    // JSスレッドを即座にReactレンダーに返す。
    placeBlock: (blockIndex, row, col) => {
        const state = get();
        const shape = state.currentBlocks[blockIndex];
        if (!shape || !canPlace(state.board, shape, row, col)) return;

        const newBoard = placeBlockFn(state.board, shape, row, col);
        const newFlags = [...state.placedFlags];
        newFlags[blockIndex] = true;
        const nextMoveCount = state.isPvP ? state.lastAppliedMoveCount + 1 : state.lastAppliedMoveCount;
        const cells = findCellsToClear(newBoard);
        const placementScore = (shape.cells.length * 5) + 10;

        // ─── Line Clear Path: VFX即発火 ─────────────────
        if (cells.length > 0) {
            const clearResult = clearLines(newBoard);
            const { linesCleared, isHorizontal, isVertical, newBoard: boardAfterClear } = clearResult;
            const newCombo = state.comboCount + 1;
            const isCross = isHorizontal && isVertical;

            let multiplier = 1.0;
            if (newCombo === 2) multiplier = 1.5;
            else if (newCombo === 3) multiplier = 2.0;
            else if (newCombo === 4) multiplier = 3.0;
            else if (newCombo >= 5) multiplier = 4.0;

            let clearEarned = getScore(linesCleared) * multiplier;
            if (isCross) clearEarned *= 2.0;
            const earned = placementScore + clearEarned;
            const willBePerfect = boardAfterClear.every(r => r.every(cell => cell === 0));

            // 同期 set: clearingCells をセットして即座にVFX描画へ
            set({
                board: newBoard,
                placedFlags: newFlags,
                clearingCells: cells,
                preview: null,
                comboCount: newCombo,
                scoreEarned: Math.floor(earned),
                showPerfectClear: false,
                lastLinesCleared: linesCleared,
                isCrossClear: isCross,
                isPendingPerfect: willBePerfect,
                lastAppliedMoveCount: nextMoveCount,
            });
            return; // ← JSスレッドを即解放。generateBlocks は走らない。
        }

        // ─── No Clear Path ──────────────────────────────
        const totalScore = state.score + placementScore;
        const nextMoves = state.movesSinceLastClear + 1;
        let nextCombo = state.comboCount;
        if (nextMoves > 3 && !state.isPerfectBonusTime) nextCombo = 0;

        const nextBlocks = [...state.currentBlocks];
        nextBlocks[blockIndex] = null;
        const allPlaced = newFlags.every(f => f);

        const userStore = useUserStore.getState();
        if (totalScore > userStore.highScore) userStore.updateHighScore(totalScore);

        if (allPlaced && !state.isPvP) {
            // ─── Phase 1: 即座にステート更新（DFS なし）────
            set({
                board: newBoard,
                score: totalScore,
                comboCount: nextCombo,
                movesSinceLastClear: nextMoves,
                currentBlocks: [null, null, null],
                placedFlags: [true, true, true],
                clearingCells: null,
                scoreEarned: null,
                preview: null,
                showPerfectClear: false,
                lastLinesCleared: 0,
                isCrossClear: false,
                isPendingPerfect: false,
                lastAppliedMoveCount: nextMoveCount,
            });

            // ─── Phase 2: DFS を非同期実行（JSスレッド解放後）────
            const pcCount = state.perfectClearCount;
            const hetTarget = state.hospitalityEndTarget;
            setTimeout(async () => {
                const refilled = await generateBlocksAsync(newBoard, pcCount, hetTarget, ALL_BLOCKS, totalScore);
                set({
                    currentBlocks: refilled as (BlockShape | null)[],
                    placedFlags: [false, false, false],
                    isGameOver: checkGameOverState(newBoard, refilled, [false, false, false]),
                });
            }, 0);
            return;
        }

        // ─── Not All Placed: 通常パス ───────────────────
        const gameOver = state.isPvP ? false : checkGameOverState(newBoard, nextBlocks, newFlags);
        set({
            board: newBoard,
            score: totalScore,
            comboCount: nextCombo,
            movesSinceLastClear: nextMoves,
            currentBlocks: nextBlocks,
            placedFlags: newFlags,
            isGameOver: gameOver,
            clearingCells: null,
            scoreEarned: null,
            preview: null,
            showPerfectClear: false,
            lastLinesCleared: 0,
            isCrossClear: false,
            isPendingPerfect: false,
            lastAppliedMoveCount: nextMoveCount,
        });
    },

    // ─── finishClear: DFS非同期化 ──────────────────────────
    // VFXアニメーション完了後に呼ばれる。
    // ボード更新は即座に、generateBlocks は非同期で実行。
    finishClear: () => {
        const state = get();
        if (!state.clearingCells || state.scoreEarned === null) return;

        const { newBoard } = clearLines(state.board);
        const newScore = state.score + state.scoreEarned;
        const userStore = useUserStore.getState();
        if (newScore > userStore.highScore) userStore.updateHighScore(newScore);

        const isPerfect = newBoard.every(r => r.every(cell => cell === 0));
        const newPcCount = isPerfect ? state.perfectClearCount + 1 : state.perfectClearCount;
        if (isPerfect) state.resetPerfectClear();

        const allPlaced = state.placedFlags.every(f => f);

        if (allPlaced && !state.isPvP) {
            // ─── Phase 1: 即座にボード更新 + VFXステートクリア ───
            set({
                board: newBoard,
                score: newScore,
                currentBlocks: [null, null, null],
                placedFlags: [true, true, true],
                clearingCells: null,
                scoreEarned: null,
                showPerfectClear: isPerfect,
                movesSinceLastClear: 0,
                isPerfectBonusTime: isPerfect,
                perfectClearCount: newPcCount,
                lastLinesCleared: 0,
                isCrossClear: false,
                isPendingPerfect: false,
            });

            // ─── Phase 2: DFS を非同期実行 ────────────────
            const hetTarget = state.hospitalityEndTarget;
            setTimeout(async () => {
                const refilled = await generateBlocksAsync(newBoard, newPcCount, hetTarget, ALL_BLOCKS, newScore);
                set({
                    currentBlocks: refilled as (BlockShape | null)[],
                    placedFlags: [false, false, false],
                    isGameOver: checkGameOverState(newBoard, refilled, [false, false, false]),
                });
            }, 0);
            return;
        }

        // ─── Not All Placed: 通常パス ───────────────────
        const nextBlocks = [...state.currentBlocks];
        const nextFlags = [...state.placedFlags];
        const gameOver = state.isPvP ? false : checkGameOverState(newBoard, nextBlocks, nextFlags);

        set({
            board: newBoard,
            score: newScore,
            currentBlocks: nextBlocks,
            placedFlags: nextFlags,
            isGameOver: gameOver,
            clearingCells: null,
            scoreEarned: null,
            showPerfectClear: isPerfect,
            movesSinceLastClear: 0,
            isPerfectBonusTime: isPerfect,
            perfectClearCount: newPcCount,
            lastLinesCleared: 0,
            isCrossClear: false,
            isPendingPerfect: false,
        });
    },
    // Auto-hide helper
    resetPerfectClear: () => {
        if (perfectClearTimer) clearTimeout(perfectClearTimer);
        perfectClearTimer = setTimeout(() => { set({ showPerfectClear: false }); perfectClearTimer = null; }, 2000);
    },

    setGameOver: (v) => set({ isGameOver: v }),

    resetTurnState: (blocks, board) => {
        const safeBlocks = Array.isArray(blocks) ? blocks : (blocks ? Object.values(blocks) : []);
        const boardToUse = board || get().board;
        set({
            currentBlocks: safeBlocks as (BlockShape | null)[],
            lastAppliedMoveCount: 0,
            preview: null,
            clearingCells: null,
            scoreEarned: null,
            showPerfectClear: false,
            isGameOver: get().isPvP ? false : checkGameOverState(boardToUse, safeBlocks as (BlockShape | null)[], safeBlocks.map(b => b === null))
        });
    }
})));
