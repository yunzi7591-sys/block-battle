import React, { useRef, useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, LayoutChangeEvent, Animated, Text, Easing, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useGameStore } from '../store/gameStore';
import { useOnlinePvPStore } from '../store/onlinePvPStore';
import { useShallow } from 'zustand/react/shallow';
import { BOARD_SIZE } from '../game/board';
import { BOARD_CELL_MARGIN, BOARD_PADDING, CLEAR_ANIMATION_MS } from '../constants';
import { StainedGlassCell } from './StainedGlassCell';
import { hapticHeavy } from '../utils/haptics';
import { playClearSound, playComboSound, playCheerSound } from '../utils/sounds';

// --- Particle Animation for Cleared Cells ---
function ClearingCellParticle({ color }: { color: string }) {
    const anim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.timing(anim, {
            toValue: 1,
            duration: CLEAR_ANIMATION_MS * 0.8,
            easing: Easing.out(Easing.back(1.5)),
            useNativeDriver: false,
        }).start();
    }, [anim]);

    const fragments = [
        { transX: -25, transY: -25, rot: '-75deg' },
        { transX: 25, transY: -25, rot: '75deg' },
        { transX: -25, transY: 25, rot: '-135deg' },
        { transX: 25, transY: 25, rot: '135deg' },
    ];

    return (
        <View style={StyleSheet.absoluteFill}>
            {fragments.map((frag, i) => (
                <Animated.View
                    key={i}
                    style={[
                        {
                            position: 'absolute',
                            width: '50%',
                            height: '50%',
                            backgroundColor: color,
                            borderWidth: 1,
                            borderColor: '#4A4A4A',
                            left: i % 2 === 0 ? 0 : '50%',
                            top: i < 2 ? 0 : '50%',
                            opacity: anim.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
                            transform: [
                                { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [0, frag.transX] }) },
                                { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, frag.transY] }) },
                                { rotate: anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', frag.rot] }) },
                                { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.5] }) }
                            ],
                        },
                    ]}
                >
                    <LinearGradient
                        colors={['rgba(255,255,255,0.9)', 'rgba(255,255,255,0.2)', 'rgba(0,0,0,0.5)']}
                        locations={[0, 0.4, 1]}
                        style={StyleSheet.absoluteFill}
                    />
                </Animated.View>
            ))}
        </View>
    );
}

// --- Giga Glass Shatter Particle (for Perfect Clear) ---
const SHATTER_COLORS = ['#4DA8DA', '#9B59B6', '#E74C3C', '#F1C40F', '#2ECC71', '#E67E22'];
function GlassShatterParticle({ id }: { id: number }) {
    const anim = useRef(new Animated.Value(0)).current;
    const angle = Math.random() * Math.PI * 2;
    const distance = 150 + Math.random() * 200;
    const destX = Math.cos(angle) * distance;
    const destY = Math.sin(angle) * distance;
    const color = SHATTER_COLORS[Math.floor(Math.random() * SHATTER_COLORS.length)];
    const size = 15 + Math.random() * 25;
    useEffect(() => {
        Animated.timing(anim, { toValue: 1, duration: 1500, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }, [anim]);
    return (
        <Animated.View
            style={[
                {
                    position: 'absolute',
                    width: size, height: size,
                    backgroundColor: color,
                    borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)',
                    opacity: anim.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
                    transform: [
                        { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [0, destX] }) },
                        { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, destY] }) },
                        { rotate: anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
                        { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.2] }) },
                    ],
                },
            ]}
        />
    );
}

function GlassShatterEffect() {
    const showPerfectClear = useGameStore(s => s.showPerfectClear);
    const [particles, setParticles] = useState<number[]>([]);
    useEffect(() => {
        if (showPerfectClear) {
            const newParticles = Array.from({ length: 25 }, (_, i) => Date.now() + i);
            setParticles(newParticles);
            const timer = setTimeout(() => setParticles([]), 2000);
            return () => clearTimeout(timer);
        }
    }, [showPerfectClear]);
    if (particles.length === 0) return null;
    return (
        <View style={styles.shatterEffectContainer} pointerEvents="none">
            {particles.map(id => <GlassShatterParticle key={id} id={id} />)}
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
            if (isPendingPerfect) playCheerSound(); else playClearSound(comboCount);
            const timer = setTimeout(() => finishClear(), CLEAR_ANIMATION_MS);
            return () => clearTimeout(timer);
        }
    }, [activeClearingCells, finishClear, comboCount, isPendingPerfect]);

    // Lookup sets
    const clearingSet = new Set<string>();
    if (activeClearingCells) activeClearingCells.forEach(([r, c]) => clearingSet.add(`${r},${c}`));

    const previewSet = new Set<string>();
    if (activePreview) {
        activePreview.shape.cells.forEach(([rOff, cOff]) => {
            const r = activePreview.row + rOff; const c = activePreview.col + cOff;
            if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) previewSet.add(`${r},${c}`);
        });
    }

    const boardStyle: ViewStyle = activeLayout ? { width: activeLayout.size, height: activeLayout.size } : { width: '100%', aspectRatio: 1 };

    return (
        <Animated.View
            ref={viewRef}
            style={[styles.board, boardStyle]}
            onLayout={handleLayout}
            collapsable={false}
        >
            {activeLayout && activeBoard.map((row: any[], rIndex: number) =>
                row.map((cell: any, cIndex: number) => {
                    const key = `${rIndex},${cIndex}`;
                    const isClearing = clearingSet.has(key);
                    const isPreview = previewSet.has(key);
                    const left = cIndex * activeLayout.cellSize + BOARD_PADDING;
                    const top = rIndex * activeLayout.cellSize + BOARD_PADDING;

                    if (isClearing) {
                        return (
                            <View key={key} style={[styles.absoluteCell, { left, top, width: activeLayout.cellSize, height: activeLayout.cellSize }]}>
                                <ClearingCellParticle color={typeof cell === 'string' ? cell : '#FFFFFF'} />
                            </View>
                        );
                    }
                    if (typeof cell === 'string' || isPreview) {
                        const color = isPreview ? activePreview?.shape.color : (cell as string);
                        return (
                            <View key={key} style={[styles.absoluteCell, { left, top, width: activeLayout.cellSize, height: activeLayout.cellSize }]}>
                                <StainedGlassCell color={color || '#CCCCCC'} size={activeLayout.cellSize} margin={0} isPreview={isPreview} rowIndex={rIndex} colIndex={cIndex} />
                            </View>
                        );
                    }
                    return <View key={key} style={[styles.emptySlot, { left, top, width: activeLayout.cellSize, height: activeLayout.cellSize }]} />;
                })
            )}

            {showPerfectClear && (
                <View pointerEvents="none" style={styles.perfectOverlay}>
                    <View style={styles.perfectTextBorder}><Text style={styles.perfectText}>PERFECT!</Text></View>
                </View>
            )}
            <GlassShatterEffect />
            {!isPvP && <FloatingScoreManager />}
            {!isPvP && <MulticlearOverlay />}
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    board: { backgroundColor: 'rgba(0,0,0,0.85)', borderRadius: 12, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)' },
    absoluteCell: { position: 'absolute' },
    emptySlot: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.05)' },
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
