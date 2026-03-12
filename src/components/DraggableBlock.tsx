import React, { useRef, useState, useMemo } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import {
    View,
    StyleSheet,
    Animated,
    PanResponder,
    GestureResponderEvent,
    PanResponderGestureState,
} from 'react-native';
import { useGameStore } from '../store/gameStore';
import { useOnlinePvPStore } from '../store/onlinePvPStore';
import { useUserStore } from '../store/userStore';
import { BlockShape } from '../game/types';
import { canPlace } from '../game/board';
import { BOARD_CELL_MARGIN, BOARD_PADDING, TRAY_CELL_SIZE, PREVIEW_Y_OFFSET, VISUAL_Y_OFFSET } from '../constants';
import { StainedGlassCell } from './StainedGlassCell';
import { hapticLight, hapticMedium, hapticError } from '../utils/haptics';
import { playPlaceSound, playErrorSound, playBGM } from '../utils/sounds';

interface Props {
    block: BlockShape;
    index: number;
    placed: boolean;
    isPvP?: boolean;
}

const BLOCK_PADDING = BOARD_PADDING; // Use shared constant

export function DraggableBlock({ block, index, placed, isPvP }: Props) {
    const pan = useRef(new Animated.ValueXY()).current;
    const scaleAnim = useRef(new Animated.Value(0.5)).current;
    const [isDragging, setIsDragging] = useState(false);
    const isDraggingRef = useRef(false);

    // Touch-start absolute position of the block's top-left grid area
    const grabOffsetRef = useRef<{ initialAbsX: number; initialAbsY: number }>({ initialAbsX: 0, initialAbsY: 0 });
    const lastPreviewRef = useRef<{ row: number; col: number } | null>(null);

    // Dynamic Store Subscription
    const singleStore = useGameStore();
    const pvpStore = useOnlinePvPStore();

    // Unified Store Authority (Phase 33 DRY - Use gameStore for all math/rendering)
    const activeBoard = singleStore.board;
    const activeBoardLayout = singleStore.boardLayout;
    const myUid = useUserStore(s => s.uid);

    // Actions
    const activePlaceBlock = isPvP ? pvpStore.placeBlockSync : singleStore.placeBlock;
    // Phase 32: Unify Preview Source (BoardView only listens to gameStore)
    const activeSetPreview = singleStore.setPreview;
    const activeTriggerBGM = isPvP ? () => { } : singleStore.triggerBGM;

    // Unified Turn Authority (Phase 28/29)
    const isMyTurn = singleStore.isMyTurn;

    // EMERGENCY OVERRIDE (For Debugging Only):
    // const isMyTurnOverride = true; 

    // Block shape bounding box (RESTORED)
    const { blockRows, blockCols, grid } = useMemo(() => {
        let maxR = 0, maxC = 0;
        block.cells.forEach(([r, c]) => {
            if (r > maxR) maxR = r;
            if (c > maxC) maxC = c;
        });
        const rows = maxR + 1;
        const cols = maxC + 1;
        const g: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
        block.cells.forEach(([r, c]) => { g[r][c] = 1; });
        return { blockRows: rows, blockCols: cols, grid: g };
    }, [block]);

    // Board cell sizing accurately (MATCHED to BoardView)
    const boardCellSize = activeBoardLayout
        ? activeBoardLayout.cellSize
        : 40; // Fallback to a reasonable default
    const trayScale = TRAY_CELL_SIZE / boardCellSize;

    // Keep scale at trayScale when idle
    React.useEffect(() => {
        if (!isDraggingRef.current) {
            scaleAnim.setValue(trayScale);
        }
    }, [trayScale, scaleAnim]);

    /**
     * Magnet Snap: Perfect Visual-to-Logical Synchronization using Top-Left Anchor.
     * Formula: (TopLeft - BoardOrigin) / CellSize
     * Phase 38: Accept currentBlock param to avoid stale closure on `block` prop.
     */
    const calcBestGridPosition = (visualTopLeftX: number, visualTopLeftY: number, currentBoard: any, bl: any, currentBlock: BlockShape) => {
        if (!bl || !currentBoard || !currentBlock) return null;

        // 1. CONVERT TOP-LEFT TO BOARD-RELATIVE COORDINATES
        const relativeX = visualTopLeftX - bl.x;
        const relativeY = visualTopLeftY - bl.y;

        // 2. MAP TO GRID INDICES (Top-Left based)
        const gridCol = Math.round(relativeX / bl.cellSize);
        const gridRow = Math.round(relativeY / bl.cellSize);

        // 3. STRICT COLLISION CHECK (uses fresh block, not stale closure)
        const canBePlaced = canPlace(currentBoard, currentBlock, gridRow, gridCol);

        // Phase 32 Debug: Visibility into Grid Calculation
        if (gridRow >= -1 && gridRow <= 8 && gridCol >= -1 && gridCol <= 8) {
            console.log(`LOG [Drag/Math] TopLeft(${visualTopLeftX.toFixed(0)}, ${visualTopLeftY.toFixed(0)}) Board(${bl.x.toFixed(0)}, ${bl.y.toFixed(0)}) => Row: ${gridRow}, Col: ${gridCol} (CanPlace: ${canBePlaced})`);
        }

        if (canBePlaced) {
            return { row: gridRow, col: gridCol };
        }

        return null; // Occupation or OOB
    };

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => {
                // CRITICAL: Always read fresh state to avoid stale closure
                const currentGame = useGameStore.getState();
                const currentPvp = useOnlinePvPStore.getState();
                const currentIsMyTurn = currentGame.isMyTurn;
                const currentPlaced = currentGame.placedFlags[index];
                const isGameOver = isPvP ? currentPvp.isGameOver : currentGame.isGameOver;
                const status = isPvP ? currentPvp.status : 'offline';
                const canStart = currentIsMyTurn && !currentPlaced && (!isPvP || status === 'playing') && !isGameOver;

                if (!canStart) {
                    console.log(`LOG [Drag/Guard] Touch denied! Reason: isMyTurn=${currentIsMyTurn}, placed=${currentPlaced}, gameOver=${isGameOver}, status=${status}, isPvP=${isPvP}`);
                }
                return canStart;
            },
            onMoveShouldSetPanResponder: () => {
                const g = useGameStore.getState();
                return g.isMyTurn && !g.placedFlags[index];
            },

            onPanResponderGrant: (e: GestureResponderEvent) => {
                // CRITICAL: Always read fresh state
                const currentGame = useGameStore.getState();
                const currentLayout = currentGame.boardLayout;
                const currentIsMyTurn = currentGame.isMyTurn;
                const currentPlaced = currentGame.placedFlags[index];

                if (!currentIsMyTurn || currentPlaced || !currentLayout) {
                    const reason = !currentLayout ? "Layout not ready" : "Not turn or already placed";
                    console.log(`LOG [DraggableGuard] Drag blocked! Reason: ${reason}`);
                    return;
                }
                setIsDragging(true);
                isDraggingRef.current = true;
                lastPreviewRef.current = null;
                activeTriggerBGM();
                hapticLight();

                const { pageX, pageY, locationX, locationY } = e.nativeEvent;

                // Absolute top-left of the block's grid area at touch start
                const initialAbsX = pageX - locationX + BLOCK_PADDING;
                const initialAbsY = pageY - locationY + BLOCK_PADDING;

                grabOffsetRef.current = { initialAbsX, initialAbsY };

                // 3-Layer Y offset: Visual block floats at VISUAL_Y_OFFSET above finger
                pan.setOffset({ x: 0, y: VISUAL_Y_OFFSET });
                pan.setValue({ x: 0, y: 0 });

                // Scale to 1.0 — exact match with board cell size
                Animated.spring(scaleAnim, {
                    toValue: 1.0,
                    friction: 8,
                    tension: 140,
                    useNativeDriver: true,
                }).start();
            },

            onPanResponderMove: (
                _e: GestureResponderEvent,
                gesture: PanResponderGestureState
            ) => {
                if (!isDraggingRef.current) return;
                const { initialAbsX, initialAbsY } = grabOffsetRef.current;

                // ─── 3-Layer Y-Axis Architecture ───────────────
                //
                //  Layer 1 — Touch:   gesture.dx, gesture.dy (raw finger delta)
                //  Layer 2 — Preview: Touch + PREVIEW_Y_OFFSET (-40px)
                //                     → Used for hit-test / grid snap
                //  Layer 3 — Visual:  Touch + VISUAL_Y_OFFSET (-120px)
                //                     → Used for block rendering (pan.setValue)
                //
                //  X axis: 1:1 tracking (dx used directly, no multiplier)
                // ────────────────────────────────────────────────

                const dx = gesture.dx; // X: pure 1:1 tracking
                const dy = gesture.dy; // Y: raw finger delta

                // 1. UI RENDERING — block floats at VISUAL_Y_OFFSET above finger
                //    pan.offset already set to VISUAL_Y_OFFSET in onGrant
                pan.x.setValue(dx);
                pan.y.setValue(dy);

                // 2. HIT-TEST — preview snaps at PREVIEW_Y_OFFSET (closer to finger)
                //    This is where the "shadow" on the board will appear
                const previewTopLeftX = initialAbsX + dx;
                const previewTopLeftY = initialAbsY + dy + PREVIEW_Y_OFFSET;

                // Phase 38: Read fresh block from store to avoid stale closure
                const currentGameState = useGameStore.getState();
                const currentBoard = currentGameState.board;
                const currentLayout = currentGameState.boardLayout;
                const freshBlock = currentGameState.currentBlocks[index];
                if (!freshBlock) return;

                // 3. GRID SNAP using preview coordinates
                const target = calcBestGridPosition(
                    previewTopLeftX,
                    previewTopLeftY,
                    currentBoard,
                    currentLayout,
                    freshBlock
                );

                // PERFORMANCE: Only trigger state update if grid position changed
                if (target) {
                    const isNewPos = !lastPreviewRef.current ||
                        lastPreviewRef.current.row !== target.row ||
                        lastPreviewRef.current.col !== target.col;

                    if (isNewPos) {
                        console.log(`[SnapSync] Grid Index Changed: (${target.row}, ${target.col})`);
                        hapticLight();
                        lastPreviewRef.current = target;
                        activeSetPreview({
                            shape: freshBlock,
                            row: target.row,
                            col: target.col,
                        });
                    }
                } else {
                    if (lastPreviewRef.current !== null) {
                        lastPreviewRef.current = null;
                        activeSetPreview(null);
                    }
                }
            },

            onPanResponderRelease: (
                _e: GestureResponderEvent,
                _gesture: PanResponderGestureState
            ) => {
                if (!isDraggingRef.current) return;
                setIsDragging(false);
                isDraggingRef.current = false;
                pan.flattenOffset();
                activeSetPreview(null);

                const target = lastPreviewRef.current;

                // Phase 38: Read ALL state fresh from stores (avoid stale closures)
                const currentGame = useGameStore.getState();
                const currentPvp = useOnlinePvPStore.getState();
                const board = currentGame.board;
                const freshBlock = currentGame.currentBlocks[index];
                const dropIsMyTurn = currentGame.isMyTurn;
                const dropPlacedFlags = currentGame.placedFlags;
                const dropIsProcessing = currentPvp.isProcessingPlacement;
                const dropStatus = currentPvp.status;

                console.log(`[Drag/Drop] State at drop: isMyTurn=${dropIsMyTurn}, placedFlags=${JSON.stringify(dropPlacedFlags)}, isProcessing=${dropIsProcessing}, status=${dropStatus}, target=${JSON.stringify(target)}, blockIndex=${index}, hasBlock=${!!freshBlock}`);

                if (!freshBlock) {
                    console.warn(`[Drag/Drop] Rejected: block at index ${index} is null/undefined in store`);
                } else if (target && canPlace(board, freshBlock, target.row, target.col)) {
                    // Extra guard: verify placement is still allowed
                    if (!dropIsMyTurn) {
                        console.warn(`[Drag/Drop] Rejected: isMyTurn is false at drop time`);
                    } else if (dropPlacedFlags[index]) {
                        console.warn(`[Drag/Drop] Rejected: placedFlags[${index}] is already true`);
                    } else {
                        console.log(`[PlacementSuccess] Block ${index} at (${target.row}, ${target.col})`);
                        hapticMedium();
                        playPlaceSound();
                        activePlaceBlock(index, target.row, target.col);
                        pan.setValue({ x: 0, y: 0 });
                        scaleAnim.setValue(trayScale);
                        lastPreviewRef.current = null;
                        return; // Success path - skip cancel animation
                    }
                }

                // CANCEL: Returns to tray
                const reason = !target
                    ? "No target (Out of Bounds)"
                    : !freshBlock
                        ? `block[${index}] is null in store`
                        : !canPlace(board, freshBlock, target.row, target.col)
                            ? `canPlace=false at (${target.row},${target.col})`
                            : !dropIsMyTurn
                                ? "isMyTurn=false"
                                : dropPlacedFlags[index]
                                    ? `placedFlags[${index}]=true`
                                    : "Unknown";
                console.log(`LOG [PlacementCancelled] Reason: ${reason}`);

                lastPreviewRef.current = null;
                hapticError();
                playErrorSound();
                Animated.parallel([
                    Animated.spring(pan, { toValue: { x: 0, y: 0 }, friction: 7, useNativeDriver: true }),
                    Animated.spring(scaleAnim, { toValue: trayScale, friction: 7, useNativeDriver: true }),
                ]).start();
            },
        })
    ).current;

    if (placed) {
        return <View style={styles.placeholder} />;
    }

    const renderCellSize = boardCellSize;
    const renderMargin = BOARD_CELL_MARGIN;

    return (
        <Animated.View
            {...panResponder.panHandlers}
            style={[
                styles.blockContainer,
                {
                    width: blockCols * renderCellSize + 2 * BLOCK_PADDING,
                    height: blockRows * renderCellSize + 2 * BLOCK_PADDING,
                    transform: [
                        { translateX: pan.x },
                        { translateY: pan.y },
                        { scale: scaleAnim },
                    ],
                    zIndex: isDragging ? 1000 : 1,
                    elevation: isDragging ? 10 : 0,
                },
            ]}
        >
            {grid.map((row: number[], rIdx: number) =>
                row.map((cell: number, cIdx: number) => (
                    cell === 1 && (
                        <View
                            key={`${rIdx}-${cIdx}`}
                            pointerEvents="none"
                            style={[
                                styles.absoluteCell,
                                {
                                    left: cIdx * renderCellSize + BLOCK_PADDING,
                                    top: rIdx * renderCellSize + BLOCK_PADDING,
                                    width: renderCellSize,
                                    height: renderCellSize,
                                },
                            ]}
                        >
                            <StainedGlassCell
                                color={block.color}
                                size={renderCellSize}
                                margin={0}
                                opacity={0.8}
                                isPreview={false}
                                rowIndex={rIdx}
                                colIndex={cIdx}
                            />
                        </View>
                    )
                ))
            )}
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    blockContainer: {
        padding: BLOCK_PADDING,
    },
    placeholder: {
        width: 70,
        height: 70,
    },
    absoluteCell: {
        position: 'absolute',
    },
});
