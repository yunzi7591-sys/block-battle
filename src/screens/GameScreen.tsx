import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Alert, TouchableOpacity, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useGameStore } from '../store/gameStore';
import { BoardView } from '../components/BoardView';
import { BlockPicker } from '../components/BlockPicker';
import { playGongSound, playDecisionSound } from '../utils/sounds';

export function GameScreen({ navigation }: any) {
    const score = useGameStore((s) => s.score);
    const isGameOver = useGameStore((s) => s.isGameOver);
    const init = useGameStore((s) => s.init);
    const triggerBGM = useGameStore((s) => s.triggerBGM);

    const scoreScale = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        init();
        // Mandatory reset on mount to fix "First placement failure"
    }, [init]);

    useEffect(() => {
        if (score > 0) {
            Animated.sequence([
                Animated.spring(scoreScale, { toValue: 1.4, friction: 3, useNativeDriver: true }),
                Animated.spring(scoreScale, { toValue: 1, friction: 5, useNativeDriver: true }),
            ]).start();
        }
    }, [score]);

    useEffect(() => {
        if (isGameOver) {
            playGongSound();
            Alert.alert('Game Over', `Score: ${score}`, [
                { text: 'Restart', onPress: init },
            ]);
        }
    }, [isGameOver, score, init]);

    const handleBack = () => {
        playDecisionSound();
        navigation.navigate('Home');
    };

    const handleRestart = () => {
        playDecisionSound();
        init();
    };

    return (
        <View style={styles.container} onTouchStart={triggerBGM}>
            <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
                {/* PERFECT SYMMETRIC HEADER */}
                <View style={styles.header}>
                    {/* Absolute Center Score */}
                    <View style={styles.absoluteCenter} pointerEvents="none">
                        <Text style={styles.title}>BLOCK BATTLE</Text>
                        <Animated.Text style={[styles.score, { transform: [{ scale: scoreScale }] }]}>
                            {score}
                        </Animated.Text>
                    </View>

                    {/* Left Home Button */}
                    <TouchableOpacity onPress={handleBack}>
                        <BlurView intensity={30} tint="light" style={styles.iconBtn}>
                            <Ionicons name="home-outline" size={24} color="#FFF" />
                        </BlurView>
                    </TouchableOpacity>

                    {/* Right Restart Button */}
                    <TouchableOpacity onPress={handleRestart}>
                        <BlurView intensity={30} tint="light" style={styles.iconBtn}>
                            <Ionicons name="refresh-outline" size={24} color="#FFF" />
                        </BlurView>
                    </TouchableOpacity>
                </View>

                <View style={styles.boardArea}>
                    <BoardView />
                </View>

                <View style={styles.tray}>
                    <BlockPicker />
                </View>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0F0F1A' },
    safeArea: { flex: 1 },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 20,
        height: 100, // Explicit height to help absolute centering
        zIndex: 10,
    },
    absoluteCenter: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: -1, // Keep behind buttons
    },
    title: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '800', letterSpacing: 3, marginBottom: 2 },
    score: { color: '#00D4FF', fontSize: 44, fontWeight: '900', textShadowColor: 'rgba(0,212,255,0.5)', textShadowRadius: 15 },
    iconBtn: {
        width: 48,
        height: 48,
        borderRadius: 24,
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)'
    },
    boardArea: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
    tray: { paddingBottom: 20, zIndex: 100 },
});
