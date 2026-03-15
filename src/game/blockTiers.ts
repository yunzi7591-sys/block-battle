/**
 * blockTiers.ts — Smart RNG (神RNG) Tier System
 *
 * Game Designer の知見:
 *   全34ブロックを Easy / Medium / Hard の3層に分類し、
 *   Solo(スコア連動) / PvP(ターン連動・サドンデス) の2つの難易度カーブを提供。
 *
 * Software Architect の知見:
 *   占有率(occupancy)は呼び出し元で1回だけ計算し、引数で渡す(O(1)化)。
 *   ティア選択は純粋関数で副作用なし。
 */

import { BlockShape } from './types';
import {
    Dot,
    Line2H, Line2V, Line3H, Line3V, Line4H, Line4V, Line5H, Line5V,
    Square2x2, Square3x3,
    SmallL_BR, SmallL_BL, SmallL_TR, SmallL_TL,
    BigL_BR, BigL_BL, BigL_TR, BigL_TL,
    T_Up, T_Down, T_Left, T_Right,
    S_H, S_V, Z_H, Z_V,
    Diag2_DownRight, Diag2_DownLeft,
    Diag3_DownRight, Diag3_DownLeft,
    Rect2x3, Rect3x2,
} from './blocks';

// ─── Tier Classification ────────────────────────────────
//
// Easy   (11): 1-3 cells — 小型、配置自由度が高い
// Medium (13): 2-4 cells — 中型、ライン消しに有用だが配置制約あり
// Hard   (10): 5-9 cells — 大型、盤面を大きく圧迫
//

export const EASY_BLOCKS: BlockShape[] = [
    Dot,
    Line2H, Line2V,
    Line3H, Line3V,
    SmallL_BR, SmallL_BL, SmallL_TR, SmallL_TL,
    Diag2_DownRight, Diag2_DownLeft,
];

export const MEDIUM_BLOCKS: BlockShape[] = [
    Square2x2,
    Line4H, Line4V,
    T_Up, T_Down, T_Left, T_Right,
    S_H, S_V, Z_H, Z_V,
    Diag3_DownRight, Diag3_DownLeft,
];

export const HARD_BLOCKS: BlockShape[] = [
    Line5H, Line5V,
    Square3x3,
    BigL_BR, BigL_BL, BigL_TR, BigL_TL,
    Rect2x3, Rect3x2,
];

// ─── Tier Weights ───────────────────────────────────────

export interface TierWeights {
    easy: number;
    medium: number;
    hard: number;
}

/**
 * Solo用: スコア連動の段階的難易度カーブ（プロデューサー承認版）
 *
 * Phase 1 (0〜5000):      Easy=100%  Medium=0%   Hard=0%    ← 気持ちよさ重視
 * Phase 2 (5000〜10000):   補間 →    Easy=50%   Medium=50%  Hard=0%    ← Mediumが徐々に混入、Hardはまだゼロ
 * Phase 3 (10000〜30000):  補間 →    Easy=20%   Medium=40%  Hard=40%   ← 10000点でHard解禁、徐々に極悪化
 * Phase 4 (30000+):        Easy=20%  Medium=40%  Hard=40%   ← カンスト固定
 */
export function getSoloTierWeights(score: number): TierWeights {
    // Phase 1: 序盤 — Easy のみ
    if (score <= 5000) {
        return { easy: 1.0, medium: 0.0, hard: 0.0 };
    }
    // Phase 2: 中盤 — Medium が徐々に混入、Hard はまだゼロ
    if (score <= 10000) {
        const t = (score - 5000) / 5000; // 0.0 → 1.0
        return {
            easy:   1.0 - t * 0.50,   // 1.0 → 0.50
            medium: 0.0 + t * 0.50,   // 0.0 → 0.50
            hard:   0.0,              // 絶対ゼロ
        };
    }
    // Phase 3: 厳格化 — Hard 解禁、徐々に極悪化
    if (score <= 30000) {
        const t = (score - 10000) / 20000; // 0.0 → 1.0
        return {
            easy:   0.50 - t * 0.30,  // 0.50 → 0.20
            medium: 0.50 - t * 0.10,  // 0.50 → 0.40
            hard:   0.00 + t * 0.40,  // 0.00 → 0.40
        };
    }
    // Phase 4: カンスト
    return { easy: 0.20, medium: 0.40, hard: 0.40 };
}

/**
 * PvP用: ターン連動・サドンデス型難易度カーブ
 *
 * turnNumber は両者累計のため、しきい値はラウンド換算で設計:
 *   Turn  1〜6  (序盤/土台作り):  Easy=40%  Medium=50%  Hard=10%
 *   Turn  7〜14 (中盤/本格バトル): Easy=10%  Medium=40%  Hard=50%
 *   Turn 15+    (サドンデス):      Easy=5%   Medium=15%  Hard=80%
 */
export function getPvPTierWeights(turnNumber: number): TierWeights {
    if (turnNumber <= 6) {
        return { easy: 0.40, medium: 0.50, hard: 0.10 };
    }
    if (turnNumber <= 14) {
        return { easy: 0.10, medium: 0.40, hard: 0.50 };
    }
    // Sudden Death
    return { easy: 0.05, medium: 0.15, hard: 0.80 };
}

// ─── Relaxed Weights (Graceful Degradation) ─────────────

/** DFS後半(attempt 15-29)で使用する緩和ウェイト */
export const RELAXED_WEIGHTS: TierWeights = {
    easy: 0.80,
    medium: 0.20,
    hard: 0.00,
};

// ─── Block Selection ────────────────────────────────────

/**
 * ティア重みに基づいて1ブロックをランダム選択する。
 *
 * @param weights  - getTierWeights() or getPvPTierWeights() の戻り値
 * @param occupancy - 盤面占有率 (0.0〜1.0)。呼び出し元で事前計算する(O(1)化)。
 * @returns 選ばれたBlockShape
 */
export function pickBlockByTier(weights: TierWeights, occupancy: number): BlockShape {
    // 1. Roll a random number to pick a tier
    const roll = Math.random();
    let tier: BlockShape[];

    if (roll < weights.easy) {
        tier = EASY_BLOCKS;
    } else if (roll < weights.easy + weights.medium) {
        tier = MEDIUM_BLOCKS;
    } else {
        tier = HARD_BLOCKS;
    }

    // 2. Within the chosen tier, pick uniformly at random
    //    Exception: Dot rescue boost when occupancy > 70% and Easy tier selected
    if (tier === EASY_BLOCKS && occupancy > 0.7) {
        // Dot gets 5x weight boost within Easy tier
        // Easy has 11 blocks. Dot normally has 1/11 chance.
        // With 5x boost: Dot weight = 5, others = 1 each, total = 15
        // Dot probability: 5/15 = 33%
        const DOT_BOOST = 5;
        const totalWeight = (EASY_BLOCKS.length - 1) + DOT_BOOST;
        const r = Math.random() * totalWeight;
        if (r < DOT_BOOST) {
            return EASY_BLOCKS[0]; // Dot is always first in EASY_BLOCKS
        }
        // Pick from remaining
        const idx = 1 + Math.floor(Math.random() * (EASY_BLOCKS.length - 1));
        return EASY_BLOCKS[idx];
    }

    return tier[Math.floor(Math.random() * tier.length)];
}

// ─── Utility ────────────────────────────────────────────

/**
 * 盤面の占有率を計算する (O(n²) → ループ前に1回だけ呼ぶ)
 */
export function calcOccupancy(board: (string | 0)[][]): number {
    let filled = 0;
    for (let r = 0; r < board.length; r++) {
        for (let c = 0; c < board[r].length; c++) {
            if (board[r][c] !== 0) filled++;
        }
    }
    return filled / (board.length * board[0].length);
}
