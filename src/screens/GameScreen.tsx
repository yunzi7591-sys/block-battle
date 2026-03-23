import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, Alert, TouchableOpacity, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useGameStore } from '../store/gameStore';
import { BoardView } from '../components/BoardView';
import { BlockPicker } from '../components/BlockPicker';
import { ComboPopup } from '../components/ComboPopup';
import { PerfectClearCelebration } from '../components/PerfectClearCelebration';
import { playGongSound, playDecisionSound } from '../utils/sounds';
import { useInterstitialAd } from '../hooks/useInterstitialAd';
import { useRewardedAd } from '../hooks/useRewardedAd';

export function GameScreen({ navigation }: any) {
    const score = useGameStore((s) => s.score);
    const isGameOver = useGameStore((s) => s.isGameOver);
    const init = useGameStore((s) => s.init);
    const triggerBGM = useGameStore((s) => s.triggerBGM);
    const { showAdThen } = useInterstitialAd();
    const { showRewardedAd, isRewardedAdReady } = useRewardedAd();
    const hasUsedContinueRef = useRef(false);

    const scoreScale = useRef(new Animated.Value(1)).current;
    const glowOpacity = useRef(new Animated.Value(0)).current;
    const prevScoreRef = useRef(0);
    const [isLargeGain, setIsLargeGain] = useState(false);

    useEffect(() => {
        init();
        // Mandatory reset on mount to fix "First placement failure"
    }, [init]);

    useEffect(() => {
        if (score > 0) {
            const delta = score - prevScoreRef.current;
            prevScoreRef.current = score;

            const large = delta >= 2000;
            setIsLargeGain(large);
            const peakScale = large ? 1.6 : 1.35;

            // scoreScale: transform用 (native driver OK)
            Animated.sequence([
                Animated.spring(scoreScale, { toValue: peakScale, friction: 3, useNativeDriver: true }),
                Animated.spring(scoreScale, { toValue: 1, friction: 5, useNativeDriver: true }),
            ]).start();

            // glowOpacity: opacity用 (native driver OK) — 別レイヤーでフラッシュ
            Animated.sequence([
                Animated.timing(glowOpacity, { toValue: 1, duration: 80, useNativeDriver: true }),
                Animated.timing(glowOpacity, { toValue: 0, duration: 350, useNativeDriver: true }),
            ]).start();
        }
    }, [score]);

    useEffect(() => {
        if (isGameOver) {
            playGongSound();

            // コンティニュー可能: リワード広告が利用可能 & まだ使ってない
            const canContinue = !hasUsedContinueRef.current && isRewardedAdReady();

            const buttons: any[] = [
                { text: 'Restart', onPress: () => showAdThen(init) },
            ];

            if (canContinue) {
                buttons.unshift({
                    text: '▶ Continue (Ad)',
                    onPress: () => {
                        const success = showRewardedAd(() => {
                            hasUsedContinueRef.current = true;
                            // ボードの最も埋まっている3行をクリアしてゲーム続行
                            const gameState = useGameStore.getState();
                            const board = gameState.board.map(r => [...r]);

                            // 各行の埋まり具合を計算し、最も詰まった3行をクリア
                            const rowFill = board.map((row, idx) => ({
                                idx,
                                count: row.filter(c => c !== 0).length,
                            }));
                            rowFill.sort((a, b) => b.count - a.count);
                            const rowsToClear = rowFill.slice(0, 3).map(r => r.idx);
                            for (const rIdx of rowsToClear) {
                                for (let c = 0; c < 8; c++) {
                                    board[rIdx][c] = 0;
                                }
                            }
                            gameState.setBoard(board);
                            gameState.setGameOver(false);

                            // ★ 新しいブロックを生成して配置可能状態に復帰
                            // generateBlocksAsync は非同期だが、
                            // setGameOver(false) 後にブロック再生成が必要
                            import('../game/survivalAlgorithm').then(({ generateBlocksAsync }) => {
                                generateBlocksAsync(board, 0, 0).then(newBlocks => {
                                    const gs = useGameStore.getState();
                                    // ゲームがリセットされていなければ適用
                                    if (!gs.isGameOver && !gs.isPvP) {
                                        gs.setBlocks(newBlocks as any);
                                    }
                                });
                            });
                        });
                        if (!success) {
                            // 広告表示失敗 → 通常リスタート
                            showAdThen(init);
                        }
                    },
                });
            }

            Alert.alert('Game Over', `Score: ${score}`, buttons);
        }
    }, [isGameOver, score, init, showAdThen, showRewardedAd, isRewardedAdReady]);

    const handleBack = () => {
        playDecisionSound();
        navigation.navigate('Home');
    };

    const handleRestart = () => {
        playDecisionSound();
        hasUsedContinueRef.current = false;
        showAdThen(init);
    };

    return (
        <View style={styles.container} onTouchStart={triggerBGM}>
            <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
                {/* PERFECT SYMMETRIC HEADER */}
                <View style={styles.header}>
                    {/* Absolute Center Score */}
                    <View style={styles.absoluteCenter} pointerEvents="none">
                        <Text style={styles.title} accessibilityRole="text">BLOCK BATTLE</Text>
                        <View style={styles.scoreStack}>
                            {/* ゴールドグロー: 大量得点時にフラッシュする重ね文字 */}
                            <Animated.Text
                                style={[
                                    styles.score,
                                    styles.scoreGlow,
                                    isLargeGain ? styles.scoreGlowGold : styles.scoreGlowCyan,
                                    { opacity: glowOpacity, transform: [{ scale: scoreScale }] },
                                ]}
                                pointerEvents="none"
                            >
                                {score}
                            </Animated.Text>
                            {/* メインスコア */}
                            <Animated.Text
                                style={[styles.score, { transform: [{ scale: scoreScale }] }]}
                                accessibilityRole="text"
                                accessibilityLabel={`Current score: ${score}`}
                            >
                                {score}
                            </Animated.Text>
                        </View>
                    </View>

                    {/* Left Home Button */}
                    <TouchableOpacity
                        onPress={handleBack}
                        accessibilityRole="button"
                        accessibilityLabel="Home"
                        accessibilityHint="Returns to the home screen"
                    >
                        <BlurView intensity={30} tint="light" style={styles.iconBtn}>
                            <Ionicons name="home-outline" size={24} color="#FFF" />
                        </BlurView>
                    </TouchableOpacity>

                    {/* Right Restart Button */}
                    <TouchableOpacity
                        onPress={handleRestart}
                        accessibilityRole="button"
                        accessibilityLabel="Restart"
                        accessibilityHint="Restarts the current game"
                    >
                        <BlurView intensity={30} tint="light" style={styles.iconBtn}>
                            <Ionicons name="refresh-outline" size={24} color="#FFF" />
                        </BlurView>
                    </TouchableOpacity>
                </View>

                <View style={styles.boardArea}>
                    <ComboPopup />
                    <BoardView />
                </View>

                <View style={styles.tray}>
                    <BlockPicker />
                </View>
                <PerfectClearCelebration />
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
    scoreStack: { alignItems: 'center', justifyContent: 'center' },
    scoreGlow: { position: 'absolute', fontSize: 44, fontWeight: '900' },
    scoreGlowGold: { color: '#FFD700', textShadowColor: 'rgba(255,215,0,0.9)', textShadowRadius: 30 },
    scoreGlowCyan: { color: '#00D4FF', textShadowColor: 'rgba(0,212,255,0.9)', textShadowRadius: 25 },
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
