import React, { useEffect } from 'react';
import { Text, StyleSheet } from 'react-native';
import { useGameStore } from '../store/gameStore';
import ReAnimated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withDelay,
    withTiming,
    withSequence,
} from 'react-native-reanimated';

export function ComboPopup() {
    const comboCount = useGameStore(s => s.comboCount);
    const clearingCells = useGameStore(s => s.clearingCells);
    const scale = useSharedValue(0);
    const opacity = useSharedValue(0);

    useEffect(() => {
        if (comboCount >= 2 && clearingCells && clearingCells.length > 0) {
            // Spring in
            scale.value = withSpring(1, { damping: 8, stiffness: 200 });
            opacity.value = withTiming(1, { duration: 150 });

            // Delayed fade out
            const timer = setTimeout(() => {
                opacity.value = withTiming(0, { duration: 400 });
                scale.value = withTiming(0.5, { duration: 400 });
            }, 1200);

            return () => clearTimeout(timer);
        } else {
            scale.value = 0;
            opacity.value = 0;
        }
    }, [comboCount, clearingCells]);

    const animStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        opacity: opacity.value,
    }));

    if (comboCount < 2) return null;

    const color = comboCount >= 5 ? '#FF0000' : comboCount >= 3 ? '#FF6347' : '#FFD700';
    const fontSize = Math.min(20 + comboCount * 4, 40);

    return (
        <ReAnimated.View
            style={[styles.container, animStyle]}
            pointerEvents="none"
            accessibilityLabel={`${comboCount} combo`}
        >
            <Text style={[styles.text, { color, fontSize }]}>
                {comboCount}x COMBO!
            </Text>
        </ReAnimated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: -40,
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 300,
    },
    text: {
        fontWeight: '900',
        letterSpacing: 2,
        textShadowColor: 'rgba(0,0,0,0.7)',
        textShadowRadius: 8,
    },
});
