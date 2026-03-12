// Shared UI constants across components
export const BOARD_CELL_MARGIN = 2;
export const BOARD_PADDING = 8;
export const TRAY_CELL_SIZE = 18;
export const CLEAR_ANIMATION_MS = 350;

// ─── Drag & Drop: 3-Layer Y-Axis Architecture ────────────
//
//  Touch Y (raw finger)       ← baseline
//  Preview Y = Touch - 40px   ← hit-test / grid snap (just above fingertip)
//  Visual Y  = Touch - 120px  ← rendered block (well above finger for visibility)
//
//  X axis: 1:1 tracking, no acceleration.
//

/** Y offset from finger to PREVIEW (hit-test) anchor. Negative = upward. */
export const PREVIEW_Y_OFFSET = -40;
/** Y offset from finger to VISUAL BLOCK render position. Negative = upward. */
export const VISUAL_Y_OFFSET = -120;
