import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Dimensions, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { CathedralBackground } from '../components/CathedralBackground';
import { BoardView } from '../components/BoardView';
import { BlockPicker } from '../components/BlockPicker';
import { GameOverOverlay } from '../components/GameOverOverlay';
import { useOnlinePvPStore } from '../store/onlinePvPStore';
import { useUserStore } from '../store/userStore';
import { playGongSound } from '../utils/sounds';
import { useGameStore } from '../store/gameStore';
import { usePvPAppStateGuard } from '../hooks/useAppStateListener';

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
    // NOTE: Rating update is now handled server-side by Cloud Functions.
    // calculateRatingChange in store is kept for UI display only (provisional delta).
    useEffect(() => {
        if (store.isGameOver) {
            playGongSound();
        }
    }, [store.isGameOver]);

    // Phase 42: AppState Guard — background timeout defeat
    usePvPAppStateGuard(
        store.status === 'playing' && !store.isGameOver,
        () => {
            // 30秒バックグラウンド経過 → 自分のターンなら敗北報告
            const pvp = useOnlinePvPStore.getState();
            const user = useUserStore.getState();
            if (pvp.currentTurn === user.uid && !pvp.isGameOver) {
                console.warn('[AppState/Timeout] Background timeout expired during my turn. Reporting defeat.');
                pvp.reportDefeat();
            }
        },
        () => {
            // フォアグラウンド復帰 → tickTimer が次の 500ms で状態を自動再評価
            console.log('[AppState/Resume] Returned to foreground. Timer will re-evaluate.');
        }
    );

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
                {/* Versus Header / HUD */}
                <View style={styles.vsHeader}>
                    {/* Player 1 (Left) */}
                    <View style={[styles.playerInfo, { alignItems: 'flex-start' }]}>
                        <View style={[styles.avatarGlow, { backgroundColor: store.currentTurn === store.player1?.uid ? '#4DA8DA' : 'rgba(255,255,255,0.05)' }]} />
                        <Text style={[styles.userName, store.currentTurn === store.player1?.uid && { color: '#4DA8DA' }]} numberOfLines={1}>
                            {store.player1?.name || "HOST"}
                        </Text>
                        <Text style={styles.ratingText}>{store.player1?.rate || 1500}</Text>
                    </View>

                    {/* VS Indicator & Timer */}
                    <View style={styles.vsCenter}>
                        <Text style={styles.vsText}>VS</Text>
                        <Animated.View style={[styles.timerCircle, { opacity: timerAnim, borderColor: store.timeLeft <= 5 ? '#FF4B2B' : 'rgba(255,255,255,0.2)' }]}>
                            <Text style={[styles.timerTextMain, store.timeLeft <= 5 && { color: '#FF4B2B' }]}>{store.timeLeft}</Text>
                        </Animated.View>
                    </View>

                    {/* Player 2 (Right) */}
                    <View style={[styles.playerInfo, { alignItems: 'flex-end' }]}>
                        <View style={[styles.avatarGlow, { backgroundColor: store.currentTurn === store.player2?.uid ? '#E94560' : 'rgba(255,255,255,0.05)' }]} />
                        <Text style={[styles.userName, store.currentTurn === store.player2?.uid && { color: '#E94560' }]} numberOfLines={1}>
                            {store.player2?.name || "GUEST"}
                        </Text>
                        <Text style={styles.ratingText}>{store.player2?.rate || 1500}</Text>
                    </View>
                </View>

                {/* Turn Progress Bar */}
                <View style={styles.progressContainer}>
                    <View style={[
                        styles.progressBar,
                        {
                            width: `${(store.timeLeft / 30) * 100}%`,
                            backgroundColor: store.timeLeft <= 5 ? '#FF4B2B' : turnColor
                        }
                    ]} />
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

                {/* Game Over Overlay — Phase B: Rich animated result screen */}
                {store.isGameOver && (
                    <GameOverOverlay
                        isWin={store.winner === myUid}
                        userName={useUserStore.getState().userName || ''}
                        isRanked={store.isRanked}
                        ratingChange={store.ratingChange}
                        oldRating={store.ratingChange !== null ? store.rating - store.ratingChange : store.rating}
                        newRating={store.rating}
                        onExit={() => navigation.navigate('Home')}
                    />
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
    vsHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 25,
        paddingVertical: 15,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)'
    },
    playerInfo: { flex: 1, gap: 2 },
    avatarGlow: { width: 30, height: 4, borderRadius: 2, marginBottom: 4 },
    userName: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '900', letterSpacing: 1 },
    ratingText: { color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: '700' },
    vsCenter: { width: 60, alignItems: 'center' },
    vsText: { color: 'rgba(255,255,255,0.2)', fontSize: 10, fontWeight: '900', marginBottom: 5 },
    timerCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 2,
        justifyContent: 'center',
        alignItems: 'center'
    },
    timerTextMain: { color: '#FFF', fontSize: 14, fontWeight: '900' },
    progressContainer: { height: 2, width: '100%', backgroundColor: 'rgba(255,255,255,0.05)' },
    progressBar: { height: '100%' },
    boardContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    waitingOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 10 },
    waitingText: { color: '#FFF', fontWeight: '800', fontSize: 18, letterSpacing: 2, opacity: 0.6 },
    trayContainer: { height: 180, justifyContent: 'center' },
    syncingOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 200 },
    syncingText: { color: '#FFF', fontSize: 24, fontWeight: '900', letterSpacing: 2 },
    syncingSub: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 10, fontWeight: '700' }
});
