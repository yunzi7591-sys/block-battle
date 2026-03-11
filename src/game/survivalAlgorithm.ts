import { Board, BlockShape } from './types';
import { canPlace, placeBlock, clearLines, BOARD_SIZE, hasAnyValidPlacement } from './board';
import { ALL_BLOCKS } from './blocks';
import { getRandomJewelColor } from '../utils/colors';

// For PvP: Sort blocks by size (area) to prioritize difficulty
const COMPLEX_BLOCKS = [...ALL_BLOCKS].sort((a, b) => b.cells.length - a.cells.length);

// --- Smart Drop Logic ---
// Scans the board for empty spaces and returns a list of block IDs that fit perfectly in those gaps.

const GUARANTEED_CLEAR_POOLS: string[][] = [
    ['Square3x3', 'Square3x3', 'Rect3x2'],          // Pattern A: Huge 3x8 block (3-line clear)
    ['Line4H', 'Line2H', 'Line2H'],                 // Pattern B: 1x8 flat (1-line clear)
    ['Line3H', 'Line3H', 'Line2H'],                 // Pattern C: 1x8 flat (1-line clear)
    ['Line5H', 'Line2H', 'Dot'],                    // Pattern D: 1x8 mixed (1-line clear)
];

// --- Ultimate Simple If-Then Hospitality Logic ---
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

// Helper to get random item from array based on weights
function getWeightedRandomBlock(pool: BlockShape[], board: Board, priorityIds: string[] = []): BlockShape {
    // 1. Calculate occupancy
    let filledCount = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (board[r][c] !== 0) filledCount++;
        }
    }
    const occupancy = filledCount / (BOARD_SIZE * BOARD_SIZE);

    // 2. Check if a rescue is needed
    const rescueNeeded = occupancy > 0.7;

    const weights: Record<string, number> = {
        // --- High Weight (90% Pool Share): Big Win & Combo Blocks ---
        'Square2x2': 15.0, 'Square3x3': 15.0,
        'Rect2x3': 15.0, 'Rect3x2': 15.0,
        'Line2H': 15.0, 'Line2V': 15.0,
        'Line3H': 15.0, 'Line3V': 15.0,
        'Line4H': 15.0, 'Line4V': 15.0,
        'Line5H': 15.0, 'Line5V': 15.0,

        // --- Low Weight (10% Pool Share): Complex / Obstacles ---
        'SmallL_BR': 1.0, 'SmallL_BL': 1.0, 'SmallL_TR': 1.0, 'SmallL_TL': 1.0,
        'BigL_BR': 1.0, 'BigL_BL': 1.0, 'BigL_TR': 1.0, 'BigL_TL': 1.0,
        'T_Up': 1.0, 'T_Down': 1.0, 'T_Left': 1.0, 'T_Right': 1.0,
        'S_H': 1.0, 'S_V': 1.0, 'Z_H': 1.0, 'Z_V': 1.0,
        'Diag2_DownRight': 1.0, 'Diag2_DownLeft': 1.0,
        'Diag3_DownRight': 1.0, 'Diag3_DownLeft': 1.0,

        // --- Rescue Block (Dot) ---
        'Dot': rescueNeeded ? 50.0 : 0.001,
    };

    // --- APPLY SMART DROP SUGGESTIONS ---
    // If a block is suggested by the scanner, give it a massive boost
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

// Get all possible valid placement coordinates for a single block
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

// Check if there is AT LEAST ONE valid sequence to place all 3 blocks
export function canSurvive(board: Board, blocks: BlockShape[]): boolean {
    if (blocks.length === 0) return true;

    // We need to test all permutations of placing the 3 blocks.
    // There are 3! = 6 permutations.
    const permutations = [
        [0, 1, 2], [0, 2, 1],
        [1, 0, 2], [1, 2, 0],
        [2, 0, 1], [2, 1, 0],
    ];

    for (const perm of permutations) {
        const b0 = blocks[perm[0]];
        const b1 = blocks[perm[1]];
        const b2 = blocks[perm[2]];

        // Step 1: Find all placements for b0
        const placements0 = findAllPlacements(board, b0);
        if (placements0.length === 0) continue;

        for (const [r0, c0] of placements0) {
            // Place b0 and clear lines
            let boardAfter0 = placeBlock(board, b0, r0, c0);
            boardAfter0 = clearLines(boardAfter0).newBoard;

            // Step 2: Find all placements for b1
            const placements1 = findAllPlacements(boardAfter0, b1);
            if (placements1.length === 0) continue;

            for (const [r1, c1] of placements1) {
                // Place b1 and clear lines
                let boardAfter1 = placeBlock(boardAfter0, b1, r1, c1);
                boardAfter1 = clearLines(boardAfter1).newBoard;

                // Step 3: Check if b2 can be placed ANYWHERE
                if (hasAnyValidPlacement(boardAfter1, b2)) {
                    // If we can place all 3, this permutation works! Early exit.
                    return true;
                }
            }
        }
    }

    // If no permutation worked, survival is impossible with these 3 blocks.
    return false;
}

const MAX_RETRIES = 100;

export function generateBlocks(
    board: Board,
    pcCount: number = 0,
    endTarget: number = 0,
    pool: BlockShape[] = ALL_BLOCKS
): BlockShape[] {
    const isHospitality = pcCount < endTarget;
    let attempts = 0;

    if (isHospitality) {
        // --- 50% PERFECT START SYSTEM ---
        let emptyCellsCount = 0;
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (board[r][c] === 0) emptyCellsCount++;
            }
        }

        if (emptyCellsCount === BOARD_SIZE * BOARD_SIZE && Math.random() < 0.5) {
            console.log('[Smart AI] 50% Perfect Start Triggered! Injecting Guaranteed Clear Pool.');
            const packTemplate = GUARANTEED_CLEAR_POOLS[Math.floor(Math.random() * GUARANTEED_CLEAR_POOLS.length)];
            const selectedBlocks = packTemplate.map(id => {
                const base = pool.find(b => b.id === id) || pool[0];
                return { ...base, color: getRandomJewelColor() };
            });

            // Still shuffle the array so the visual placement isn't identical
            return selectedBlocks.sort(() => Math.random() - 0.5);
        }

        // --- SIMPLE IF-THEN HOSPITALITY ---

        // 1. Define Strict Pools
        // Basic: Dot, Squares, Lines, Rectangles
        const basicPool = pool.filter(b => !['SmallL', 'BigL', 'T_', 'S_', 'Z_', 'Diag'].some(prefix => b.id.startsWith(prefix)));
        // Complex: L, T, S, Z, Diag
        const complexPool = pool.filter(b => ['SmallL', 'BigL', 'T_', 'S_', 'Z_', 'Diag'].some(prefix => b.id.startsWith(prefix)));

        // 2. Scan for specific "Complex Holes" (Islands of <= 9 size)
        const islands = getIslands(board);
        let forcedComplexBlock: BlockShape | null = null;

        for (const island of islands) {
            if (island.length > 0 && island.length <= 9) {
                const minR = Math.min(...island.map(p => p[0]));
                const minC = Math.min(...island.map(p => p[1]));
                const normalizedIsland = island.map(([ir, ic]) => [ir - minR, ic - minC]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);

                // Check complex pool to see if any block is an EXACT match for this hole
                for (const complexBlock of complexPool) {
                    if (complexBlock.cells.length === island.length) {
                        const normalizedBlock = [...complexBlock.cells].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
                        const isExactMatch = normalizedBlock.every((cell, idx) =>
                            cell[0] === normalizedIsland[idx][0] && cell[1] === normalizedIsland[idx][1]
                        );

                        if (isExactMatch && canPlace(board, complexBlock, minR, minC)) {
                            forcedComplexBlock = complexBlock;
                            break; // Found our rescue block
                        }
                    }
                }
            }
            if (forcedComplexBlock) break;
        }

        // 3. Generate Tray
        while (attempts < MAX_RETRIES) {
            let candidateBlocks: BlockShape[];

            if (forcedComplexBlock) {
                // If we found a hole that needs a complex block, provide it + 2 random basics
                candidateBlocks = [
                    forcedComplexBlock,
                    getWeightedRandomBlock(basicPool, board),
                    getWeightedRandomBlock(basicPool, board),
                ];
                candidateBlocks.sort(() => Math.random() - 0.5); // Shuffle
            } else {
                // Default: Gorilla-push basic blocks (Squares and Lines) ONLY
                candidateBlocks = [
                    getWeightedRandomBlock(basicPool, board),
                    getWeightedRandomBlock(basicPool, board),
                    getWeightedRandomBlock(basicPool, board),
                ];
            }

            if (canSurvive(board, candidateBlocks)) {
                // Assign unique jewel tones to each block in the tray
                return candidateBlocks.map(b => ({ ...b, color: getRandomJewelColor() }));
            }
            attempts++;
        }
    }

    // --- NORMAL GAMEPLAY (Post-Hospitality) ---
    attempts = 0;
    while (attempts < MAX_RETRIES) {
        const candidateBlocks = [
            getWeightedRandomBlock(pool, board),
            getWeightedRandomBlock(pool, board),
            getWeightedRandomBlock(pool, board),
        ];

        // During general gameplay, we still ensure they can survive
        if (canSurvive(board, candidateBlocks)) {
            // Assign unique jewel tones to each block in the tray
            return candidateBlocks.map(b => ({ ...b, color: getRandomJewelColor() }));
        }
        attempts++;
    }

    // Fallback: If 100 random combinations fail, Force Dots to save the player
    const dotBlock = ALL_BLOCKS.find(b => b.id === 'Dot')!;
    const rescueBlocks = [dotBlock, dotBlock, dotBlock];

    if (canSurvive(board, rescueBlocks)) {
        console.log('[Survival Algorithm] Survival rescue triggered: Providing 3 Dots.');
        return rescueBlocks;
    }

    // Absolute Last Resort: If even 3 dots can't be placed (extremely rare board state), 
    // at least provide one Dot in the first slot if it's placeable.
    console.warn('[Survival Algorithm] CRITICAL: Even Dots are struggling. Ensuring at least one Dot is provided.');
    return [
        { ...dotBlock, color: getRandomJewelColor() },
        { ...dotBlock, color: getRandomJewelColor() },
        { ...dotBlock, color: getRandomJewelColor() }
    ];
}

/**
 * PvP専用・生存保証アルゴリズム
 * 現在の盤面に対し、確実に3つ全て配置可能なセット（かつ難易度高め）を見つける
 */
export function generatePvPBlocks(board: Board): BlockShape[] {
    console.log('[PvP AI] Simulating winnable sequence...');

    // 試行回数上限（無限ループ防止）
    for (let attempt = 0; attempt < 100; attempt++) {
        const selected: BlockShape[] = [];
        let tempBoard = board;

        // 3つのブロックを順番にシミュレーション
        let success = true;
        for (let i = 0; i < 3; i++) {
            // シャッフルされた大きい順のリストから、置けるものを探す
            const candidates = COMPLEX_BLOCKS.filter(b => {
                // 1x1は極力避ける (最終手段)
                if (b.id === 'Dot' && attempt < 80) return false;

                // 実際に置ける場所があるか
                for (let r = 0; r < BOARD_SIZE; r++) {
                    for (let c = 0; c < BOARD_SIZE; c++) {
                        if (canPlace(tempBoard, b, r, c)) return true;
                    }
                }
                return false;
            });

            if (candidates.length === 0) {
                success = false;
                break;
            }

            // 候補からランダムに1つ選択 (重み付け: 大きいやつほど選ばれやすくする)
            const poolSize = Math.min(10, candidates.length);
            const picked = candidates[Math.floor(Math.random() * poolSize)];
            selected.push(picked);

            // シミュレーション上の盤面を更新
            let placed = false;
            for (let r = 0; r < BOARD_SIZE && !placed; r++) {
                for (let c = 0; c < BOARD_SIZE && !placed; c++) {
                    if (canPlace(tempBoard, picked, r, c)) {
                        tempBoard = placeBlock(tempBoard, picked, r, c);
                        placed = true;
                    }
                }
            }
        }

        if (success) {
            console.log(`[PvP AI] Found winnable set after ${attempt + 1} attempts`);
            return selected.map(b => ({ ...b, color: getRandomJewelColor() }));
        }
    }

    // 万が一見つからなかった場合のフォールバック
    console.warn('[PvP AI] Fallback triggered');
    const dot = ALL_BLOCKS.find(b => b.id === 'Dot')!;
    return [
        { ...dot, color: getRandomJewelColor() },
        { ...dot, color: getRandomJewelColor() },
        { ...dot, color: getRandomJewelColor() }
    ];
}
