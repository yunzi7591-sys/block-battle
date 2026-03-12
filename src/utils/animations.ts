/**
 * Shared Animation Presets (react-native-reanimated)
 *
 * Centralised spring/timing configs for consistent motion design.
 * All values tuned for 60fps on mid-range devices.
 */

import { WithSpringConfig, WithTimingConfig, Easing } from 'react-native-reanimated';

// ─── Spring Presets ───────────────────────────────────────
export const SPRING_BOUNCY: WithSpringConfig = {
    damping: 8,
    stiffness: 150,
    mass: 0.8,
};

export const SPRING_SNAPPY: WithSpringConfig = {
    damping: 12,
    stiffness: 200,
    mass: 0.6,
};

export const SPRING_GENTLE: WithSpringConfig = {
    damping: 15,
    stiffness: 100,
    mass: 1,
};

// ─── Timing Presets ───────────────────────────────────────
export const TIMING_FAST: WithTimingConfig = {
    duration: 150,
    easing: Easing.out(Easing.cubic),
};

export const TIMING_MEDIUM: WithTimingConfig = {
    duration: 300,
    easing: Easing.out(Easing.cubic),
};

export const TIMING_SLOW: WithTimingConfig = {
    duration: 600,
    easing: Easing.out(Easing.cubic),
};

// ─── Result Screen Colors ─────────────────────────────────
export const RESULT_COLORS = {
    victoryGold: '#FFD700',
    victoryGoldGlow: 'rgba(255,215,0,0.3)',
    defeatRed: '#E94560',
    defeatRedGlow: 'rgba(233,69,96,0.3)',
    turnBlue: '#4DA8DA',
    turnRed: '#E94560',
    ratingGreen: '#4CAF50',
    ratingRed: '#FF5252',
} as const;

// ─── Stagger Delay Helper ─────────────────────────────────
export const staggerDelay = (index: number, intervalMs: number = 80) =>
    index * intervalMs;
