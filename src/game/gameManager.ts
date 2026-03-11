import { Board, BlockShape, GameState } from './types';
import { createBoard, placeBlock, clearLines, getScore, hasAnyValidPlacement } from './board';
import { generateBlocks } from './survivalAlgorithm';

export function initGame(): GameState {
    const initialBoard = createBoard();
    const initialBlocks = generateBlocks(initialBoard);

    return {
        board: initialBoard,
        score: 0,
        comboCount: 0,
        currentBlocks: initialBlocks,
        placedFlags: [false, false, false],
        isGameOver: false,
        movesSinceLastClear: 0,
        isPerfectBonusTime: false,
        perfectClearCount: 0,
        hospitalityEndTarget: Math.floor(Math.random() * 8) + 3,
    };
}

export function selectAndPlaceBlock(
    state: GameState,
    blockIndex: number, // 0, 1, or 2
    row: number,
    col: number
): GameState {
    if (state.isGameOver) return state;
    if (state.placedFlags[blockIndex]) return state;

    const shape = state.currentBlocks[blockIndex];
    if (!shape) return state;

    // Try to place. This will throw if invalid. (UI should prevent invalid drops)
    let newBoard = placeBlock(state.board, shape, row, col);

    // Clear lines
    const { newBoard: clearedBoard, linesCleared } = clearLines(newBoard);
    newBoard = clearedBoard;

    const newScore = state.score + getScore(linesCleared);

    const newPlacedFlags = [...state.placedFlags];
    newPlacedFlags[blockIndex] = true;

    // Create new state
    return {
        ...state,
        board: newBoard,
        score: newScore,
        comboCount: linesCleared > 0 ? state.comboCount + 1 : state.comboCount,
        placedFlags: newPlacedFlags,
    };
}

export function checkAndRefill(state: GameState): GameState {
    if (state.isGameOver) return state;

    const allPlaced = state.placedFlags.every(flag => flag === true);
    if (!allPlaced) return state;

    // Refill
    const newBlocks = generateBlocks(state.board);
    return {
        ...state,
        currentBlocks: newBlocks,
        placedFlags: [false, false, false],
    };
}

export function checkGameOver(state: GameState): GameState {
    if (state.isGameOver) return state;

    // Game is over if NONE of the UNPLACED blocks can be placed anywhere on the board.
    let canPlaceAny = false;
    for (let i = 0; i < 3; i++) {
        if (!state.placedFlags[i]) {
            const shape = state.currentBlocks[i];
            if (shape && hasAnyValidPlacement(state.board, shape)) {
                canPlaceAny = true;
                break;
            }
        }
    }

    if (!canPlaceAny) {
        return {
            ...state,
            isGameOver: true,
        };
    }

    return state;
}

// A helper for a full turn
export function processTurn(
    state: GameState,
    blockIndex: number,
    row: number,
    col: number
): GameState {
    let nextState = selectAndPlaceBlock(state, blockIndex, row, col);
    nextState = checkAndRefill(nextState);
    nextState = checkGameOver(nextState);
    return nextState;
}
