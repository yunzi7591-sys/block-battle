import { initGame, selectAndPlaceBlock, checkAndRefill, checkGameOver } from '../../src/game/gameManager';
import { Dot } from '../../src/game/blocks';

describe('gameManager', () => {
    it('initGame should create a valid initial state', () => {
        const state = initGame();
        expect(state.score).toBe(0);
        expect(state.isGameOver).toBe(false);
        expect(state.currentBlocks.length).toBe(3);
        expect(state.placedFlags).toEqual([false, false, false]);
    });

    it('selectAndPlaceBlock should update state and score', () => {
        let state = initGame();

        // For test reliability, force a Dot block into index 0
        state.currentBlocks[0] = Dot;

        const nextState = selectAndPlaceBlock(state, 0, 3, 3);

        expect(nextState.board[3][3]).toBe(Dot.color || '#4DA8DA');
        expect(nextState.placedFlags).toEqual([true, false, false]);
        expect(nextState.score).toBe(0); // 0 lines cleared
    });

    it('checkAndRefill should refill blocks ONLY when all 3 are placed', () => {
        let state = initGame();
        state.placedFlags = [true, true, false];

        const unchangedState = checkAndRefill(state);
        expect(unchangedState.currentBlocks).toBe(state.currentBlocks); // reference equality

        let stateFull = { ...state, placedFlags: [true, true, true] };
        const refilledState = checkAndRefill(stateFull);

        expect(refilledState.placedFlags).toEqual([false, false, false]);
        // It should have generated 3 new blocks, meaning the reference to currentBlocks is new
        expect(refilledState.currentBlocks).not.toBe(stateFull.currentBlocks);
    });

    it('checkGameOver should flag game over if no remaining block fits', () => {
        let state = initGame();
        // Fill the entire board so nothing fits
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                state.board[r][c] = 'C';
            }
        }

        const nextState = checkGameOver(state);
        expect(nextState.isGameOver).toBe(true);
    });
});
