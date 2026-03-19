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
import { BlockShape } from '../game/types';
import { canPlace } from '../game/board';
import { BOARD_CELL_MARGIN, BOARD_PADDING, TRAY_CELL_SIZE, DRAG_ACCEL, LIFT_OFFSET } from '../constants';
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

    // ─── Selective Store Subscriptions (PERF) ──────────────
    // CRITICAL: Only subscribe to render-affecting properties.
    // PanResponder handlers read fresh state via getState().
    // Full-store subscription was causing re-renders on EVERY
    // state change (score, combo, clearing, etc.) during gameplay.
    const activeBoardLayout = useGameStore(s => s.boardLayout);

    // Actions — Zustand returns stable refs, never trigger re-renders
    const soloPlaceBlock = useGameStore(s => s.placeBlock);
    const activeSetPreview = useGameStore(s => s.setPreview);
    const soloTriggerBGM = useGameStore(s => s.triggerBGM);
    const pvpPlaceBlockSync = useOnlinePvPStore(s => s.placeBlockSync);

    const activePlaceBlock = isPvP ? pvpPlaceBlockSync : soloPlaceBlock;
    const activeTriggerBGM = isPvP ? () => {} : soloTriggerBGM;

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
        //    ★ BOARD_PADDINGを減算してグリッド原点に合わせる
        const relativeX = visualTopLeftX - bl.x - BOARD_PADDING;
        const relativeY = visualTopLeftY - bl.y - BOARD_PADDING;

        // 2. MAP TO GRID INDICES (Top-Left based)
        const gridCol = Math.round(relativeX / bl.cellSize);
        const gridRow = Math.round(relativeY / bl.cellSize);

        // 3. STRICT COLLISION CHECK (uses fresh block, not stale closure)
        const canBePlaced = canPlace(currentBoard, currentBlock, gridRow, gridCol);

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

                // Unified lift: block floats at LIFT_OFFSET above finger
                pan.setOffset({ x: 0, y: LIFT_OFFSET });
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

                // ─── Unified Accelerated Model ─────────────────
                //
                //  Acceleration: DRAG_ACCEL (1.5x) on both axes
                //  Single coordinate set for rendering AND hit-test
                //  LIFT_OFFSET applied via pan.offset (set in onGrant)
                //
                // ────────────────────────────────────────────────

                const acceleratedDx = gesture.dx * DRAG_ACCEL;
                const acceleratedDy = gesture.dy * DRAG_ACCEL;

                // 1. UI RENDERING — accelerated + LIFT_OFFSET via pan.offset
                pan.x.setValue(acceleratedDx);
                pan.y.setValue(acceleratedDy);

                // 2. HIT-TEST — SAME coordinates as rendering (unified)
                //    targetXY = where the block's top-left is visually rendered
                const previewTopLeftX = initialAbsX + acceleratedDx;
                const previewTopLeftY = initialAbsY + acceleratedDy + LIFT_OFFSET;

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

                if (!freshBlock) {
                    // no-op: block is null
                } else if (target && canPlace(board, freshBlock, target.row, target.col)) {
                    // Extra guard: verify placement is still allowed
                    if (!dropIsMyTurn) {
                        // Rejected: not my turn
                    } else if (dropPlacedFlags[index]) {
                        // Rejected: already placed
                    } else {
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
                                    left: cIdx * renderCellSize,
                                    top: rIdx * renderCellSize,
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
