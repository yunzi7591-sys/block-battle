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
import { BOARD_CELL_MARGIN, BOARD_PADDING, TRAY_CELL_SIZE } from '../constants';
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

    // Grab offset: where within the block view the finger touched
    const grabOffsetRef = useRef<any>({ x: 0, y: 0, startX: 0, startY: 0, multX: 1.5, multY: 2.5, offsetY: -110 });
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
                const targetScale = 1.1;

                // 1. PRECISION INITIAL ABSOLUTE COORDINATES
                // Using pageX - locationX captures the exact absolute Top-Left of the View,
                // regardless of layout nesting or dock padding.
                const initialAbsGridX = pageX - locationX + BLOCK_PADDING;
                const initialAbsGridY = pageY - locationY + BLOCK_PADDING;

                grabOffsetRef.current = {
                    startX: pageX,
                    startY: pageY,
                    multX: 1.5,
                    multY: 2.5,
                    initialAbsGridX, // Absolute Anchor
                    initialAbsGridY,
                };

                // 2. UI INITIAL STATE (Float 60px above finger)
                pan.setOffset({ x: 0, y: -60 });
                pan.setValue({ x: 0, y: 0 });
                hapticLight();

                Animated.spring(scaleAnim, {
                    toValue: targetScale,
                    friction: 8,
                    tension: 140,
                    useNativeDriver: true,
                }).start();
            },

            onPanResponderMove: (
                e: GestureResponderEvent,
                gesture: PanResponderGestureState
            ) => {
                if (!isDraggingRef.current) return;
                const {
                    multX, multY,
                    initialAbsGridX, initialAbsGridY
                } = grabOffsetRef.current;

                // 1. CALCULATE RELATIVE DELTA (UI)
                const deltaX = gesture.dx * multX;
                const deltaY = gesture.dy * multY;

                // 2. CALCULATE ABSOLUTE TARGET (Logic SSoT)
                // currentAbs = InitialAbsolute + RelativeDelta - 60px Drift
                const currentAbsX = initialAbsGridX + deltaX;
                const currentAbsY = initialAbsGridY + deltaY - 60;

                // 3. UI RENDERING (Relative)
                pan.x.setValue(deltaX);
                pan.y.setValue(deltaY);

                // Phase 38: Read fresh block from store to avoid stale closure
                const currentGameState = useGameStore.getState();
                const currentBoard = currentGameState.board;
                const currentLayout = currentGameState.boardLayout;
                const freshBlock = currentGameState.currentBlocks[index];
                if (!freshBlock) return; // Block was placed or nulled out

                // 4. LOGICAL HIT-TEST (Using identical Absolute coordinates)
                const target = calcBestGridPosition(
                    currentAbsX,
                    currentAbsY,
                    currentBoard,
                    currentLayout,
                    freshBlock
                );

                // PERFORMANCE CRITICAL: Only trigger global state update if logical grid position changed
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
                    // Only clear preview if it was previously set
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
