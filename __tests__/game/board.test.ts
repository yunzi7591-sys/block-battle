import { createBoard, canPlace, placeBlock, clearLines, getScore } from '../../src/game/board';
import { Dot, Line3H, Square2x2 } from '../../src/game/blocks';

describe('board logic', () => {
    it('createBoard should return an 8x8 empty board', () => {
        const board = createBoard();
        expect(board.length).toBe(8);
        expect(board[0].length).toBe(8);
        expect(board.every(row => row.every(cell => cell === 0))).toBe(true);
    });

    it('canPlace should allow valid placements on empty board', () => {
        const board = createBoard();
        expect(canPlace(board, Square2x2, 0, 0)).toBe(true);
        expect(canPlace(board, Line3H, 7, 5)).toBe(true);
    });

    it('canPlace should reject out of bounds placement', () => {
        const board = createBoard();
        expect(canPlace(board, Square2x2, 7, 7)).toBe(false); // extends to row 8, col 8
        expect(canPlace(board, Line3H, 0, 6)).toBe(false); // extends to col 8
        expect(canPlace(board, Dot, -1, 0)).toBe(false);
    });

    it('canPlace should reject overlapping placement', () => {
        let board = createBoard();
        board = placeBlock(board, Square2x2, 2, 2);
        expect(canPlace(board, Dot, 2, 2)).toBe(false);
        expect(canPlace(board, Dot, 3, 3)).toBe(false);
        expect(canPlace(board, Dot, 4, 4)).toBe(true); // outside 2x2
    });

    it('placeBlock should be immutable and place correctly', () => {
        const board = createBoard();
        const newBoard = placeBlock(board, Dot, 3, 3);

        expect(board[3][3]).toBe(0); // original unmodified
        expect(newBoard[3][3]).toBe(Dot.color || '#4DA8DA'); // new board modified
    });

    it('clearLines should clear full rows and columns', () => {
        let board = createBoard();
        // Fill row 2
        for (let c = 0; c < 8; c++) board[2][c] = 'C';
        // Fill col 5
        for (let r = 0; r < 8; r++) board[r][5] = 'C';

        const { newBoard, linesCleared } = clearLines(board);

        expect(linesCleared).toBe(2);
        // Row 2 should be empty now
        expect(newBoard[2].every(cell => cell === 0)).toBe(true);
        // Col 5 should be empty now
        expect(newBoard.every(row => row[5] === 0)).toBe(true);
    });

    it('getScore should calculate score based on lines', () => {
        expect(getScore(0)).toBe(0);
        expect(getScore(1)).toBe(1000); // 1 * 1000 = 1000
        expect(getScore(2)).toBe(2000); // 2 * 1000 = 2000
    });
});
