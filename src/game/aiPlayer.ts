/**
 * aiPlayer.ts — 最強AIロジック
 *
 * アルゴリズム:
 *   手札3つ × 盤面全箇所を総当たり評価
 *   スコア = ライン消去数 × 10000 + 空きスペース連続性
 *   最高スコアの手を選択
 */

import { Board, BlockShape } from './types';
import { canPlace, placeBlock, clearLines, BOARD_SIZE, hasAnyValidPlacement } from './board';

interface AIMove {
    blockIndex: number;
    row: number;
    col: number;
    score: number;
}

/**
 * 盤面の空きスペースの連続性を評価する。
 * 大きな連結領域が多いほど高スコア（断片化ペナルティ付き）。
 */
function evaluateContinuity(board: Board): number {
    const visited: boolean[][] = Array.from(
        { length: BOARD_SIZE },
        () => Array(BOARD_SIZE).fill(false)
    );
    let maxRegionSize = 0;
    let regionCount = 0;

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (board[r][c] === 0 && !visited[r][c]) {
                let regionSize = 0;
                const queue: [number, number][] = [[r, c]];
                visited[r][c] = true;

                while (queue.length > 0) {
                    const [cr, cc] = queue.shift()!;
                    regionSize++;

                    const neighbors: [number, number][] = [
                        [cr - 1, cc], [cr + 1, cc],
                        [cr, cc - 1], [cr, cc + 1],
                    ];
                    for (const [nr, nc] of neighbors) {
                        if (
                            nr >= 0 && nr < BOARD_SIZE &&
                            nc >= 0 && nc < BOARD_SIZE &&
                            board[nr][nc] === 0 &&
                            !visited[nr][nc]
                        ) {
                            visited[nr][nc] = true;
                            queue.push([nr, nc]);
                        }
                    }
                }

                maxRegionSize = Math.max(maxRegionSize, regionSize);
                regionCount++;
            }
        }
    }

    if (regionCount === 0) return 0;

    // 連結領域が大きいほど良い。断片化はペナルティ。
    return maxRegionSize * 10 - regionCount * 15;
}

/**
 * 行・列の充填度ボーナス:
 * ほぼ埋まっている行/列があればライン消去に近い → 加点
 */
function evaluateNearComplete(board: Board): number {
    let bonus = 0;

    for (let r = 0; r < BOARD_SIZE; r++) {
        let filled = 0;
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (board[r][c] !== 0) filled++;
        }
        if (filled === BOARD_SIZE - 1) bonus += 50;
        else if (filled === BOARD_SIZE - 2) bonus += 15;
    }

    for (let c = 0; c < BOARD_SIZE; c++) {
        let filled = 0;
        for (let r = 0; r < BOARD_SIZE; r++) {
            if (board[r][c] !== 0) filled++;
        }
        if (filled === BOARD_SIZE - 1) bonus += 50;
        else if (filled === BOARD_SIZE - 2) bonus += 15;
    }

    return bonus;
}

/**
 * 配置を評価するスコアリング関数。
 * 高いほど良い手。
 */
function evaluatePlacement(board: Board, shape: BlockShape, row: number, col: number): number {
    const newBoard = placeBlock(board, shape, row, col);
    const { newBoard: clearedBoard, linesCleared } = clearLines(newBoard);

    // 1. ライン消去: 最重要
    const lineScore = linesCleared * 10000;

    // 2. 空きスペースの連続性
    const continuityScore = evaluateContinuity(clearedBoard);

    // 3. 行列充填度ボーナス
    const nearCompleteScore = evaluateNearComplete(clearedBoard);

    // 4. パーフェクトクリアボーナス
    const isPerfect = clearedBoard.every(r => r.every(cell => cell === 0));
    const perfectBonus = isPerfect ? 100000 : 0;

    return lineScore + continuityScore + nearCompleteScore + perfectBonus;
}

/**
 * 現在の手札から最適の一手を探索する。
 * 全ブロック × 全配置位置を総当たり評価し、最高スコアの手を返す。
 *
 * @returns AIMove or null (配置不可能 = AI敗北)
 */
export function findBestMove(
    board: Board,
    blocks: (BlockShape | null)[]
): AIMove | null {
    let bestMove: AIMove | null = null;

    for (let i = 0; i < blocks.length; i++) {
        const shape = blocks[i];
        if (!shape) continue;

        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (!canPlace(board, shape, r, c)) continue;

                const score = evaluatePlacement(board, shape, r, c);

                if (!bestMove || score > bestMove.score) {
                    bestMove = { blockIndex: i, row: r, col: c, score };
                }
            }
        }
    }

    return bestMove;
}
