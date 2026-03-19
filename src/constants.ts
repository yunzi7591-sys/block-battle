// Shared UI constants across components
export const BOARD_CELL_MARGIN = 2;
export const BOARD_PADDING = 8;
export const TRAY_CELL_SIZE = 18;
export const CLEAR_ANIMATION_MS = 120;

// ─── Drag & Drop: Unified Accelerated Model ──────────────
//
//  Acceleration: 1.5x on both axes (reduces finger travel)
//  LIFT_OFFSET:  Block floats above finger for visibility
//  Single coordinate set used for BOTH rendering and hit-test
//

/** Drag acceleration multiplier (both axes). */
export const DRAG_ACCEL = 1.5;
/** Y offset to lift block above finger during drag. Negative = upward. */
export const LIFT_OFFSET = -20;
