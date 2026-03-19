import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, Animated, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { CathedralBackground } from '../components/CathedralBackground';
import { useOnlinePvPStore } from '../store/onlinePvPStore';
import { useUserStore } from '../store/userStore';
import { playDecisionSound, playGongSound } from '../utils/sounds';
import { LobbyService } from '../services/LobbyService';

export function LobbyScreen({ navigation }: any) {
    const [joinId, setJoinId] = useState('');
    const { userName, rating, uid } = useUserStore();
    const insets = useSafeAreaInsets();
    const {
        createRoom, joinRoom, roomId, isHost, sharedBoard,
        isMatching, matchingLocked, startAutoMatch, cancelAutoMatch, status,
        reset
    } = useOnlinePvPStore();

    // Reset state on enter lobby to clear any stale Game Over or Match states
    useEffect(() => {
        reset();
        const unsubConnection = LobbyService.monitorConnection();

        return () => {
            // Phase 42: Always unsubscribe connection listener to prevent memory leak
            unsubConnection();

            // Cleanup: If we haven't navigated to the game yet, cancel any pending matches
            if (!hasNavigatedRef.current && status !== 'playing') {
                console.log("[Lobby] Cleaning up: Cancelling match/room as we are leaving the screen before game start.");
                cancelAutoMatch();
            } else {
                console.log("[Lobby] Screen unmount after match: Keeping room active for PvPGameScreen.");
            }
        };
    }, []);

    const searchPulse = useRef(new Animated.Value(0.4)).current;

    useEffect(() => {
        if (isMatching) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(searchPulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
                    Animated.timing(searchPulse, { toValue: 0.4, duration: 1000, useNativeDriver: true }),
                ])
            ).start();
        } else {
            searchPulse.setValue(0.4);
        }
    }, [isMatching]);

    const handleAutoMatch = async () => {
        playDecisionSound();
        try {
            await startAutoMatch();
        } catch (e: any) {
            console.error("[Lobby] startAutoMatch Error:", e);
            Alert.alert("Match Error", e.message || "Failed to start matching. Check connection.");
        }
    };

    const handleCreatePrivate = async () => {
        playDecisionSound();
        try {
            await createRoom(true); // Private
        } catch (e: any) {
            console.error("[Lobby] createRoom Error:", e);
            Alert.alert("Error", `Failed to create room: ${e.message}`);
        }
    };

    const handleJoinPrivate = async () => {
        if (joinId.length < 4) {
            Alert.alert("Invalid ID", "Please enter a 4-digit Room ID.");
            return;
        }
        playDecisionSound();
        try {
            await joinRoom(joinId);
        } catch (e: any) {
            console.error("[Lobby] joinRoom Error:", e);
            Alert.alert("Join Failed", e.message || "Room might be full or no longer exists.");
        }
    };

    const handleCancelMatch = async () => {
        if (matchingLocked) return;
        playDecisionSound();
        await cancelAutoMatch();
    };

    const handleStart = () => {
        if (!isHost) return;
        playDecisionSound();
        // Phase 25: Mark as navigating to prevent cleanup from killing the listener
        hasNavigatedRef.current = true;
        navigation.navigate('PvPGame');
    };

    const [countdown, setCountdown] = useState<number | null>(null);
    const [matchTimer, setMatchTimer] = useState<number>(30);
    const hasNavigatedRef = useRef(false);

    // ★ マッチング中の20秒カウントダウン
    useEffect(() => {
        if (isMatching && !matchingLocked && countdown === null) {
            setMatchTimer(30);
            const interval = setInterval(() => {
                setMatchTimer(prev => {
                    if (prev <= 1) {
                        clearInterval(interval);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
            return () => clearInterval(interval);
        }
        if (!isMatching) {
            setMatchTimer(30);
        }
    }, [isMatching, matchingLocked, countdown]);

    // Auto-navigate when match starts (with countdown)
    useEffect(() => {
        if (status === 'playing' && matchingLocked && !hasNavigatedRef.current) {
            console.log(`[Navigation] Match Found! Starting countdown. Status: ${status}`);
            setCountdown(3);
            const timer = setInterval(() => {
                setCountdown(prev => {
                    if (prev === null || prev <= 1) {
                        clearInterval(timer);

                        if (!hasNavigatedRef.current) {
                            hasNavigatedRef.current = true;
                            console.log(`[Navigation] Switching to PvPGameScreen (Safely via setTimeout)`);

                            // Use setTimeout to ensure we are outside the render cycle
                            setTimeout(() => {
                                navigation.navigate('PvPGame');
                            }, 0);
                        }
                        return null;
                    }
                    return prev - 1;
                });
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [status, matchingLocked]);

    return (
        <View style={styles.container}>
            <CathedralBackground />

            {/* Vertical Header Stack */}
            <View style={[styles.headerStack, { paddingTop: insets.top + 10 }]}>
                {/* Top Row: Back Button Only */}
                <View style={styles.topRow}>
                    {!isMatching && !roomId && (
                        <TouchableOpacity
                            style={styles.backButton}
                            onPress={() => navigation.goBack()}
                            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                            accessibilityRole="button"
                            accessibilityLabel="Back"
                            accessibilityHint="Returns to the previous screen"
                        >
                            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
                            <Text style={styles.backText}>BACK</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Central Stack: Title & Stats */}
                <View style={styles.titleStack}>
                    <Text style={styles.headerTitle} accessibilityRole="header">MATCHING LOBBY</Text>

                    {/* Player Status Badge */}
                    <View style={styles.statsBadgeContainer}>
                        <BlurView intensity={30} tint="light" style={styles.statsBadge}>
                            <View style={styles.statsRow}>
                                <Text style={styles.statsLabel}>PLAYER</Text>
                                <Text style={styles.statsValueName}>{userName}</Text>
                            </View>
                            <View style={styles.statsDivider} />
                            <View style={styles.statsRow}>
                                <Text style={styles.statsLabel}>RATE</Text>
                                <Text style={styles.statsValueRating}>{rating}</Text>
                            </View>
                        </BlurView>
                    </View>
                </View>

            </View>

            <View style={styles.safeArea}>

                {!roomId ? (
                    <View style={styles.mainContent}>
                        {/* RANDOM MATCH (PREMIUM BUTTON) */}
                        <TouchableOpacity
                            style={styles.randomMatchBtn}
                            onPress={handleAutoMatch}
                            accessibilityRole="button"
                            accessibilityLabel="Random Match"
                            accessibilityHint="Starts searching for a random online opponent"
                        >
                            <BlurView intensity={60} tint="light" style={styles.randomMatchBlur}>
                                <Text style={styles.randomTitle}>RANDOM MATCH</Text>
                                <Text style={styles.randomSub}>BATTLE ANYONE ONLINE</Text>
                                <View style={styles.glint} />
                            </BlurView>
                        </TouchableOpacity>

                        <View style={styles.divider}>
                            <View style={styles.line} />
                            <Text style={styles.orText}>OR PLAY WITH FRIENDS</Text>
                            <View style={styles.line} />
                        </View>

                        {/* PRIVATE MATCH SECTION */}
                        <View style={styles.privateContainer}>
                            <TouchableOpacity
                                style={styles.privateMiniBtn}
                                onPress={handleCreatePrivate}
                                accessibilityRole="button"
                                accessibilityLabel="Create Private Room"
                                accessibilityHint="Creates a private room for playing with friends"
                            >
                                <BlurView intensity={30} tint="light" style={styles.miniBlur}>
                                    <Text style={styles.miniBtnText}>CREATE PRIVATE</Text>
                                </BlurView>
                            </TouchableOpacity>

                            <BlurView intensity={30} tint="light" style={styles.joinCard}>
                                <TextInput
                                    style={styles.miniInput}
                                    placeholder="CODE"
                                    placeholderTextColor="rgba(255,255,255,0.4)"
                                    keyboardType="number-pad"
                                    maxLength={4}
                                    value={joinId}
                                    onChangeText={setJoinId}
                                    accessibilityLabel="Room code"
                                    accessibilityHint="Enter a 4-digit room code to join a private match"
                                />
                                <TouchableOpacity
                                    style={styles.miniJoinBtn}
                                    onPress={handleJoinPrivate}
                                    accessibilityRole="button"
                                    accessibilityLabel="Join Room"
                                    accessibilityHint="Joins the private room with the entered code"
                                >
                                    <Text style={styles.miniJoinText}>JOIN</Text>
                                </TouchableOpacity>
                            </BlurView>
                        </View>
                    </View>
                ) : (
                    <View style={styles.waitingContainer}>
                        <BlurView intensity={50} tint="light" style={styles.waitingCard}>
                            {!useOnlinePvPStore.getState().isRanked && (
                                <>
                                    <Text style={styles.waitingLabel}>PRIVATE ROOM ID</Text>
                                    <Text style={styles.roomCode}>{roomId}</Text>
                                </>
                            )}
                            <Text style={styles.statusText} accessibilityRole="text" accessibilityLabel={isHost ? "Waiting for guest to join" : "Connected to host"}>
                                {isHost ? "WAITING FOR GUEST..." : "CONNECTED TO HOST"}
                            </Text>
                            {isHost && (
                                <TouchableOpacity
                                    style={styles.startBtn}
                                    onPress={handleStart}
                                    accessibilityRole="button"
                                    accessibilityLabel="Start Battle"
                                    accessibilityHint="Begins the PvP match"
                                >
                                    <Text style={styles.startBtnText}>START BATTLE</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity
                                style={styles.backBtn}
                                onPress={handleCancelMatch}
                                accessibilityRole="button"
                                accessibilityLabel="Cancel"
                                accessibilityHint="Cancels the current match or room"
                            >
                                <Text style={styles.backBtnText}>CANCEL</Text>
                            </TouchableOpacity>
                        </BlurView>
                    </View>
                )}

                {/* SEARCHING / COUNTDOWN OVERLAY */}
                {(isMatching || countdown !== null) && (
                    <BlurView intensity={90} tint="dark" style={styles.matchOverlay}>
                        {countdown === null ? (
                            <>
                                <Animated.Text style={[styles.searchingText, { opacity: searchPulse }]}>
                                    SEARCHING FOR OPPONENT...
                                </Animated.Text>
                                <View style={styles.matchTimerContainer}>
                                    <Text style={styles.matchTimerNumber}>{matchTimer}</Text>
                                </View>
                                <View style={styles.matchTimerBarBg}>
                                    <View style={[styles.matchTimerBarFill, { width: `${(matchTimer / 30) * 100}%` }]} />
                                </View>
                                {!matchingLocked && (
                                    <TouchableOpacity
                                        style={styles.cancelSearchBtn}
                                        onPress={handleCancelMatch}
                                        accessibilityRole="button"
                                        accessibilityLabel="Cancel Search"
                                        accessibilityHint="Stops searching for an opponent"
                                    >
                                        <Text style={styles.cancelSearchText}>CANCEL</Text>
                                    </TouchableOpacity>
                                )}
                            </>
                        ) : (
                            <>
                                <Text style={styles.foundText} accessibilityRole="text" accessibilityLabel="Match found">MATCH FOUND!</Text>
                                <View style={styles.countdownContainer}>
                                    <Text style={styles.countdownNumber}>{countdown}</Text>
                                    <Text style={styles.getReadyText}>GET READY</Text>
                                </View>
                            </>
                        )}
                    </BlurView>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    safeArea: { flex: 1, paddingHorizontal: 24, paddingTop: 5 },
    headerStack: {
        width: '100%',
        zIndex: 10,
    },
    topRow: {
        width: '100%',
        height: 40,
        justifyContent: 'center',
        paddingHorizontal: 0,
    },
    backButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        alignSelf: 'flex-start',
    },
    titleStack: {
        alignItems: 'center',
        marginTop: 5,
        marginBottom: 20, // Adjusted after UID removal
    },
    backText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '800',
        marginLeft: 4,
        letterSpacing: 1,
    },
    headerTitle: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '900',
        letterSpacing: 4,
        textAlign: 'center',
        marginBottom: 8,
    },
    statsBadgeContainer: {
        alignItems: 'center',
    },
    statsBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        overflow: 'hidden',
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statsDivider: {
        width: 1,
        height: 12,
        backgroundColor: 'rgba(255,255,255,0.2)',
        marginHorizontal: 12,
    },
    statsLabel: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 1,
        marginRight: 6,
    },
    statsValueName: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '800',
    },
    statsValueRating: {
        color: '#4DA8DA',
        fontSize: 15,
        fontWeight: '900',
    },
    mainContent: {
        marginTop: 40, // Pushed further down for centerpiece balance
        gap: 20
    },
    randomMatchBtn: { borderRadius: 30, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
    randomMatchBlur: { paddingVertical: 40, alignItems: 'center', backgroundColor: 'rgba(77,168,218,0.2)' },
    randomTitle: { color: '#FFF', fontSize: 24, fontWeight: '900', letterSpacing: 2 },
    randomSub: { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 6, letterSpacing: 2 },
    glint: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: 'rgba(255,255,255,0.5)' },
    divider: { flexDirection: 'row', alignItems: 'center', gap: 15, marginVertical: 8 },
    line: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
    orText: { color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: '700' },
    privateContainer: { gap: 12 },
    privateMiniBtn: { borderRadius: 15, overflow: 'hidden' },
    miniBlur: { padding: 14, alignItems: 'center' },
    miniBtnText: { color: '#FFF', fontWeight: '800', letterSpacing: 1 },
    joinCard: { borderRadius: 15, overflow: 'hidden', flexDirection: 'row', padding: 10, gap: 10 },
    miniInput: { flex: 1, height: 45, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 10, color: '#FFF', textAlign: 'center', fontSize: 18, fontWeight: '800' },
    miniJoinBtn: { backgroundColor: '#FFF', width: 70, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    miniJoinText: { color: '#000', fontWeight: '900' },
    waitingContainer: { flex: 1, justifyContent: 'center' },
    waitingCard: { borderRadius: 30, overflow: 'hidden', padding: 40, alignItems: 'center', gap: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
    waitingLabel: { color: 'rgba(255,255,255,0.4)', letterSpacing: 2, fontWeight: '700' },
    roomCode: { color: '#FFF', fontSize: 56, fontWeight: '900', letterSpacing: 10 },
    statusText: { color: '#4DA8DA', fontSize: 14, fontWeight: '700', marginTop: 20 },
    startBtn: { backgroundColor: '#FFF', paddingHorizontal: 50, paddingVertical: 18, borderRadius: 35, marginTop: 40 },
    startBtnText: { color: '#000', fontWeight: '900', fontSize: 18 },
    backBtn: { marginTop: 20 },
    backBtnText: { color: 'rgba(255,255,255,0.5)', fontWeight: '700' },
    matchOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
    searchingText: { color: '#FFF', fontSize: 20, fontWeight: '900', letterSpacing: 3, marginBottom: 30 },
    matchTimerContainer: {
        width: 90,
        height: 90,
        borderRadius: 45,
        borderWidth: 2,
        borderColor: 'rgba(77,168,218,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    matchTimerNumber: {
        color: '#4DA8DA',
        fontSize: 36,
        fontWeight: '900',
    },
    matchTimerBarBg: {
        width: 200,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.1)',
        overflow: 'hidden',
        marginBottom: 10,
    },
    matchTimerBarFill: {
        height: '100%',
        backgroundColor: '#4DA8DA',
        borderRadius: 2,
    },
    cancelSearchBtn: { marginTop: 50, paddingHorizontal: 40, paddingVertical: 15, borderRadius: 30, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
    cancelSearchText: { color: '#FFF', fontWeight: '800' },
    foundText: { color: '#4DA8DA', fontSize: 24, fontWeight: '900', marginTop: 80 },
    countdownContainer: {
        marginTop: 40,
        alignItems: 'center',
        gap: 10
    },
    countdownNumber: {
        color: '#FFF',
        fontSize: 80,
        fontWeight: '900',
        textShadowColor: 'rgba(77,168,218,0.5)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 20,
    },
    getReadyText: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 14,
        fontWeight: '800',
        letterSpacing: 4,
    }
});
