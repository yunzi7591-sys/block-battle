/**
 * survivalAlgorithm.ts — Smart RNG (神RNG) Block Generation
 *
 * Game Designer:
 *   Solo = スコア連動の段階的難易度カーブ
 *   PvP  = ターン連動・サドンデス型カーブ (Turn 15+ で Hard 80%)
 *
 * Software Architect:
 *   - 既存の canSurvive() DFS (6順列 × ライン消しシミュ × Early Exit) を再利用
 *   - occupancy は O(1)化 (ループ前に1回だけ計算)
 *   - Graceful Degradation: 前半は通常ウェイト、後半は緩和ウェイト、
 *     30回リトライ失敗時は bestBlocks を返して「詰み(敗北)」をプレイヤーに委ねる
 */

import { Board, BlockShape } from './types';
import { canPlace, placeBlock, clearLines, BOARD_SIZE, hasAnyValidPlacement } from './board';
import { ALL_BLOCKS } from './blocks';
import { getRandomJewelColor } from '../utils/colors';
import {
    getSoloTierWeights,
    getPvPTierWeights,
    pickBlockByTier,
    calcOccupancy,
    RELAXED_WEIGHTS,
    TierWeights,
} from './blockTiers';

// ─── Guaranteed Clear Pools (Hospitality Mode) ──────────

const GUARANTEED_CLEAR_POOLS: string[][] = [
    ['Square3x3', 'Square3x3', 'Rect3x2'],          // Pattern A: Huge 3x8 block (3-line clear)
    ['Line4H', 'Line2H', 'Line2H'],                 // Pattern B: 1x8 flat (1-line clear)
    ['Line3H', 'Line3H', 'Line2H'],                 // Pattern C: 1x8 flat (1-line clear)
    ['Line5H', 'Line2H', 'Dot'],                    // Pattern D: 1x8 mixed (1-line clear)
];

// ─── Island Detection ───────────────────────────────────

export function getIslands(board: Board): [number, number][][] {
    const visited: boolean[][] = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(false));
    const islands: [number, number][][] = [];

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (board[r][c] === 0 && !visited[r][c]) {
                const island: [number, number][] = [];
                const queue: [number, number][] = [[r, c]];
                visited[r][c] = true;

                while (queue.length > 0) {
                    const [currR, currC] = queue.shift()!;
                    island.push([currR, currC]);

                    const neighbors = [[currR - 1, currC], [currR + 1, currC], [currR, currC - 1], [currR, currC + 1]];
                    for (const [nr, nc] of neighbors) {
                        if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] === 0 && !visited[nr][nc]) {
                            visited[nr][nc] = true;
                            queue.push([nr, nc]);
                        }
                    }
                }
                islands.push(island);
            }
        }
    }
    return islands;
}

// ─── Legacy Weighted Random (Hospitality Mode Only) ─────

function getWeightedRandomBlock(pool: BlockShape[], board: Board, priorityIds: string[] = []): BlockShape {
    let filledCount = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (board[r][c] !== 0) filledCount++;
        }
    }
    const occupancy = filledCount / (BOARD_SIZE * BOARD_SIZE);
    const rescueNeeded = occupancy > 0.7;

    const weights: Record<string, number> = {
        'Square2x2': 15.0, 'Square3x3': 15.0,
        'Rect2x3': 15.0, 'Rect3x2': 15.0,
        'Line2H': 15.0, 'Line2V': 15.0,
        'Line3H': 15.0, 'Line3V': 15.0,
        'Line4H': 15.0, 'Line4V': 15.0,
        'Line5H': 15.0, 'Line5V': 15.0,
        'SmallL_BR': 1.0, 'SmallL_BL': 1.0, 'SmallL_TR': 1.0, 'SmallL_TL': 1.0,
        'BigL_BR': 1.0, 'BigL_BL': 1.0, 'BigL_TR': 1.0, 'BigL_TL': 1.0,
        'T_Up': 1.0, 'T_Down': 1.0, 'T_Left': 1.0, 'T_Right': 1.0,
        'S_H': 1.0, 'S_V': 1.0, 'Z_H': 1.0, 'Z_V': 1.0,
        'Diag2_DownRight': 1.0, 'Diag2_DownLeft': 1.0,
        'Diag3_DownRight': 1.0, 'Diag3_DownLeft': 1.0,
        'Dot': rescueNeeded ? 50.0 : 0.001,
    };

    for (const id of priorityIds) {
        weights[id] = (weights[id] || 1.0) * 100.0;
    }

    const totalWeight = pool.reduce((sum, block) => sum + (weights[block.id] || 0.1), 0);
    let random = Math.random() * totalWeight;

    for (const block of pool) {
        const weight = weights[block.id] || 0.1;
        if (random < weight) return block;
        random -= weight;
    }
    return pool[pool.length - 1];
}

// ─── DFS Placement Guarantee ────────────────────────────

export function findAllPlacements(board: Board, shape: BlockShape): [number, number][] {
    const placements: [number, number][] = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (canPlace(board, shape, r, c)) {
                placements.push([r, c]);
            }
        }
    }
    return placements;
}

/**
 * 3つのブロック全てを配置できる順列が最低1つ存在するか検証する。
 * 6通りの順列 × ライン消しシミュレーション × Early Exit。
 */
export function canSurvive(board: Board, blocks: BlockShape[]): boolean {
    if (blocks.length === 0) return true;

    const permutations = [
        [0, 1, 2], [0, 2, 1],
        [1, 0, 2], [1, 2, 0],
        [2, 0, 1], [2, 1, 0],
    ];

    for (const perm of permutations) {
        const b0 = blocks[perm[0]];
        const b1 = blocks[perm[1]];
        const b2 = blocks[perm[2]];

        const placements0 = findAllPlacements(board, b0);
        if (placements0.length === 0) continue;

        for (const [r0, c0] of placements0) {
            let boardAfter0 = placeBlock(board, b0, r0, c0);
            boardAfter0 = clearLines(boardAfter0).newBoard;

            const placements1 = findAllPlacements(boardAfter0, b1);
            if (placements1.length === 0) continue;

            for (const [r1, c1] of placements1) {
                let boardAfter1 = placeBlock(boardAfter0, b1, r1, c1);
                boardAfter1 = clearLines(boardAfter1).newBoard;

                if (hasAnyValidPlacement(boardAfter1, b2)) {
                    return true; // Early Exit: 1つでも成功ルートが見つかれば即終了
                }
            }
        }
    }

    return false;
}

// ─── Constants ──────────────────────────────────────────

const MAX_RETRIES = 30;
const RELAXATION_THRESHOLD = 15; // attempt 15 以降で緩和ウェイトに切替

// ─── Time-Slicing Yield ─────────────────────────────────
// JSイベントループを解放し、UI描画を優先させる
const YIELD_INTERVAL = 3; // 3 attempts ごとに yield
const yieldToUI = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

// ─── Solo Mode Block Generation ─────────────────────────

/**
 * ソロモード用ブロック生成 (同期版 — init/gameManager用)
 */
export function generateBlocks(
    board: Board,
    pcCount: number = 0,
    endTarget: number = 0,
    pool: BlockShape[] = ALL_BLOCKS,
    score: number = 0
): BlockShape[] {
    return generateBlocksSync(board, pcCount, endTarget, pool, score);
}

/**
 * ソロモード用ブロック生成 (非同期版 — gameStore用)
 * リトライループ内でイベントループを解放し、UI描画を先行させる。
 */
export async function generateBlocksAsync(
    board: Board,
    pcCount: number = 0,
    endTarget: number = 0,
    pool: BlockShape[] = ALL_BLOCKS,
    score: number = 0
): Promise<BlockShape[]> {
    const isHospitality = pcCount < endTarget;

    if (isHospitality) {
        const earlyResult = tryHospitalityEarly(board, pool);
        if (earlyResult) return earlyResult;

        const { basicPool, forcedComplexBlock } = prepareHospitality(board, pool);

        for (let attempts = 0; attempts < MAX_RETRIES; attempts++) {
            if (attempts > 0 && attempts % YIELD_INTERVAL === 0) await yieldToUI();

            const candidateBlocks = pickHospitalityCandidates(basicPool, board, forcedComplexBlock);
            if (canSurvive(board, candidateBlocks)) {
                return candidateBlocks.map(b => ({ ...b, color: getRandomJewelColor() }));
            }
        }
    }

    const occupancy = calcOccupancy(board);
    const normalWeights = getSoloTierWeights(score);
    let bestBlocks: BlockShape[] | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        if (attempt > 0 && attempt % YIELD_INTERVAL === 0) await yieldToUI();

        const weights: TierWeights = attempt < RELAXATION_THRESHOLD ? normalWeights : RELAXED_WEIGHTS;
        const candidateBlocks = [
            pickBlockByTier(weights, occupancy),
            pickBlockByTier(weights, occupancy),
            pickBlockByTier(weights, occupancy),
        ];
        if (attempt === 0) bestBlocks = candidateBlocks;

        if (canSurvive(board, candidateBlocks)) {
            return candidateBlocks.map(b => ({ ...b, color: getRandomJewelColor() }));
        }
    }

    return (bestBlocks || [
        ALL_BLOCKS[0], ALL_BLOCKS[0], ALL_BLOCKS[0]
    ]).map(b => ({ ...b, color: getRandomJewelColor() }));
}

// ─── Sync Implementation (no yields) ────────────────────

function generateBlocksSync(
    board: Board,
    pcCount: number,
    endTarget: number,
    pool: BlockShape[],
    score: number,
): BlockShape[] {
    const isHospitality = pcCount < endTarget;

    if (isHospitality) {
        const earlyResult = tryHospitalityEarly(board, pool);
        if (earlyResult) return earlyResult;

        const { basicPool, forcedComplexBlock } = prepareHospitality(board, pool);

        for (let attempts = 0; attempts < MAX_RETRIES; attempts++) {
            const candidateBlocks = pickHospitalityCandidates(basicPool, board, forcedComplexBlock);
            if (canSurvive(board, candidateBlocks)) {
                return candidateBlocks.map(b => ({ ...b, color: getRandomJewelColor() }));
            }
        }
    }

    const occupancy = calcOccupancy(board);
    const normalWeights = getSoloTierWeights(score);
    let bestBlocks: BlockShape[] | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const weights: TierWeights = attempt < RELAXATION_THRESHOLD ? normalWeights : RELAXED_WEIGHTS;
        const candidateBlocks = [
            pickBlockByTier(weights, occupancy),
            pickBlockByTier(weights, occupancy),
            pickBlockByTier(weights, occupancy),
        ];
        if (attempt === 0) bestBlocks = candidateBlocks;

        if (canSurvive(board, candidateBlocks)) {
            return candidateBlocks.map(b => ({ ...b, color: getRandomJewelColor() }));
        }
    }

    return (bestBlocks || [
        ALL_BLOCKS[0], ALL_BLOCKS[0], ALL_BLOCKS[0]
    ]).map(b => ({ ...b, color: getRandomJewelColor() }));
}

// ─── Shared Hospitality Helpers ─────────────────────────

function tryHospitalityEarly(board: Board, pool: BlockShape[]): BlockShape[] | null {
    let emptyCellsCount = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (board[r][c] === 0) emptyCellsCount++;
        }
    }
    if (emptyCellsCount === BOARD_SIZE * BOARD_SIZE && Math.random() < 0.5) {
        const packTemplate = GUARANTEED_CLEAR_POOLS[Math.floor(Math.random() * GUARANTEED_CLEAR_POOLS.length)];
        const selectedBlocks = packTemplate.map(id => {
            const base = pool.find(b => b.id === id) || pool[0];
            return { ...base, color: getRandomJewelColor() };
        });
        return selectedBlocks.sort(() => Math.random() - 0.5);
    }
    return null;
}

function prepareHospitality(board: Board, pool: BlockShape[]): {
    basicPool: BlockShape[];
    forcedComplexBlock: BlockShape | null;
} {
    const basicPool = pool.filter(b => !['SmallL', 'BigL', 'T_', 'S_', 'Z_', 'Diag'].some(prefix => b.id.startsWith(prefix)));
    const complexPool = pool.filter(b => ['SmallL', 'BigL', 'T_', 'S_', 'Z_', 'Diag'].some(prefix => b.id.startsWith(prefix)));

    const islands = getIslands(board);
    let forcedComplexBlock: BlockShape | null = null;

    for (const island of islands) {
        if (island.length > 0 && island.length <= 9) {
            const minR = Math.min(...island.map(p => p[0]));
            const minC = Math.min(...island.map(p => p[1]));
            const normalizedIsland = island.map(([ir, ic]) => [ir - minR, ic - minC]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);

            for (const complexBlock of complexPool) {
                if (complexBlock.cells.length === island.length) {
                    const normalizedBlock = [...complexBlock.cells].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
                    const isExactMatch = normalizedBlock.every((cell, idx) =>
                        cell[0] === normalizedIsland[idx][0] && cell[1] === normalizedIsland[idx][1]
                    );
                    if (isExactMatch && canPlace(board, complexBlock, minR, minC)) {
                        forcedComplexBlock = complexBlock;
                        break;
                    }
                }
            }
        }
        if (forcedComplexBlock) break;
    }

    return { basicPool, forcedComplexBlock };
}

function pickHospitalityCandidates(
    basicPool: BlockShape[],
    board: Board,
    forcedComplexBlock: BlockShape | null,
): BlockShape[] {
    if (forcedComplexBlock) {
        const candidateBlocks = [
            forcedComplexBlock,
            getWeightedRandomBlock(basicPool, board),
            getWeightedRandomBlock(basicPool, board),
        ];
        candidateBlocks.sort(() => Math.random() - 0.5);
        return candidateBlocks;
    }
    return [
        getWeightedRandomBlock(basicPool, board),
        getWeightedRandomBlock(basicPool, board),
        getWeightedRandomBlock(basicPool, board),
    ];
}

// ─── PvP Mode Block Generation ─────────────────────────

/**
 * PvP専用ブロック生成 (同期版)
 */
export function generatePvPBlocks(board: Board, turnNumber: number = 1): BlockShape[] {
    return generatePvPBlocksSync(board, turnNumber);
}

/**
 * PvP専用ブロック生成 (非同期版 — タイムスライシング付き)
 */
export async function generatePvPBlocksAsync(board: Board, turnNumber: number = 1): Promise<BlockShape[]> {
    const occupancy = calcOccupancy(board);
    const normalWeights = getPvPTierWeights(turnNumber);
    let bestBlocks: BlockShape[] | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        if (attempt > 0 && attempt % YIELD_INTERVAL === 0) await yieldToUI();

        const weights: TierWeights = attempt < RELAXATION_THRESHOLD ? normalWeights : RELAXED_WEIGHTS;
        const candidateBlocks = [
            pickBlockByTier(weights, occupancy),
            pickBlockByTier(weights, occupancy),
            pickBlockByTier(weights, occupancy),
        ];
        if (attempt === 0) bestBlocks = candidateBlocks;

        if (canSurvive(board, candidateBlocks)) {
            return candidateBlocks.map(b => ({ ...b, color: getRandomJewelColor() }));
        }
    }

    return (bestBlocks || [
        ALL_BLOCKS[0], ALL_BLOCKS[0], ALL_BLOCKS[0]
    ]).map(b => ({ ...b, color: getRandomJewelColor() }));
}

/** PvP 同期版 */
function generatePvPBlocksSync(board: Board, turnNumber: number): BlockShape[] {
    const occupancy = calcOccupancy(board);
    const normalWeights = getPvPTierWeights(turnNumber);
    let bestBlocks: BlockShape[] | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const weights: TierWeights = attempt < RELAXATION_THRESHOLD ? normalWeights : RELAXED_WEIGHTS;
        const candidateBlocks = [
            pickBlockByTier(weights, occupancy),
            pickBlockByTier(weights, occupancy),
            pickBlockByTier(weights, occupancy),
        ];
        if (attempt === 0) bestBlocks = candidateBlocks;

        if (canSurvive(board, candidateBlocks)) {
            return candidateBlocks.map(b => ({ ...b, color: getRandomJewelColor() }));
        }
    }

    return (bestBlocks || [
        ALL_BLOCKS[0], ALL_BLOCKS[0], ALL_BLOCKS[0]
    ]).map(b => ({ ...b, color: getRandomJewelColor() }));
}
