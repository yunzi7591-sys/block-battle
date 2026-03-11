import { create } from 'zustand';
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
import { generateBlocks } from '../game/survivalAlgorithm';
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
    blocks: BlockShape[],
    flags: boolean[]
): boolean {
    const isGameOver = flags.every((f, i) => f || !hasAnyValidPlacement(board, blocks[i]));

    if (isGameOver) {
        console.log('[GameOver Audit] Survival Impossible Check:');
        blocks.forEach((b, i) => {
            if (!flags[i]) {
                console.log(` - Block [${b.id}] (${b.color}): No valid placements found on 8x8 board.`);
            } else {
                console.log(` - Block [${b.id}]: Already placed.`);
            }
        });
    }

    return isGameOver;
}

export const useGameStore = create<GameStore>((set) => ({
    ...makeInitialState(),
    boardLayout: null,
    preview: null,
    clearingCells: null,
    scoreEarned: null,
    showPerfectClear: false,
    isBgmPlaying: false,

    init: () => {
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

        set({
            currentBlocks: safeBlocks as (BlockShape | null)[],
            placedFlags: safeBlocks.map(b => b === null)
        });
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

    // Phase 1: Place block, detect lines, set clearingCells if any
    placeBlock: (blockIndex, row, col) =>
        set((state) => {
            const shape = state.currentBlocks[blockIndex];
            if (!shape || !canPlace(state.board, shape, row, col)) {
                console.warn(`[StoreSafety] Blocking invalid placeBlock in gameStore at (${row}, ${col})`);
                return state;
            }
            const newBoard = placeBlockFn(state.board, shape, row, col);
            console.log(`[StoreDebug] placeBlock executed for block ${blockIndex} at (${row}, ${col}). Board updated.`);
            const newFlags = [...state.placedFlags];
            newFlags[blockIndex] = true;

            // Increment move count for sequence tracking (Phase 21)
            const nextMoveCount = state.isPvP ? state.lastAppliedMoveCount + 1 : state.lastAppliedMoveCount;

            // Check for lines to clear
            const cells = findCellsToClear(newBoard);

            const placementScore = (shape.cells.length * 5) + 10;

            if (cells.length > 0) {
                // Determine lines cleared and calculate score (single call)
                const clearResult = clearLines(newBoard);
                const { linesCleared, isHorizontal, isVertical, newBoard: boardAfterClear } = clearResult;
                const newCombo = state.comboCount + 1;
                const isCross = isHorizontal && isVertical;

                // --- Progressive Multiplier Logic ---
                // 1: 1.0x, 2: 1.5x, 3: 2.0x, 4: 3.0x, 5+: 4.0x
                let multiplier = 1.0;
                if (newCombo === 2) multiplier = 1.5;
                else if (newCombo === 3) multiplier = 2.0;
                else if (newCombo === 4) multiplier = 3.0;
                else if (newCombo >= 5) multiplier = 4.0;

                // Base score boost (1000 per line = score(linesCleared) is a helper but let's assume its existing logic)
                let clearEarned = getScore(linesCleared) * multiplier;

                // CROSS CLEAR Bonus: 2.0x buff
                if (isCross) clearEarned *= 2.0;

                const earned = placementScore + clearEarned;

                // Check perfect clear using already-computed cleared board
                const willBePerfect = boardAfterClear.every(row => row.every(cell => cell === 0));

                return {
                    ...state,
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
                };
            }

            // No lines → proceed immediately (Add placement score to total score)
            const allPlaced = newFlags.every((f) => f);
            const totalScore = state.score + placementScore;
            const nextMoves = state.movesSinceLastClear + 1;
            let nextCombo = state.comboCount;
            if (nextMoves > 3 && !state.isPerfectBonusTime) {
                nextCombo = 0;
            }

            const nextBlocks = [...state.currentBlocks];
            nextBlocks[blockIndex] = null;
            let nextFlags = newFlags;

            if (allPlaced && !state.isPvP) {
                const refilled = generateBlocks(newBoard, state.perfectClearCount, state.hospitalityEndTarget);
                return {
                    ...state,
                    board: newBoard,
                    score: totalScore,
                    comboCount: nextCombo,
                    movesSinceLastClear: nextMoves,
                    currentBlocks: refilled as (BlockShape | null)[],
                    placedFlags: [false, false, false],
                    isGameOver: checkGameOverState(newBoard, refilled, [false, false, false]),
                };
            }

            // CRITICAL: Check game over AFTER refill/reset if it happened
            const filteredBlocks = (nextBlocks.filter(b => b !== null) as BlockShape[]);
            const gameOver = state.isPvP ? false : checkGameOverState(newBoard, filteredBlocks, nextFlags);

            const userStore = useUserStore.getState();
            if (totalScore > userStore.highScore) {
                userStore.updateHighScore(totalScore);
                if (userStore.uid) {
                    apiService.updateUserData(userStore.uid, { highScore: totalScore }).catch(() => { });
                }
            }

            return {
                ...state,
                board: newBoard,
                score: totalScore,
                comboCount: nextCombo,
                movesSinceLastClear: nextMoves,
                currentBlocks: nextBlocks,
                placedFlags: nextFlags,
                isGameOver: gameOver,
                clearingCells: null,
                scoreEarned: null,
                preview: null,
                showPerfectClear: false,
                lastLinesCleared: 0,
                isCrossClear: false,
                isPendingPerfect: false,
                lastAppliedMoveCount: nextMoveCount,
            };
        }),

    // Phase 2: Called after clear animation finishes
    finishClear: () =>
        set((state) => {
            if (!state.clearingCells || state.scoreEarned === null) return state;

            const { newBoard } = clearLines(state.board);
            const newScore = state.score + state.scoreEarned;
            const userStore = useUserStore.getState();

            if (newScore > userStore.highScore) {
                userStore.updateHighScore(newScore);
                // Background Sync
                if (userStore.uid) {
                    apiService.updateUserData(userStore.uid, { highScore: newScore }).catch(() => { });
                }
            }

            const allPlaced = state.placedFlags.every((f) => f);
            let nextBlocks = [...state.currentBlocks];
            let nextFlags = [...state.placedFlags];

            const isPerfect = newBoard.every(row => row.every(cell => cell === 0));
            const newPcCount = isPerfect ? state.perfectClearCount + 1 : state.perfectClearCount;

            if (isPerfect) {
                state.resetPerfectClear();
            }

            if (allPlaced && !state.isPvP) {
                const refilled = generateBlocks(newBoard, newPcCount, state.hospitalityEndTarget);
                nextBlocks = refilled as (BlockShape | null)[];
                nextFlags = [false, false, false];
            }

            // CRITICAL: Check game over AFTER refill/reset if it happened
            const filteredBlocks = (nextBlocks.filter(b => b !== null) as BlockShape[]);
            const gameOver = state.isPvP ? false : checkGameOverState(newBoard, filteredBlocks, nextFlags);

            return {
                ...state,
                board: newBoard,
                score: newScore,
                currentBlocks: nextBlocks,
                placedFlags: nextFlags,
                isGameOver: gameOver,
                clearingCells: null,
                scoreEarned: null,
                showPerfectClear: isPerfect,
                movesSinceLastClear: 0, // Reset moves on clearing lines
                isPerfectBonusTime: isPerfect ? true : false, // Reset bonus time unless we just hit another perfect
                perfectClearCount: newPcCount,
                lastLinesCleared: 0, // Reset after processing in view
                isCrossClear: false, // Reset
                isPendingPerfect: false,
            };
        }),
    // Auto-hide helper
    resetPerfectClear: () => {
        if (perfectClearTimer) clearTimeout(perfectClearTimer);
        perfectClearTimer = setTimeout(() => { set({ showPerfectClear: false }); perfectClearTimer = null; }, 2000);
    },
}));
