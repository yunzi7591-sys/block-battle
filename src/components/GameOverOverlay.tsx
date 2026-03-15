/**
 * GameOverOverlay
 *
 * Rich animated result screen for PvP matches.
 * - Victory: confetti burst (react-native-confetti-cannon), trophy spring, golden glow
 * - Defeat: screen-shake, red vignette, heavy X-icon drop
 * - Rating counter: old→new animated interpolation
 *
 * All motion runs on the UI thread via react-native-reanimated.
 */

import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import ConfettiCannon from 'react-native-confetti-cannon';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withSpring,
    withDelay,
    withSequence,
    withRepeat,
    Easing,
    runOnJS,
    useDerivedValue,
    useAnimatedProps,
} from 'react-native-reanimated';
import { AnimatedPressable } from './AnimatedPressable';
import { SPRING_BOUNCY, SPRING_SNAPPY, RESULT_COLORS } from '../utils/animations';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
    isWin: boolean;
    userName: string;
    isRanked: boolean;
    ratingChange: number | null;
    oldRating: number;
    newRating: number;
    onExit: () => void;
}

// ─── Animated Rating Counter ──────────────────────────────
function AnimatedRatingCounter({ from, to }: { from: number; to: number }) {
    const progress = useSharedValue(from);
    const [display, setDisplay] = React.useState(from);

    useDerivedValue(() => {
        runOnJS(setDisplay)(Math.round(progress.value));
    });

    useEffect(() => {
        progress.value = withDelay(
            800,
            withTiming(to, { duration: 600, easing: Easing.out(Easing.cubic) })
        );
    }, [to]);

    return <Text style={styles.ratingValue}>{display}</Text>;
}

// ─── Main Component ───────────────────────────────────────
export function GameOverOverlay({
    isWin,
    userName,
    isRanked,
    ratingChange,
    oldRating,
    newRating,
    onExit,
}: Props) {
    const confettiRef = useRef<any>(null);

    // ── Shared values ──
    const backdropOpacity = useSharedValue(0);
    const iconScale = useSharedValue(0);
    const iconTranslateY = useSharedValue(isWin ? 0 : -200);
    const titleScale = useSharedValue(0.3);
    const titleOpacity = useSharedValue(0);
    const nameOpacity = useSharedValue(0);
    const nameTranslateY = useSharedValue(10);
    const ratingOpacity = useSharedValue(0);
    const deltaScale = useSharedValue(0);
    const buttonOpacity = useSharedValue(0);
    const buttonTranslateY = useSharedValue(30);
    const shakeX = useSharedValue(0);
    const goldenGlowOpacity = useSharedValue(0);
    const vignetteOpacity = useSharedValue(0);

    // ── Orchestration on mount ──
    useEffect(() => {
        // 1. Backdrop (0-200ms)
        backdropOpacity.value = withTiming(1, { duration: 200 });

        // 2. Icon (200-600ms)
        if (isWin) {
            iconScale.value = withDelay(200, withSpring(1, SPRING_BOUNCY));
            goldenGlowOpacity.value = withDelay(400,
                withRepeat(
                    withSequence(
                        withTiming(0.6, { duration: 800 }),
                        withTiming(1, { duration: 800 })
                    ),
                    -1, true
                )
            );
            // Fire confetti
            setTimeout(() => confettiRef.current?.start(), 300);
        } else {
            // Defeat: heavy drop + screen shake
            iconTranslateY.value = withDelay(200,
                withSpring(0, { damping: 6, stiffness: 80 })
            );
            iconScale.value = withDelay(200, withTiming(1, { duration: 100 }));
            shakeX.value = withDelay(400,
                withSequence(
                    withTiming(-8, { duration: 50 }),
                    withTiming(8, { duration: 50 }),
                    withTiming(-5, { duration: 50 }),
                    withTiming(5, { duration: 50 }),
                    withTiming(-2, { duration: 50 }),
                    withTiming(0, { duration: 50 })
                )
            );
            vignetteOpacity.value = withDelay(300,
                withTiming(1, { duration: 500 })
            );
        }

        // 3. Title (400-700ms)
        titleScale.value = withDelay(400, withSpring(1, SPRING_BOUNCY));
        titleOpacity.value = withDelay(400, withTiming(1, { duration: 300 }));

        // 4. Username (600-800ms)
        nameOpacity.value = withDelay(600, withTiming(1, { duration: 200 }));
        nameTranslateY.value = withDelay(600, withTiming(0, { duration: 200 }));

        // 5. Rating (800ms)
        if (isRanked && ratingChange !== null) {
            ratingOpacity.value = withDelay(800, withTiming(1, { duration: 300 }));
            deltaScale.value = withDelay(1400,
                withSequence(
                    withSpring(1.3, { damping: 6, stiffness: 200 }),
                    withSpring(1, SPRING_SNAPPY)
                )
            );
        }

        // 6. Exit button (1200ms+)
        buttonOpacity.value = withDelay(1200, withTiming(1, { duration: 300 }));
        buttonTranslateY.value = withDelay(1200, withSpring(0, SPRING_SNAPPY));
    }, []);

    // ── Animated styles ──
    const backdropStyle = useAnimatedStyle(() => ({
        opacity: backdropOpacity.value,
    }));

    const containerShakeStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: shakeX.value }],
    }));

    const iconStyle = useAnimatedStyle(() => ({
        transform: [
            { scale: iconScale.value },
            { translateY: iconTranslateY.value },
        ],
        opacity: iconScale.value,
    }));

    const goldenGlowStyle = useAnimatedStyle(() => ({
        opacity: goldenGlowOpacity.value,
    }));

    const titleStyle = useAnimatedStyle(() => ({
        transform: [{ scale: titleScale.value }],
        opacity: titleOpacity.value,
    }));

    const nameStyle = useAnimatedStyle(() => ({
        opacity: nameOpacity.value,
        transform: [{ translateY: nameTranslateY.value }],
    }));

    const ratingContainerStyle = useAnimatedStyle(() => ({
        opacity: ratingOpacity.value,
    }));

    const deltaStyle = useAnimatedStyle(() => ({
        transform: [{ scale: deltaScale.value }],
    }));

    const buttonStyle = useAnimatedStyle(() => ({
        opacity: buttonOpacity.value,
        transform: [{ translateY: buttonTranslateY.value }],
    }));

    const vignetteStyle = useAnimatedStyle(() => ({
        opacity: vignetteOpacity.value,
    }));

    const resultColor = isWin ? RESULT_COLORS.victoryGold : RESULT_COLORS.defeatRed;
    const deltaColor = ratingChange && ratingChange >= 0
        ? RESULT_COLORS.ratingGreen
        : RESULT_COLORS.ratingRed;

    return (
        <Animated.View style={[styles.overlay, backdropStyle]}>
            {/* Defeat: red vignette */}
            {!isWin && (
                <Animated.View style={[StyleSheet.absoluteFill, vignetteStyle]} pointerEvents="none">
                    <LinearGradient
                        colors={['transparent', 'transparent', RESULT_COLORS.defeatRedGlow]}
                        style={StyleSheet.absoluteFill}
                    />
                </Animated.View>
            )}

            {/* Victory: confetti burst */}
            {isWin && (
                <ConfettiCannon
                    ref={confettiRef}
                    count={80}
                    origin={{ x: SCREEN_WIDTH / 2, y: -20 }}
                    autoStart={false}
                    fadeOut
                    explosionSpeed={400}
                    fallSpeed={2500}
                    colors={['#FFD700', '#4DA8DA', '#E94560', '#4CAF50', '#AB47BC', '#FF9800']}
                />
            )}

            <Animated.View style={[styles.content, containerShakeStyle]}>
                {/* Icon */}
                <Animated.View style={iconStyle}>
                    {isWin && (
                        <Animated.View style={[styles.goldenGlow, goldenGlowStyle]} />
                    )}
                    <Ionicons
                        name={isWin ? 'trophy' : 'close-circle'}
                        size={80}
                        color={resultColor}
                    />
                </Animated.View>

                {/* Result title */}
                <Animated.Text
                    style={[styles.resultTitle, { color: resultColor }, titleStyle]}
                    accessibilityRole="header"
                    accessibilityLabel={isWin ? 'Victory' : 'Defeat'}
                >
                    {isWin ? 'VICTORY' : 'DEFEAT'}
                </Animated.Text>

                {/* Username */}
                <Animated.Text style={[styles.userName, nameStyle]} accessibilityRole="text" accessibilityLabel={`Player: ${userName}`}>
                    {userName}
                </Animated.Text>

                {/* Rating change */}
                {isRanked && ratingChange !== null && (
                    <Animated.View style={[styles.ratingContainer, ratingContainerStyle]}>
                        <Text style={styles.ratingLabel} accessibilityRole="text">RANKED MATCH RESULT</Text>
                        <View style={styles.ratingRow}>
                            <AnimatedRatingCounter from={oldRating} to={newRating} />
                            <Animated.View style={deltaStyle}>
                                <Text
                                    style={[styles.deltaText, { color: deltaColor }]}
                                    accessibilityRole="text"
                                    accessibilityLabel={`Rating change: ${ratingChange >= 0 ? 'plus' : 'minus'} ${Math.abs(ratingChange)}`}
                                >
                                    ({ratingChange >= 0 ? `+${ratingChange}` : ratingChange})
                                </Text>
                            </Animated.View>
                        </View>
                    </Animated.View>
                )}

                {!isRanked && (
                    <Animated.Text style={[styles.unrankedLabel, nameStyle]}>
                        UNRANKED MATCH
                    </Animated.Text>
                )}

                {/* Exit button */}
                <Animated.View style={buttonStyle}>
                    <AnimatedPressable
                        style={styles.exitBtn}
                        onPress={onExit}
                        accessibilityRole="button"
                        accessibilityLabel="Return to Menu"
                        accessibilityHint="Returns to the home screen"
                    >
                        <Text style={styles.exitBtnText}>RETURN TO MENU</Text>
                    </AnimatedPressable>
                </Animated.View>
            </Animated.View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 100,
    },
    content: {
        alignItems: 'center',
        width: '100%',
        paddingHorizontal: 40,
    },
    goldenGlow: {
        position: 'absolute',
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: 'rgba(255,215,0,0.2)',
        top: -20,
        left: -20,
    },
    resultTitle: {
        fontSize: 48,
        fontWeight: '900',
        letterSpacing: 5,
        marginTop: 20,
    },
    userName: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: '700',
        marginTop: 8,
        marginBottom: 32,
        opacity: 0.8,
    },
    ratingContainer: {
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        padding: 24,
        borderRadius: 20,
        marginBottom: 40,
        width: '85%',
    },
    ratingLabel: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 2,
        marginBottom: 12,
    },
    ratingRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 12,
    },
    ratingValue: {
        color: '#FFF',
        fontSize: 32,
        fontWeight: '900',
    },
    deltaText: {
        fontSize: 18,
        fontWeight: '700',
    },
    unrankedLabel: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 14,
        fontWeight: '700',
        letterSpacing: 1,
        marginBottom: 40,
    },
    exitBtn: {
        backgroundColor: '#FFF',
        paddingHorizontal: 40,
        paddingVertical: 16,
        borderRadius: 30,
    },
    exitBtnText: {
        color: '#000',
        fontWeight: '800',
        fontSize: 14,
    },
});
