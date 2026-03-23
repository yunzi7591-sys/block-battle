import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import { View, StyleSheet, LayoutChangeEvent, Animated, Text, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useGameStore } from '../store/gameStore';
import { useOnlinePvPStore } from '../store/onlinePvPStore';
import { useShallow } from 'zustand/react/shallow';
import { BOARD_SIZE } from '../game/board';
import { BOARD_CELL_MARGIN, BOARD_PADDING, CLEAR_ANIMATION_MS } from '../constants';
import { StainedGlassCell } from './StainedGlassCell';
import { GlassShatterCell } from './GlassShatterCell';
import { hapticHeavy } from '../utils/haptics';
import { playClearSound, playComboSound, playCheerSound } from '../utils/sounds';
import ReAnimated, { useSharedValue, useAnimatedStyle, withSequence, withTiming, Easing as REasing } from 'react-native-reanimated';

// --- Giga Glass Shatter Particle (Reanimated UIThread — 60fps保証) ---
const SHATTER_COLORS = ['#4DA8DA', '#9B59B6', '#E74C3C', '#F1C40F', '#2ECC71', '#E67E22'];
const PARTICLE_COUNT = 20; // 25→20に削減（視覚的に同等、負荷軽減）

interface ParticleConfig {
    destX: number; destY: number; color: string; size: number;
}

function GlassShatterParticle({ config }: { config: ParticleConfig }) {
    const progress = useSharedValue(0);
    useEffect(() => {
        progress.value = withTiming(1, { duration: 1500, easing: REasing.out(REasing.cubic) });
    }, []);
    const animStyle = useAnimatedStyle(() => {
        const p = progress.value;
        return {
            opacity: p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3,
            transform: [
                { translateX: p * config.destX },
                { translateY: p * config.destY },
                { rotate: `${p * 360}deg` },
                { scale: 1 - p * 0.8 },
            ],
        };
    });
    return (
        <ReAnimated.View
            style={[
                {
                    position: 'absolute',
                    width: config.size, height: config.size,
                    backgroundColor: config.color,
                    borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)',
                },
                animStyle,
            ]}
        />
    );
}

function GlassShatterEffect() {
    const showPerfectClear = useGameStore(s => s.showPerfectClear);
    const [particles, setParticles] = useState<ParticleConfig[]>([]);
    useEffect(() => {
        if (showPerfectClear) {
            const configs: ParticleConfig[] = Array.from({ length: PARTICLE_COUNT }, () => {
                const angle = Math.random() * Math.PI * 2;
                const distance = 150 + Math.random() * 200;
                return {
                    destX: Math.cos(angle) * distance,
                    destY: Math.sin(angle) * distance,
                    color: SHATTER_COLORS[Math.floor(Math.random() * SHATTER_COLORS.length)],
                    size: 15 + Math.random() * 25,
                };
            });
            setParticles(configs);
            const timer = setTimeout(() => setParticles([]), 2000);
            return () => clearTimeout(timer);
        }
    }, [showPerfectClear]);
    if (particles.length === 0) return null;
    return (
        <View style={styles.shatterEffectContainer} pointerEvents="none">
            {particles.map((cfg, i) => <GlassShatterParticle key={i} config={cfg} />)}
        </View>
    );
}

// --- Floating Score Text Animation ---
function FloatingScoreManager() {
    const clearingCells = useGameStore((s) => s.clearingCells);
    const scoreEarned = useGameStore((s) => s.scoreEarned);
    const comboCount = useGameStore((s) => s.comboCount);
    const boardLayout = useGameStore((s) => s.boardLayout);
    const [scores, setScores] = useState<{ id: number; text: string; x: number; y: number; isCombo: boolean }[]>([]);

    useEffect(() => {
        if (clearingCells && clearingCells.length > 0 && scoreEarned && boardLayout) {
            let sumR = 0, sumC = 0;
            clearingCells.forEach(([r, c]) => { sumR += r; sumC += c; });
            const avgR = sumR / clearingCells.length;
            const avgC = sumC / clearingCells.length;
            const x = (avgC + 0.5) * boardLayout.cellSize + BOARD_PADDING;
            const y = (avgR + 0.5) * boardLayout.cellSize + BOARD_PADDING;
            const id = Date.now();
            const text = "+" + scoreEarned + (comboCount > 1 ? ` (${comboCount} CHAIN!)` : "");
            setScores((prev) => [...prev, { id, text, x, y, isCombo: comboCount > 1 }]);
            setTimeout(() => setScores((prev) => prev.filter((s) => s.id !== id)), 1500);
        }
    }, [clearingCells, scoreEarned, comboCount, boardLayout]);

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {scores.map((s) => (
                <FloatingScoreItem key={s.id} data={s} />
            ))}
        </View>
    );
}

function FloatingScoreItem({ data }: { data: any }) {
    const anim = useRef(new Animated.Value(0)).current;
    useEffect(() => Animated.timing(anim, { toValue: 1, duration: 1200, useNativeDriver: false }).start(), [anim]);
    return (
        <Animated.View
            style={[
                styles.floatingScoreContainer,
                {
                    left: data.x, top: data.y,
                    opacity: anim.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 1, 1, 0] }),
                    transform: [
                        { translateX: -50 }, { translateY: -20 },
                        { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -60] }) },
                        { scale: anim.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.5, 1.2, 1] }) },
                    ],
                },
            ]}
        >
            <Text style={[styles.floatingScoreText, data.isCombo && styles.comboText]}>{data.text}</Text>
        </Animated.View>
    );
}

// --- Multiclear/Combo Massive Overlay ---
function MulticlearOverlay() {
    const lastLinesCleared = useGameStore((s) => s.lastLinesCleared);
    const comboCount = useGameStore((s) => s.comboCount);
    const isCrossClear = useGameStore((s) => s.isCrossClear);
    const [display, setDisplay] = useState<{ text: string; color: string; isCross: boolean } | null>(null);
    const anim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (lastLinesCleared > 0) {
            let text = ""; let color = "#FFD700";
            if (isCrossClear) { text = "CROSS CLEAR!!"; color = "#FFD700"; }
            else if (lastLinesCleared === 2) { text = "DOUBLE!"; color = "#4DA8DA"; }
            else if (lastLinesCleared === 3) { text = "TRIPLE!"; color = "#9B59B6"; }
            else if (lastLinesCleared >= 4) { text = "QUADRUPLE!"; color = "#E74C3C"; }
            else if (comboCount > 1) { text = `${comboCount} CHAIN!`; color = "#F1C40F"; }

            if (text) {
                setDisplay({ text, color, isCross: isCrossClear });
                anim.setValue(0);
                Animated.sequence([
                    Animated.spring(anim, { toValue: 1, friction: 4, useNativeDriver: true }),
                    Animated.timing(anim, { toValue: 0, duration: 500, delay: 800, useNativeDriver: true }),
                ]).start(() => setDisplay(null));
            }
        }
    }, [lastLinesCleared, comboCount, isCrossClear]);

    if (!display) return null;
    return (
        <View style={styles.massiveOverlayContainer} pointerEvents="none">
            <Animated.View
                pointerEvents="none"
                style={[
                    styles.massiveOverlayBox,
                    { borderColor: display.color, backgroundColor: display.isCross ? 'rgba(255,215,0,0.2)' : 'rgba(0,0,0,0.8)' },
                    {
                        opacity: anim.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 1, 1, 0] }),
                        transform: [{ scale: anim.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0.5, 1.5, 1.2] }) }],
                    },
                ]}
            >
                <Text style={[styles.massiveOverlayText, { color: display.color }, display.isCross && styles.crossTextGlow]}>{display.text}</Text>
            </Animated.View>
        </View>
    );
}

// ─── Memoized Board Cell (PERF) ────────────────────────
// Prevents 64-cell re-render cascade on preview/clearing changes.
// Only cells whose state actually changed will re-render.
const BoardCell = React.memo(({
    rIndex, cIndex, cell, isClearing, isPreview, previewColor, cellSize, left, top,
}: {
    rIndex: number;
    cIndex: number;
    cell: number | string;
    isClearing: boolean;
    isPreview: boolean;
    previewColor: string | undefined;
    cellSize: number;
    left: number;
    top: number;
}) => {
    if (isClearing) {
        const stagger = (rIndex + cIndex) * 3;
        return (
            <View style={[cellStyles.absolute, { left, top, width: cellSize, height: cellSize, overflow: 'visible', zIndex: 10 }]}>
                <GlassShatterCell
                    color={typeof cell === 'string' ? cell : '#FFFFFF'}
                    cellSize={cellSize}
                    staggerDelay={stagger}
                />
            </View>
        );
    }
    if (typeof cell === 'string' || isPreview) {
        const color = isPreview ? (previewColor || '#CCCCCC') : (cell as string);
        return (
            <View style={[cellStyles.absolute, { left, top, width: cellSize, height: cellSize }]}>
                <StainedGlassCell color={color} size={cellSize} margin={0} isPreview={isPreview} rowIndex={rIndex} colIndex={cIndex} />
            </View>
        );
    }
    return <View style={[cellStyles.empty, { left, top, width: cellSize, height: cellSize }]} />;
});

const cellStyles = StyleSheet.create({
    absolute: { position: 'absolute' },
    empty: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.08)' },
});

// ─── Opponent Move Highlight (PvP only) ─────────────────
function OpponentMoveHighlight({ row, col, cellSize }: { row: number; col: number; cellSize: number }) {
    const opacity = useSharedValue(1);
    const scale = useSharedValue(1.3);

    useEffect(() => {
        opacity.value = withSequence(
            withTiming(1, { duration: 0 }),
            withTiming(0.6, { duration: 300 }),
            withTiming(1, { duration: 300 }),
            withTiming(0.6, { duration: 300 }),
            withTiming(0, { duration: 500 }),
        );
        scale.value = withSequence(
            withTiming(1.3, { duration: 0 }),
            withTiming(1, { duration: 400, easing: REasing.out(REasing.cubic) }),
        );
    }, []);

    const animStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ scale: scale.value }],
    }));

    return (
        <ReAnimated.View
            style={[
                {
                    position: 'absolute',
                    left: col * cellSize + BOARD_PADDING - 2,
                    top: row * cellSize + BOARD_PADDING - 2,
                    width: cellSize + 4,
                    height: cellSize + 4,
                    borderRadius: 4,
                    borderWidth: 2.5,
                    borderColor: '#E94560',
                    backgroundColor: 'rgba(233, 69, 96, 0.15)',
                    zIndex: 50,
                },
                animStyle,
            ]}
            pointerEvents="none"
        />
    );
}

export function BoardView({ isPvP }: { isPvP?: boolean }) {
    const viewRef = useRef<View>(null);

    // Highly optimized selective store access
    const board = useGameStore(useShallow(s => s.board));
    const boardLayout = useGameStore(s => s.boardLayout);
    const preview = useGameStore(useShallow(s => s.preview));
    const clearingCells = useGameStore(useShallow(s => s.clearingCells));
    const comboCount = useGameStore(s => s.comboCount);
    const isPendingPerfect = useGameStore(s => s.isPendingPerfect);
    const finishClear = useGameStore(s => s.finishClear);
    const showPerfectClear = useGameStore(s => s.showPerfectClear);
    const setBoardLayout = useGameStore(s => s.setBoardLayout);

    // PvP opponent move highlight
    const lastMove = isPvP ? useOnlinePvPStore(s => s.lastMove) : null;
    const currentTurn = isPvP ? useOnlinePvPStore(s => s.currentTurn) : null;
    const [opponentHighlight, setOpponentHighlight] = useState<{ row: number; col: number; key: number } | null>(null);

    useEffect(() => {
        if (isPvP && lastMove && lastMove.uid !== currentTurn) {
            setOpponentHighlight({ row: lastMove.row, col: lastMove.col, key: Date.now() });
            const timer = setTimeout(() => setOpponentHighlight(null), 1500);
            return () => clearTimeout(timer);
        }
    }, [isPvP, lastMove, currentTurn]);

    // Screen shake on line clear
    const shakeX = useSharedValue(0);
    const shakeY = useSharedValue(0);
    const shakeStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: shakeX.value },
            { translateY: shakeY.value },
        ],
    }));

    // active constants are now always from gameStore for rendering zero-lag effects
    const activeBoard = board;
    const activeLayout = boardLayout;
    const activeSetLayout = setBoardLayout;
    const activePreview = preview;
    const activeClearingCells = clearingCells;

    const handleLayout = useCallback(
        (e: LayoutChangeEvent) => {
            const { width } = e.nativeEvent.layout;
            if (width > 0) {
                const availableWidth = width - 2 * BOARD_PADDING;
                const cellSize = Math.floor(availableWidth / 8);

                // Directly measure. onLayout is sufficient for accurate w/h, 
                // but measureInWindow ensures we get screen-space coords.
                requestAnimationFrame(() => {
                    if (viewRef.current) {
                        viewRef.current.measureInWindow((pageX, pageY, w, h) => {
                            if (w > 0) {
                                console.log(`[BoardLayout] Absolute Origin: (${pageX.toFixed(0)}, ${pageY.toFixed(0)}) Mode: ${isPvP ? 'PvP' : 'Single'}`);
                                activeSetLayout({
                                    x: pageX,
                                    y: pageY,
                                    size: cellSize * 8 + 2 * BOARD_PADDING,
                                    cellSize: cellSize,
                                });
                            }
                        });
                    }
                });
            }
        },
        [activeSetLayout, isPvP]
    );

    useEffect(() => {
        if (activeClearingCells && activeClearingCells.length > 0) {
            hapticHeavy();
            // Screen shake removed (Producer's request)
            if (isPendingPerfect) playCheerSound(); else playClearSound(comboCount);
            const timer = setTimeout(() => finishClear(), CLEAR_ANIMATION_MS);
            return () => clearTimeout(timer);
        }
    }, [activeClearingCells, finishClear, comboCount, isPendingPerfect]);

    // Memoized lookup sets — only recomputed when source data changes
    const clearingSet = useMemo(() => {
        const s = new Set<string>();
        if (activeClearingCells) activeClearingCells.forEach(([r, c]) => s.add(`${r},${c}`));
        return s;
    }, [activeClearingCells]);

    const previewSet = useMemo(() => {
        const s = new Set<string>();
        if (activePreview) {
            activePreview.shape.cells.forEach(([rOff, cOff]) => {
                const r = activePreview.row + rOff; const c = activePreview.col + cOff;
                if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) s.add(`${r},${c}`);
            });
        }
        return s;
    }, [activePreview]);

    const boardStyle: ViewStyle = activeLayout ? { width: activeLayout.size, height: activeLayout.size } : { width: '100%', aspectRatio: 1 };

    return (
        <ReAnimated.View style={shakeStyle}>
            <View
                ref={viewRef}
                style={[styles.board, boardStyle]}
                onLayout={handleLayout}
                collapsable={false}
                accessibilityLabel="Game board, 8 by 8 grid"
                accessible={true}
            >
                {activeLayout && activeBoard.map((row: any[], rIndex: number) =>
                    row.map((cell: any, cIndex: number) => {
                        const key = `${rIndex},${cIndex}`;
                        const isPrev = previewSet.has(key);
                        return (
                            <BoardCell
                                key={key}
                                rIndex={rIndex}
                                cIndex={cIndex}
                                cell={cell}
                                isClearing={clearingSet.has(key)}
                                isPreview={isPrev}
                                previewColor={isPrev ? activePreview?.shape.color : undefined}
                                cellSize={activeLayout.cellSize}
                                left={cIndex * activeLayout.cellSize + BOARD_PADDING}
                                top={rIndex * activeLayout.cellSize + BOARD_PADDING}
                            />
                        );
                    })
                )}

                {showPerfectClear && (
                    <View pointerEvents="none" style={styles.perfectOverlay}>
                        <View style={styles.perfectTextBorder}><Text style={styles.perfectText} accessibilityRole="text" accessibilityLabel="Perfect clear">PERFECT!</Text></View>
                    </View>
                )}
                <GlassShatterEffect />
                {isPvP && opponentHighlight && activeLayout && (
                    <OpponentMoveHighlight
                        key={opponentHighlight.key}
                        row={opponentHighlight.row}
                        col={opponentHighlight.col}
                        cellSize={activeLayout.cellSize}
                    />
                )}
                {!isPvP && <FloatingScoreManager />}
                {!isPvP && <MulticlearOverlay />}
            </View>
        </ReAnimated.View>
    );
}

const styles = StyleSheet.create({
    board: { backgroundColor: 'rgba(0,0,0,0.85)', borderRadius: 12, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)' },
    shatterEffectContainer: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 150 },
    floatingScoreContainer: { position: 'absolute', width: 100, height: 40, justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
    floatingScoreText: { color: '#FFD700', fontSize: 24, fontWeight: 'bold', textShadowColor: 'rgba(0,0,0,0.75)', textShadowRadius: 3 },
    comboText: { color: '#FF6347', fontSize: 28 },
    massiveOverlayContainer: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 200 },
    massiveOverlayBox: { paddingHorizontal: 30, paddingVertical: 15, borderRadius: 40, borderWidth: 4 },
    massiveOverlayText: { fontSize: 40, fontWeight: '900', textAlign: 'center' },
    crossTextGlow: { textShadowColor: '#FFD700', textShadowRadius: 25 },
    perfectOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255, 215, 0, 0.2)', justifyContent: 'center', alignItems: 'center', zIndex: 100 },
    perfectTextBorder: { backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 25, paddingVertical: 12, borderRadius: 30, borderWidth: 3, borderColor: '#FFD700' },
    perfectText: { fontSize: 48, fontWeight: '900', color: '#FFD700', textShadowColor: '#FFF', textShadowRadius: 10 },
});
