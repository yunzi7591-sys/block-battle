import { ALL_BLOCKS } from '../../src/game/blocks';

describe('blocks', () => {
    it('should have 33 distinct block shapes', () => {
        expect(ALL_BLOCKS.length).toBe(33);
    });

    it('all blocks should have non-negative coordinates', () => {
        for (const block of ALL_BLOCKS) {
            for (const [r, c] of block.cells) {
                expect(r).toBeGreaterThanOrEqual(0);
                expect(c).toBeGreaterThanOrEqual(0);
            }
        }
    });

    it('no block should have duplicate coordinates', () => {
        for (const block of ALL_BLOCKS) {
            const uniqueCells = new Set(block.cells.map(([r, c]) => `${r},${c}`));
            expect(uniqueCells.size).toBe(block.cells.length);
        }
    });
});
