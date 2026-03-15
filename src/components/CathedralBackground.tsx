import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import ReAnimated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    Easing,
    interpolate,
} from 'react-native-reanimated';

export const CathedralBackground = () => {
    const progress = useSharedValue(0);

    useEffect(() => {
        progress.value = withRepeat(
            withTiming(1, { duration: 8000, easing: Easing.inOut(Easing.ease) }),
            -1,
            true
        );
    }, []);

    const orb1Style = useAnimatedStyle(() => ({
        opacity: interpolate(progress.value, [0, 1], [0.2, 0.5]),
        transform: [
            { scale: interpolate(progress.value, [0, 1], [1, 1.5]) },
        ],
    }));

    const orb2Style = useAnimatedStyle(() => ({
        opacity: interpolate(progress.value, [0, 1], [0.3, 0.1]),
        transform: [
            { scale: interpolate(progress.value, [0, 1], [1.2, 0.8]) },
        ],
    }));

    return (
        <View style={StyleSheet.absoluteFill}>
            <LinearGradient
                colors={['#0F0F1A', '#1A1A2E', '#0F0F1A']}
                style={StyleSheet.absoluteFill}
            />

            {/* Subtle moving light orbs — now on UI thread */}
            <ReAnimated.View
                style={[
                    styles.orb,
                    { top: '20%', left: '10%', backgroundColor: '#4C1D95' },
                    orb1Style,
                ]}
            />
            <ReAnimated.View
                style={[
                    styles.orb,
                    { bottom: '10%', right: '5%', backgroundColor: '#0F4C81' },
                    orb2Style,
                ]}
            />

            <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
        </View>
    );
};

const styles = StyleSheet.create({
    orb: {
        position: 'absolute',
        width: 300,
        height: 300,
        borderRadius: 150,
    },
});
