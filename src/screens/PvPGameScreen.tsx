import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Dimensions, Animated, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { CathedralBackground } from '../components/CathedralBackground';
import { BoardView } from '../components/BoardView';
import { BlockPicker } from '../components/BlockPicker';
import { useOnlinePvPStore } from '../store/onlinePvPStore';
import { useUserStore } from '../store/userStore';
import { playGongSound } from '../utils/sounds';
import { useGameStore } from '../store/gameStore';

const { width } = Dimensions.get('window');

export function PvPGameScreen({ navigation }: any) {
    // Move ALL Hooks to top level (Phase 34 Fix)
    const store = useOnlinePvPStore();
    const gameStore = useGameStore();
    const timerAnim = useRef(new Animated.Value(1)).current;
    const myUid = useUserStore(s => s.uid);

    // Reset ONLY on UNMOUNT (Exit)
    useEffect(() => {
        console.log(`[PvP/Screen] Mounted. Current Room: ${store.roomId}, Status: ${store.status}`);
        return () => {
            console.log('[PvP/Screen] Unmounting. Cleaning up store...');
            store.reset();
        };
    }, []);

    // Timer logic (Store is now authority)
    useEffect(() => {
        if (store.status !== 'playing' || store.isGameOver) return;
        const interval = setInterval(() => {
            store.tickTimer();
        }, 500);
        return () => clearInterval(interval);
    }, [store.status, store.isGameOver]);

    // SFX/UI for Timer
    useEffect(() => {
        if (store.timeLeft <= 5 && store.timeLeft > 0) {
            Animated.sequence([
                Animated.timing(timerAnim, { toValue: 0.5, duration: 200, useNativeDriver: true }),
                Animated.timing(timerAnim, { toValue: 1, duration: 200, useNativeDriver: true })
            ]).start();
        }
    }, [store.timeLeft]);

    // GameOver Handling
    useEffect(() => {
        if (store.isGameOver) {
            playGongSound();
            if (store.isRanked) {
                useUserStore.getState().updateRating(store.rating);
            }
        }
    }, [store.isGameOver, store.rating, store.isRanked]);

    // Phase 22: Strict Initialization Guard (LATCHED - once true, stays true)
    const hasBeenReady = useRef(false);

    const localBlocksCount = gameStore.currentBlocks?.filter(b => b !== null).length || 0;

    const isReadyNow =
        localBlocksCount === 3 &&
        store.currentTurn !== null &&
        store.status === 'playing';

    if (isReadyNow && !hasBeenReady.current) {
        hasBeenReady.current = true;
    }

    // Latch: Once the game screen is shown, NEVER revert to INITIALIZING
    // (blocks naturally become null during placement - that's expected)
    const isReady = hasBeenReady.current;

    if (!isReady) {
        return (
            <View style={styles.container}>
                <CathedralBackground />
                <BlurView intensity={100} tint="dark" style={styles.syncingOverlay}>
                    <Animated.Text style={styles.syncingText}>INITIALIZING...</Animated.Text>
                    <Text style={styles.syncingSub}>Synchronizing game engine state</Text>
                </BlurView>
            </View>
        );
    }

    const isMyTurn = store.currentTurn === myUid;
    const turnColor = isMyTurn ? '#4DA8DA' : '#E94560';

    return (
        <View style={styles.container}>
            <CathedralBackground />

            <SafeAreaView style={styles.safeArea}>
                {/* Status Bar / Player Indicator */}
                <View style={styles.header}>
                    <View style={styles.playerTag}>
                        <View style={[styles.dot, { backgroundColor: turnColor }]} />
                        <Text style={[styles.playerText, { color: turnColor }]}>
                            {isMyTurn ? "YOUR TURN" : "OPPONENT'S TURN"}
                        </Text>
                    </View>

                    {/* Timer */}
                    <Animated.View style={[styles.timerContainer, { opacity: timerAnim }]}>
                        <View style={[styles.timerBar, { width: `${(store.timeLeft / 30) * 100}%`, backgroundColor: store.timeLeft <= 5 ? '#FF4B2B' : '#FFF' }]} />
                        <Text style={[styles.timerText, store.timeLeft <= 5 && { color: '#FF4B2B' }]}>{store.timeLeft}s</Text>
                    </Animated.View>
                </View>

                {/* Shared Board */}
                <View style={styles.boardContainer}>
                    <BoardView isPvP={true} />

                    {!isMyTurn && !store.isGameOver && (
                        <BlurView intensity={30} tint="dark" style={styles.waitingOverlay} pointerEvents="none">
                            <Text style={styles.waitingText}>OPPONENT IS THINKING...</Text>
                        </BlurView>
                    )}
                </View>

                {/* Tray / Hand (Showing Shared currentBlocks) */}
                <View style={[styles.trayContainer, !isMyTurn && { opacity: 0.5 }]}>
                    <BlockPicker isPvP={true} />
                </View>

                {/* Game Over Overlay */}
                {store.isGameOver && (
                    <BlurView intensity={90} tint="dark" style={styles.gameOverOverlay}>
                        {(() => {
                            const isWin = store.winner === myUid;
                            return (
                                <View style={styles.gameOverContent}>
                                    <Ionicons
                                        name={isWin ? "trophy" : "close-circle"}
                                        size={80}
                                        color={isWin ? "#FFD700" : "#E94560"}
                                    />
                                    <Text style={[styles.resultTitle, { color: isWin ? "#FFD700" : "#E94560" }]}>
                                        {isWin ? "VICTORY" : "DEFEAT"}
                                    </Text>
                                    <Text style={styles.userNameText}>{useUserStore.getState().userName}</Text>

                                    {store.isRanked && store.ratingChange !== null && (
                                        <View style={styles.ratingResultContainer}>
                                            <Text style={styles.ratingLabel}>RANKED MATCH RESULT</Text>
                                            <View style={styles.ratingRow}>
                                                <Text style={styles.ratingValue}>{store.rating - store.ratingChange}</Text>
                                                <Ionicons name="arrow-forward" size={16} color="rgba(255,255,255,0.4)" />
                                                <View style={styles.newRatingContainer}>
                                                    <Text style={styles.ratingValue}>{store.rating}</Text>
                                                    <Text style={[styles.deltaText, { color: store.ratingChange >= 0 ? '#4CAF50' : '#FF5252' }]}>
                                                        ({store.ratingChange >= 0 ? `+${store.ratingChange}` : store.ratingChange})
                                                    </Text>
                                                </View>
                                            </View>
                                        </View>
                                    )}

                                    {!store.isRanked && (
                                        <Text style={styles.unrankedLabel}>UNRANKED MATCH</Text>
                                    )}

                                    <TouchableOpacity style={styles.exitBtn} onPress={() => navigation.navigate('Home')}>
                                        <Text style={styles.exitBtnText}>RETURN TO MENU</Text>
                                    </TouchableOpacity>
                                </View>
                            );
                        })()}
                    </BlurView>
                )}

                {/* Sync Overlay (Phase 20) */}
                {(store.status === 'matching' || !isReady) && !store.isGameOver && (
                    <BlurView intensity={100} tint="dark" style={[styles.syncingOverlay, { pointerEvents: 'none' }]}>
                        <Animated.Text style={[styles.syncingText, { opacity: timerAnim }]}>
                            SYNCHRONIZING BATTLE...
                        </Animated.Text>
                        <Text style={styles.syncingSub}>Waiting for board synchronization</Text>
                    </BlurView>
                )}
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    safeArea: { flex: 1 },
    header: { padding: 20, alignItems: 'center' },
    playerTag: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 15 },
    dot: { width: 10, height: 10, borderRadius: 5 },
    playerText: { fontSize: 18, fontWeight: '900', letterSpacing: 2 },
    timerContainer: { width: '80%', height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' },
    timerBar: { height: '100%' },
    timerText: { color: '#FFF', fontSize: 12, fontWeight: '700', marginTop: 10 },
    boardContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    waitingOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 10 },
    waitingText: { color: '#FFF', fontWeight: '800', fontSize: 20, letterSpacing: 2, opacity: 0.7 },
    trayContainer: { height: 200, justifyContent: 'center' },
    gameOverOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 100 },
    gameOverContent: { alignItems: 'center', width: '100%', padding: 40 },
    resultTitle: { fontSize: 48, fontWeight: '900', letterSpacing: 5, marginTop: 20 },
    userNameText: { color: '#FFF', fontSize: 18, fontWeight: '700', marginTop: 5, marginBottom: 30, opacity: 0.8 },
    ratingResultContainer: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', padding: 20, borderRadius: 20, marginBottom: 40, width: '80%' },
    ratingLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 12 },
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    ratingValue: { color: '#FFF', fontSize: 24, fontWeight: '900' },
    newRatingContainer: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
    deltaText: { fontSize: 16, fontWeight: '700' },
    unrankedLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 14, fontWeight: '700', letterSpacing: 1, marginBottom: 40 },
    exitBtn: { backgroundColor: '#FFF', paddingHorizontal: 40, paddingVertical: 15, borderRadius: 30 },
    exitBtnText: { color: '#000', fontWeight: '800' },
    syncingOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 200 },
    syncingText: { color: '#FFF', fontSize: 24, fontWeight: '900', letterSpacing: 2 },
    syncingSub: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 10, fontWeight: '700' }
});
