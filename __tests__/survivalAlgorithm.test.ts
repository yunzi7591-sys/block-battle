/**
 * survivalAlgorithm.test.ts — Core game logic tests
 *
 * Tests: board.ts (createBoard, canPlace, placeBlock, clearLines, getScore, hasAnyValidPlacement)
 *        survivalAlgorithm.ts (canSurvive, findAllPlacements, getIslands, generateBlocks)
 */
import { createBoard, canPlace, placeBlock, clearLines, getScore, hasAnyValidPlacement, BOARD_SIZE, findCellsToClear } from '../src/game/board';
import { canSurvive, findAllPlacements, getIslands, generateBlocks } from '../src/game/survivalAlgorithm';
import { Board, BlockShape } from '../src/game/types';

// ─── Helper Blocks ──────────────────────────────────────

const DOT: BlockShape = { id: 'Dot', cells: [[0, 0]], color: '#FFF' };
const LINE2H: BlockShape = { id: 'Line2H', cells: [[0, 0], [0, 1]], color: '#FFF' };
const LINE3H: BlockShape = { id: 'Line3H', cells: [[0, 0], [0, 1], [0, 2]], color: '#FFF' };
const SQUARE2: BlockShape = { id: 'Square2x2', cells: [[0, 0], [0, 1], [1, 0], [1, 1]], color: '#FFF' };
const LINE8H: BlockShape = { id: 'Line8H', cells: Array.from({ length: 8 }, (_, i) => [0, i] as [number, number]), color: '#FFF' };

/** Fill an entire row with a color */
function fillRow(board: Board, row: number, color: string = '#AAA'): Board {
    const b = board.map(r => [...r]);
    for (let c = 0; c < BOARD_SIZE; c++) b[row][c] = color;
    return b;
}

/** Fill an entire column with a color */
function fillCol(board: Board, col: number, color: string = '#AAA'): Board {
    const b = board.map(r => [...r]);
    for (let r = 0; r < BOARD_SIZE; r++) b[r][col] = color;
    return b;
}

// ═══════════════════════════════════════════════════════════
// board.ts Tests
// ═══════════════════════════════════════════════════════════

describe('board.ts', () => {
    describe('createBoard', () => {
        it('creates an 8x8 board filled with 0', () => {
            const board = createBoard();
            expect(board.length).toBe(8);
            board.forEach(row => {
                expect(row.length).toBe(8);
                row.forEach(cell => expect(cell).toBe(0));
            });
        });

        it('rows are independent (no shared references)', () => {
            const board = createBoard();
            board[0][0] = '#FFF';
            expect(board[1][0]).toBe(0);
        });
    });

    describe('canPlace', () => {
        it('allows placement on empty board', () => {
            expect(canPlace(createBoard(), SQUARE2, 0, 0)).toBe(true);
            expect(canPlace(createBoard(), SQUARE2, 6, 6)).toBe(true);
        });

        it('rejects out-of-bounds placement', () => {
            expect(canPlace(createBoard(), SQUARE2, 7, 7)).toBe(false);
            expect(canPlace(createBoard(), LINE3H, 0, 6)).toBe(false);
            expect(canPlace(createBoard(), DOT, -1, 0)).toBe(false);
        });

        it('rejects placement on occupied cells', () => {
            const board = placeBlock(createBoard(), DOT, 0, 0);
            expect(canPlace(board, DOT, 0, 0)).toBe(false);
        });

        it('returns false for null/invalid shapes', () => {
            expect(canPlace(createBoard(), null as any, 0, 0)).toBe(false);
            expect(canPlace(createBoard(), { id: 'bad', cells: null as any, color: '#F' }, 0, 0)).toBe(false);
        });
    });

    describe('placeBlock', () => {
        it('places block and returns new board', () => {
            const board = createBoard();
            const result = placeBlock(board, DOT, 3, 3);
            expect(result[3][3]).toBe('#FFF');
            // Original unmodified
            expect(board[3][3]).toBe(0);
        });

        it('returns same board reference if placement invalid', () => {
            const board = createBoard();
            const filled = placeBlock(board, DOT, 0, 0);
            const result = placeBlock(filled, DOT, 0, 0);
            expect(result).toBe(filled);
        });

        it('uses default color when block has no color', () => {
            const noColor: BlockShape = { id: 'nc', cells: [[0, 0]], color: '' };
            const result = placeBlock(createBoard(), noColor, 0, 0);
            // placeBlock uses shape.color || '#4DA8DA'
            expect(result[0][0]).toBe('#4DA8DA');
        });
    });

    describe('clearLines', () => {
        it('clears a full row', () => {
            const board = fillRow(createBoard(), 0);
            const { newBoard, linesCleared, isHorizontal, isVertical } = clearLines(board);
            expect(linesCleared).toBe(1);
            expect(isHorizontal).toBe(true);
            expect(isVertical).toBe(false);
            newBoard[0].forEach(cell => expect(cell).toBe(0));
        });

        it('clears a full column', () => {
            const board = fillCol(createBoard(), 0);
            const { newBoard, linesCleared, isHorizontal, isVertical } = clearLines(board);
            expect(linesCleared).toBe(1);
            expect(isHorizontal).toBe(false);
            expect(isVertical).toBe(true);
            for (let r = 0; r < BOARD_SIZE; r++) expect(newBoard[r][0]).toBe(0);
        });

        it('clears cross (row + col simultaneously)', () => {
            let board = fillRow(createBoard(), 3);
            board = fillCol(board, 3);
            const { linesCleared, isHorizontal, isVertical } = clearLines(board);
            expect(linesCleared).toBe(2);
            expect(isHorizontal).toBe(true);
            expect(isVertical).toBe(true);
        });

        it('returns 0 lines cleared on empty board', () => {
            const { linesCleared } = clearLines(createBoard());
            expect(linesCleared).toBe(0);
        });
    });

    describe('getScore', () => {
        it('returns 0 for 0 lines', () => expect(getScore(0)).toBe(0));
        it('returns 1000 per line', () => {
            expect(getScore(1)).toBe(1000);
            expect(getScore(3)).toBe(3000);
        });
    });

    describe('hasAnyValidPlacement', () => {
        it('returns true on empty board for any shape', () => {
            expect(hasAnyValidPlacement(createBoard(), DOT)).toBe(true);
            expect(hasAnyValidPlacement(createBoard(), SQUARE2)).toBe(true);
        });

        it('returns false on completely filled board', () => {
            const full: Board = Array.from({ length: 8 }, () => Array(8).fill('#F'));
            expect(hasAnyValidPlacement(full, DOT)).toBe(false);
        });

        it('returns false for null shape', () => {
            expect(hasAnyValidPlacement(createBoard(), null as any)).toBe(false);
        });
    });

    describe('findCellsToClear', () => {
        it('finds cells in a full row', () => {
            const board = fillRow(createBoard(), 2);
            const cells = findCellsToClear(board);
            expect(cells.length).toBe(8);
            cells.forEach(([r, _c]) => expect(r).toBe(2));
        });

        it('returns empty for no clears', () => {
            expect(findCellsToClear(createBoard())).toEqual([]);
        });
    });
});

// ═══════════════════════════════════════════════════════════
// survivalAlgorithm.ts Tests
// ═══════════════════════════════════════════════════════════

describe('survivalAlgorithm.ts', () => {
    describe('findAllPlacements', () => {
        it('DOT can be placed on all 64 cells of empty board', () => {
            const placements = findAllPlacements(createBoard(), DOT);
            expect(placements.length).toBe(64);
        });

        it('SQUARE2 has 49 placements on empty board (7x7)', () => {
            const placements = findAllPlacements(createBoard(), SQUARE2);
            expect(placements.length).toBe(49);
        });

        it('returns empty array on full board', () => {
            const full: Board = Array.from({ length: 8 }, () => Array(8).fill('#F'));
            expect(findAllPlacements(full, DOT)).toEqual([]);
        });
    });

    describe('getIslands', () => {
        it('empty board is one big island of 64 cells', () => {
            const islands = getIslands(createBoard());
            expect(islands.length).toBe(1);
            expect(islands[0].length).toBe(64);
        });

        it('full board has no islands', () => {
            const full: Board = Array.from({ length: 8 }, () => Array(8).fill('#F'));
            expect(getIslands(full)).toEqual([]);
        });

        it('detects separate islands', () => {
            // Fill row 3 and col 3 to create 4 quadrants
            let board = createBoard();
            board = fillRow(board, 3);
            board = fillCol(board, 3);
            const islands = getIslands(board);
            expect(islands.length).toBe(4);
            // Quadrants: TL=3x3(9), TR=3x4(12), BL=4x3(12), BR=4x4(16)
            const sizes = islands.map(i => i.length).sort((a, b) => a - b);
            expect(sizes).toEqual([9, 12, 12, 16]);
        });
    });

    describe('canSurvive', () => {
        it('returns true for empty blocks array', () => {
            expect(canSurvive(createBoard(), [])).toBe(true);
        });

        it('returns true for 3 DOTs on empty board', () => {
            expect(canSurvive(createBoard(), [DOT, DOT, DOT])).toBe(true);
        });

        it('returns true for 3 SQUARE2 on empty board', () => {
            expect(canSurvive(createBoard(), [SQUARE2, SQUARE2, SQUARE2])).toBe(true);
        });

        it('returns false when board is too full for blocks', () => {
            // Fill board leaving only 2 non-adjacent empty cells — can't fit 3 blocks
            const board: Board = Array.from({ length: 8 }, () => Array(8).fill('#F'));
            // Leave (0,0) and (7,7) empty, but clear no row/col on placement
            // Actually: DOT on (0,0) fills row0+col0 → triggers clear → opens space
            // So we need blocks that can't fit at all: 3 SQUARE2 with only 2 empty cells
            board[3][3] = 0;
            board[5][5] = 0;
            expect(canSurvive(board, [SQUARE2, SQUARE2, SQUARE2])).toBe(false);
        });

        it('considers line clears when validating (makes previously impossible placements possible)', () => {
            // Fill rows 0-6 completely, leave row 7 empty
            let board = createBoard();
            for (let r = 0; r < 7; r++) board = fillRow(board, r);
            // 3 LINE8H blocks: first fills row7 (triggers clear), subsequent fit
            expect(canSurvive(board, [LINE8H, LINE8H, LINE8H])).toBe(true);
        });
    });

    describe('generateBlocks', () => {
        it('always returns 3 blocks', () => {
            const blocks = generateBlocks(createBoard());
            expect(blocks.length).toBe(3);
        });

        it('returned blocks have color assigned', () => {
            const blocks = generateBlocks(createBoard());
            blocks.forEach(b => {
                expect(b.color).toBeTruthy();
                expect(typeof b.color).toBe('string');
            });
        });

        it('returned blocks are survivable on the given board', () => {
            const board = createBoard();
            const blocks = generateBlocks(board);
            // The algorithm guarantees survival when possible
            expect(canSurvive(board, blocks)).toBe(true);
        });

        it('works on partially filled board', () => {
            let board = createBoard();
            for (let r = 0; r < 4; r++) {
                for (let c = 0; c < 4; c++) {
                    board[r][c] = '#AAA';
                }
            }
            const blocks = generateBlocks(board);
            expect(blocks.length).toBe(3);
        });
    });
});
