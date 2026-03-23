import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, Dimensions, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import ReAnimated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withSequence,
    withTiming,
    cancelAnimation,
} from 'react-native-reanimated';
import { CathedralBackground } from '../components/CathedralBackground';
import { BoardView } from '../components/BoardView';
import { BlockPicker } from '../components/BlockPicker';
import { GameOverOverlay } from '../components/GameOverOverlay';
import { ComboPopup } from '../components/ComboPopup';
import { PerfectClearCelebration } from '../components/PerfectClearCelebration';
import { useOnlinePvPStore } from '../store/onlinePvPStore';
import { useUserStore } from '../store/userStore';
import { playGongSound } from '../utils/sounds';
import { useGameStore } from '../store/gameStore';
import { usePvPAppStateGuard } from '../hooks/useAppStateListener';
import { hapticLight } from '../utils/haptics';
import { useInterstitialAd } from '../hooks/useInterstitialAd';

const { width } = Dimensions.get('window');

export function PvPGameScreen({ navigation }: any) {
    // Move ALL Hooks to top level (Phase 34 Fix)
    const store = useOnlinePvPStore();
    const gameStore = useGameStore();
    const timerAnim = useRef(new Animated.Value(1)).current;
    const myUid = useUserStore(s => s.uid);
    const { showAdThen } = useInterstitialAd();

    // Timer pulse (Reanimated) — visual urgency when <= 5s
    const timerPulseScale = useSharedValue(1);
    const timerPulseBorder = useSharedValue(0);

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

    // SFX/UI for Timer (legacy Animated opacity)
    useEffect(() => {
        if (store.timeLeft <= 5 && store.timeLeft > 0) {
            timerAnim.stopAnimation(); // 前のアニメーションを停止してから新規発火
            Animated.sequence([
                Animated.timing(timerAnim, { toValue: 0.5, duration: 200, useNativeDriver: true }),
                Animated.timing(timerAnim, { toValue: 1, duration: 200, useNativeDriver: true })
            ]).start();
        }
    }, [store.timeLeft]);

    // Timer Pulse — Reanimated scale pulse + haptic heartbeat (NO SOUND)
    useEffect(() => {
        if (store.timeLeft <= 5 && store.timeLeft > 0 && !store.isGameOver) {
            // Reanimated scale pulse (1 → 1.2 → 1 spring)
            timerPulseScale.value = withSequence(
                withTiming(1.25, { duration: 150 }),
                withTiming(1, { duration: 300 })
            );
            timerPulseBorder.value = withSequence(
                withTiming(1, { duration: 100 }),
                withTiming(0, { duration: 400 })
            );

            // Haptic heartbeat — double tap pattern (NO SOUND - Producer's absolute rule)
            hapticLight();
            const secondBeat = setTimeout(() => hapticLight(), 150);
            return () => clearTimeout(secondBeat);
        } else {
            timerPulseScale.value = 1;
            timerPulseBorder.value = 0;
        }
    }, [store.timeLeft, store.isGameOver]);

    // Reanimated animated styles for timer pulse
    const timerPulseStyle = useAnimatedStyle(() => ({
        transform: [{ scale: timerPulseScale.value }],
    }));

    const timerBorderStyle = useAnimatedStyle(() => ({
        borderColor: timerPulseBorder.value > 0.5
            ? 'rgba(255, 75, 43, 0.9)'
            : 'rgba(255,255,255,0.2)',
        borderWidth: 2 + timerPulseBorder.value * 2,
    }));

    // ★ AI Turn Trigger — AIターン開始を検知してprocessAITurnを発火
    useEffect(() => {
        if (
            store.isAIMatch &&
            store.aiUid &&
            store.currentTurn === store.aiUid &&
            !store.isGameOver &&
            store.status === 'playing'
        ) {
            console.log('[PvP/Screen] AI turn detected. Triggering processAITurn...');
            store.processAITurn();
        }
    }, [store.currentTurn, store.isAIMatch, store.isGameOver, store.status]);

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
            // フォアグラウンド復帰 → ロック解除 + Firebase再同期
            const pvp = useOnlinePvPStore.getState();
            useOnlinePvPStore.setState({ isProcessingPlacement: false });
            pvp.forceResync();
            console.log('[AppState/Resume] Locks cleared, forcing resync.');
        }
    );

    // Phase 22: Strict Initialization Guard (LATCHED - once true, stays true)
    const hasBeenReady = useRef(false);
    const [, forceUpdate] = useState(0);

    const localBlocksCount = gameStore.currentBlocks?.filter(b => b !== null).length || 0;

    const isReadyNow =
        localBlocksCount === 3 &&
        store.currentTurn !== null &&
        store.status === 'playing';

    if (isReadyNow && !hasBeenReady.current) {
        hasBeenReady.current = true;
    }

    // Failsafe: 5秒経過でINITIALIZING画面を強制解除
    useEffect(() => {
        if (hasBeenReady.current) return;
        const failsafe = setTimeout(() => {
            if (!hasBeenReady.current) {
                hasBeenReady.current = true;
                forceUpdate(n => n + 1);
                console.warn('[PvP/Failsafe] 5s elapsed. Forcing INITIALIZING screen dismiss.');
            }
        }, 5000);
        return () => clearTimeout(failsafe);
    }, []);

    // Latch: Once the game screen is shown, NEVER revert to INITIALIZING
    // (blocks naturally become null during placement - that's expected)
    const isReady = hasBeenReady.current;

    if (!isReady) {
        return (
            <View style={styles.container}>
                <CathedralBackground />
                <BlurView intensity={100} tint="dark" style={styles.syncingOverlay}>
                    <Animated.Text style={styles.syncingText} accessibilityRole="text" accessibilityLabel="Initializing game">INITIALIZING...</Animated.Text>
                    <Text style={styles.syncingSub} accessibilityRole="text">Synchronizing game engine state</Text>
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
                    <View
                        style={[styles.playerInfo, { alignItems: 'flex-start' }]}
                        accessibilityLabel={`Player 1: ${store.player1?.name || "HOST"}, rating ${store.player1?.rate || 1500}${store.currentTurn === store.player1?.uid ? ', current turn' : ''}`}
                        accessibilityRole="text"
                    >
                        <View style={[styles.avatarGlow, { backgroundColor: store.currentTurn === store.player1?.uid ? '#4DA8DA' : 'rgba(255,255,255,0.05)' }]} />
                        <Text style={[styles.userName, store.currentTurn === store.player1?.uid && { color: '#4DA8DA' }]} numberOfLines={1}>
                            {store.player1?.name || "HOST"}
                        </Text>
                        <Text style={styles.ratingText}>{store.player1?.rate || 1500}</Text>
                    </View>

                    {/* VS Indicator & Timer — Reanimated pulse when <= 5s */}
                    <View style={styles.vsCenter} accessibilityLabel={`Timer: ${store.timeLeft} seconds remaining`} accessibilityRole="timer">
                        <Text style={styles.vsText} accessibilityRole="text">VS</Text>
                        <ReAnimated.View style={[timerPulseStyle]}>
                            <Animated.View style={[styles.timerCircle, { opacity: timerAnim, borderColor: store.timeLeft <= 5 ? '#FF4B2B' : 'rgba(255,255,255,0.2)' }]}>
                                <Text style={[styles.timerTextMain, store.timeLeft <= 5 && { color: '#FF4B2B' }]}>{store.timeLeft}</Text>
                            </Animated.View>
                        </ReAnimated.View>
                    </View>

                    {/* Player 2 (Right) */}
                    <View
                        style={[styles.playerInfo, { alignItems: 'flex-end' }]}
                        accessibilityLabel={`Player 2: ${store.player2?.name || "GUEST"}, rating ${store.player2?.rate || 1500}${store.currentTurn === store.player2?.uid ? ', current turn' : ''}`}
                        accessibilityRole="text"
                    >
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
                    <ComboPopup />
                    <BoardView isPvP={true} />

                    {/* 相手ターン中: ボードは完全に見える状態で、上部にバナー表示 */}
                    {!isMyTurn && !store.isGameOver && (
                        <View style={styles.opponentBanner} pointerEvents="none">
                            <BlurView intensity={60} tint="dark" style={styles.opponentBannerBlur}>
                                <View style={styles.opponentBannerDot} />
                                <Text style={styles.opponentBannerText}>
                                    OPPONENT IS THINKING... ({store.placedCount}/3)
                                </Text>
                            </BlurView>
                        </View>
                    )}
                </View>

                {/* Tray / Hand — ターン切替時にスムーズにフェード */}
                <ReAnimated.View style={[
                    styles.trayContainer,
                    useAnimatedStyle(() => ({
                        opacity: withTiming(isMyTurn ? 1 : 0.4, { duration: 250 }),
                    })),
                ]}>
                    <BlockPicker isPvP={true} />
                </ReAnimated.View>

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
                        onRematch={() => {
                            const isDefeat = store.winner !== myUid;
                            const goToLobby = () => {
                                store.reset();
                                navigation.replace('Lobby');
                            };
                            if (isDefeat) {
                                showAdThen(goToLobby, true); // force=true: 敗北時は確実に広告表示
                            } else {
                                goToLobby();
                            }
                        }}
                    />
                )}

                <PerfectClearCelebration />

                {/* Sync Overlay (Phase 20) */}
                {(store.status === 'matching' || !isReady) && !store.isGameOver && (
                    <BlurView intensity={100} tint="dark" style={[styles.syncingOverlay, { pointerEvents: 'none' }]}>
                        <Animated.Text style={[styles.syncingText, { opacity: timerAnim }]} accessibilityRole="text" accessibilityLabel="Synchronizing battle">
                            SYNCHRONIZING BATTLE...
                        </Animated.Text>
                        <Text style={styles.syncingSub} accessibilityRole="text">Waiting for board synchronization</Text>
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
    opponentBanner: { position: 'absolute', top: 8, left: 0, right: 0, alignItems: 'center', zIndex: 10 },
    opponentBannerBlur: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(233,69,96,0.3)' },
    opponentBannerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E94560', marginRight: 8 },
    opponentBannerText: { color: 'rgba(255,255,255,0.8)', fontWeight: '700', fontSize: 12, letterSpacing: 1 },
    trayContainer: { height: 180, justifyContent: 'center' },
    syncingOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 200 },
    syncingText: { color: '#FFF', fontSize: 24, fontWeight: '900', letterSpacing: 2 },
    syncingSub: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 10, fontWeight: '700' }
});
