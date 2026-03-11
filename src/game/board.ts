import { Board, BlockShape } from './types';

export const BOARD_SIZE = 8;

export function createBoard(): Board {
    return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
}

export function canPlace(board: Board, shape: BlockShape, row: number, col: number): boolean {
    if (!shape || !shape.cells) return false;
    for (const [rOff, cOff] of shape.cells) {
        const targetRow = row + rOff;
        const targetCol = col + cOff;

        // Bounds check
        if (targetRow < 0 || targetRow >= BOARD_SIZE || targetCol < 0 || targetCol >= BOARD_SIZE) {
            console.log(`[canPlace] Reject (OOB): (${targetRow}, ${targetCol}) for base (${row}, ${col})`);
            return false;
        }

        // Overlap check
        if (board[targetRow][targetCol] !== 0) {
            console.log(`[canPlace] Reject (Overlap): (${targetRow}, ${targetCol}) for base (${row}, ${col})`);
            return false;
        }
    }
    console.log(`[canPlace] Result: true for base (${row}, ${col})`);
    return true;
}

export function placeBlock(board: Board, shape: BlockShape, row: number, col: number): Board {
    if (!canPlace(board, shape, row, col)) {
        console.warn(`[StoreSafety] Silent block in placeBlock at (${row}, ${col}). Overlap or OOB detected.`);
        return board; // Silent safety return
    }

    // Deep clone for immutability
    const newBoard = board.map(r => [...r]);

    for (const [rOff, cOff] of shape.cells) {
        newBoard[row + rOff][col + cOff] = shape.color || '#4DA8DA'; // default if missing
    }

    return newBoard;
}

export function clearLines(board: Board): { newBoard: Board; linesCleared: number; isHorizontal: boolean; isVertical: boolean } {
    const newBoard = board.map(r => [...r]);
    const rowsToClear = new Set<number>();
    const colsToClear = new Set<number>();

    // Check rows
    for (let r = 0; r < BOARD_SIZE; r++) {
        let full = true;
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (newBoard[r][c] === 0) {
                full = false;
                break;
            }
        }
        if (full) rowsToClear.add(r);
    }

    // Check cols
    for (let c = 0; c < BOARD_SIZE; c++) {
        let full = true;
        for (let r = 0; r < BOARD_SIZE; r++) {
            if (newBoard[r][c] === 0) {
                full = false;
                break;
            }
        }
        if (full) colsToClear.add(c);
    }

    // Clear them
    for (const r of rowsToClear) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            newBoard[r][c] = 0;
        }
    }

    for (const c of colsToClear) {
        for (let r = 0; r < BOARD_SIZE; r++) {
            newBoard[r][c] = 0;
        }
    }

    const linesCleared = rowsToClear.size + colsToClear.size;
    return {
        newBoard,
        linesCleared,
        isHorizontal: rowsToClear.size > 0,
        isVertical: colsToClear.size > 0
    };
}

export function getScore(linesCleared: number): number {
    if (linesCleared === 0) return 0;
    // Base score boost: 1 line = 1000 points base
    const baseLineScore = 1000;
    return linesCleared * baseLineScore;
}

export function hasAnyValidPlacement(board: Board, shape: BlockShape): boolean {
    if (!shape || !shape.cells) {
        console.warn('[hasAnyValidPlacement] Received null/invalid shape. Returning false.');
        return false;
    }
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (canPlace(board, shape, r, c)) {
                return true;
            }
        }
    }
    return false;
}

export function findCellsToClear(board: Board): [number, number][] {
    const rowsToClear = new Set<number>();
    const colsToClear = new Set<number>();

    for (let r = 0; r < BOARD_SIZE; r++) {
        if (board[r].every(cell => cell !== 0)) rowsToClear.add(r);
    }

    for (let c = 0; c < BOARD_SIZE; c++) {
        let full = true;
        for (let r = 0; r < BOARD_SIZE; r++) {
            if (board[r][c] === 0) { full = false; break; }
        }
        if (full) colsToClear.add(c);
    }

    const cells: [number, number][] = [];
    for (const r of rowsToClear) {
        for (let c = 0; c < BOARD_SIZE; c++) cells.push([r, c]);
    }
    for (const c of colsToClear) {
        for (let r = 0; r < BOARD_SIZE; r++) {
            if (!rowsToClear.has(r)) cells.push([r, c]);
        }
    }
    return cells;
}
