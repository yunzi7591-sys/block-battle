import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Animated, TouchableWithoutFeedback } from 'react-native';
import { CathedralBackground } from '../components/CathedralBackground';
import { playDecisionSound, playBGM } from '../utils/sounds';

export function TitleScreen({ navigation }: any) {
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        // Simple pulsing "TAP TO START"
        Animated.loop(
            Animated.sequence([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 1200,
                    useNativeDriver: true,
                }),
                Animated.timing(fadeAnim, {
                    toValue: 0.3,
                    duration: 1200,
                    useNativeDriver: true,
                }),
            ])
        ).start();
    }, [fadeAnim]);

    const handleStart = () => {
        playDecisionSound();
        playBGM(); // Ensure BGM starts
        navigation.navigate('Home');
    };

    return (
        <TouchableWithoutFeedback
            onPress={handleStart}
            accessibilityRole="button"
            accessibilityLabel="Tap to start Block Battle"
            accessibilityHint="Starts the game and navigates to the home screen"
        >
            <View style={styles.container}>
                <CathedralBackground />

                <View style={styles.content}>
                    <Text style={styles.logoText} accessibilityRole="header">BLOCK{"\n"}BATTLE</Text>
                    <Text style={styles.subtext} accessibilityRole="text">MASTERPIECE EDITION</Text>

                    <View style={styles.spacer} />

                    <Animated.View style={{ opacity: fadeAnim }}>
                        <Text style={styles.tapText} accessibilityRole="text">TAP TO START</Text>
                    </Animated.View>
                </View>
            </View>
        </TouchableWithoutFeedback>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    logoText: {
        fontSize: 64,
        fontWeight: '900',
        color: '#FFFFFF',
        textAlign: 'center',
        letterSpacing: 4,
        lineHeight: 64,
        textShadowColor: 'rgba(77, 168, 218, 0.8)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 15,
    },
    subtext: {
        fontSize: 14,
        color: '#4DA8DA',
        fontWeight: '600',
        letterSpacing: 5,
        marginTop: 10,
    },
    spacer: {
        height: 120,
    },
    tapText: {
        fontSize: 18,
        color: '#FFFFFF',
        fontWeight: '500',
        letterSpacing: 3,
        opacity: 0.8,
    },
});
