import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { CathedralBackground } from '../components/CathedralBackground';
import { playDecisionSound } from '../utils/sounds';
import { LeaderboardWidget } from '../components/LeaderboardWidget';
import { useUserStore } from '../store/userStore';
import { Ionicons } from '@expo/vector-icons';

export function HomeScreen({ navigation }: any) {
    const { highScore } = useUserStore();
    const insets = useSafeAreaInsets();

    const handlePlay = () => {
        playDecisionSound();
        navigation.navigate('Game');
    };

    const handleProfile = () => {
        playDecisionSound();
        navigation.navigate('Profile');
    };

    return (
        <View style={styles.container}>
            <CathedralBackground />

            <View style={[styles.topHeader, { paddingTop: insets.top + 10 }]}>
                <TouchableOpacity
                    style={styles.profileBtn}
                    onPress={handleProfile}
                    accessibilityRole="button"
                    accessibilityLabel="Profile"
                    accessibilityHint="Opens your player profile"
                >
                    <BlurView intensity={40} tint="light" style={styles.profileBlur}>
                        <Ionicons name="person" size={20} color="#FFF" />
                    </BlurView>
                </TouchableOpacity>
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={[
                    styles.scrollContent,
                    { paddingBottom: insets.bottom + 60 }
                ]}
                showsVerticalScrollIndicator={false}
            >
                {/* Header / High Score Panel */}
                <BlurView intensity={30} tint="light" style={styles.glassPanel}>
                    <Text style={styles.panelLabel} accessibilityRole="text">BEST PERFORMANCE</Text>
                    <Text style={styles.highScore} accessibilityRole="text" accessibilityLabel={`High score: ${highScore.toLocaleString()}`}>{highScore.toLocaleString()}</Text>
                </BlurView>

                <View style={styles.buttonContainer}>
                    {/* Main Interaction */}
                    <TouchableOpacity
                        style={styles.mainButton}
                        onPress={handlePlay}
                        accessibilityRole="button"
                        accessibilityLabel="Single Play"
                        accessibilityHint="Starts a single player game"
                    >
                        <BlurView intensity={50} tint="light" style={styles.buttonBlur}>
                            <Text style={styles.buttonText}>SINGLE PLAY</Text>
                        </BlurView>
                    </TouchableOpacity>

                    {/* Online PvP Interaction */}
                    <TouchableOpacity
                        style={styles.mainButton}
                        onPress={() => { playDecisionSound(); navigation.navigate('Lobby'); }}
                        accessibilityRole="button"
                        accessibilityLabel="Online Match"
                        accessibilityHint="Opens the online matchmaking lobby"
                    >
                        <BlurView intensity={50} tint="light" style={styles.buttonBlur}>
                            <Text style={styles.buttonText}>ONLINE MATCH</Text>
                        </BlurView>
                    </TouchableOpacity>
                </View>

                {/* Global Leaderboard Widget (Moved to bottom) */}
                <LeaderboardWidget />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    topHeader: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        paddingHorizontal: 24,
        zIndex: 10,
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
    },
    profileBtn: {
        borderRadius: 20,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    profileBlur: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 24,
        paddingTop: 120, // Space for topHeader
    },
    glassPanel: {
        padding: 32,
        borderRadius: 24,
        borderWidth: 0.5,
        borderColor: 'rgba(255,255,255,0.3)',
        alignItems: 'center',
        marginBottom: 40,
        overflow: 'hidden',
    },
    panelLabel: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 2,
    },
    highScore: {
        color: '#FFFFFF',
        fontSize: 48,
        fontWeight: '800',
        marginTop: 8,
    },
    buttonContainer: {
        gap: 16,
        marginBottom: 40,
    },
    mainButton: {
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 0.5,
        borderColor: 'rgba(255,255,255,0.4)',
    },
    buttonBlur: {
        paddingVertical: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 20,
        fontWeight: '700',
        letterSpacing: 2,
    },
});
