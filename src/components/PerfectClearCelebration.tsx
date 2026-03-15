import React, { useEffect } from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { useGameStore } from '../store/gameStore';
import ReAnimated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    withDelay,
    withSequence,
    Easing,
} from 'react-native-reanimated';

export function PerfectClearCelebration() {
    const showPerfectClear = useGameStore(s => s.showPerfectClear);
    const ringScale = useSharedValue(0);
    const ringOpacity = useSharedValue(0);
    const textScale = useSharedValue(0);
    const textOpacity = useSharedValue(0);

    useEffect(() => {
        if (showPerfectClear) {
            // Expanding ring
            ringScale.value = withTiming(3, { duration: 800, easing: Easing.out(Easing.cubic) });
            ringOpacity.value = withSequence(
                withTiming(0.8, { duration: 200 }),
                withDelay(400, withTiming(0, { duration: 400 }))
            );

            // Text spring in
            textScale.value = withSpring(1, { damping: 6, stiffness: 150 });
            textOpacity.value = withTiming(1, { duration: 200 });

            // Fade out after celebration
            const timer = setTimeout(() => {
                textOpacity.value = withTiming(0, { duration: 500 });
                textScale.value = withTiming(0.5, { duration: 500 });
            }, 1500);

            return () => clearTimeout(timer);
        } else {
            ringScale.value = 0;
            ringOpacity.value = 0;
            textScale.value = 0;
            textOpacity.value = 0;
        }
    }, [showPerfectClear]);

    const ringStyle = useAnimatedStyle(() => ({
        transform: [{ scale: ringScale.value }],
        opacity: ringOpacity.value,
    }));

    const textStyle = useAnimatedStyle(() => ({
        transform: [{ scale: textScale.value }],
        opacity: textOpacity.value,
    }));

    if (!showPerfectClear) return null;

    return (
        <View style={styles.overlay} pointerEvents="none">
            <ReAnimated.View style={[styles.ring, ringStyle]} />
            <ReAnimated.View style={[styles.textContainer, textStyle]}>
                <Text style={styles.text}>PERFECT CLEAR!</Text>
            </ReAnimated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 500,
    },
    ring: {
        position: 'absolute',
        width: 120,
        height: 120,
        borderRadius: 60,
        borderWidth: 4,
        borderColor: '#FFD700',
        backgroundColor: 'rgba(255, 215, 0, 0.1)',
    },
    textContainer: {
        backgroundColor: 'rgba(0,0,0,0.8)',
        paddingHorizontal: 30,
        paddingVertical: 14,
        borderRadius: 20,
        borderWidth: 3,
        borderColor: '#FFD700',
    },
    text: {
        fontSize: 32,
        fontWeight: '900',
        color: '#FFD700',
        letterSpacing: 3,
        textShadowColor: '#FFF',
        textShadowRadius: 15,
    },
});
