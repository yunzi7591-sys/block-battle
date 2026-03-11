import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

export const CathedralBackground = () => {
    const anim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(anim, {
                    toValue: 1,
                    duration: 8000,
                    useNativeDriver: false,
                }),
                Animated.timing(anim, {
                    toValue: 0,
                    duration: 8000,
                    useNativeDriver: false,
                }),
            ])
        ).start();
    }, [anim]);

    const color1 = anim.interpolate({
        inputRange: [0, 1],
        outputRange: ['#1A1A2E', '#0F172A'],
    });

    const color2 = anim.interpolate({
        inputRange: [0, 1],
        outputRange: ['#16213E', '#1E3A8A'],
    });

    return (
        <View style={StyleSheet.absoluteFill}>
            <Animated.View style={StyleSheet.absoluteFill}>
                <LinearGradient
                    colors={['#0F0F1A', '#1A1A2E', '#0F0F1A']}
                    style={StyleSheet.absoluteFill}
                />
            </Animated.View>

            {/* Subtle moving light orbs */}
            <Animated.View
                style={[
                    styles.orb,
                    {
                        top: '20%',
                        left: '10%',
                        backgroundColor: '#4C1D95',
                        opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.5] }),
                        transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }]
                    }
                ]}
            />
            <Animated.View
                style={[
                    styles.orb,
                    {
                        bottom: '10%',
                        right: '5%',
                        backgroundColor: '#0F4C81',
                        opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.1] }),
                        transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1.2, 0.8] }) }]
                    }
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
    }
});
