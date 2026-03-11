import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { CathedralBackground } from '../components/CathedralBackground';
import { useUserStore } from '../store/userStore';
import { playDecisionSound } from '../utils/sounds';
import { apiService } from '../services/apiService';
import { Alert } from 'react-native';

export function ProfileScreen({ navigation }: any) {
    const { userName, highScore, rating, setUserName, uid, resetAccount } = useUserStore();
    const [tempName, setTempName] = useState(userName);
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        if (tempName.trim().length === 0) return;
        if (tempName.trim() === userName) return;

        playDecisionSound();
        setIsSaving(true);

        try {
            // SYNC TO BACKEND
            if (uid) {
                await apiService.updateUserData(uid, { name: tempName.trim() });
            }

            // UPDATE LOCAL STATE
            setUserName(tempName.trim());
            Alert.alert('SUCCESS', 'Profile updated successfully!');
        } catch (e: any) {
            Alert.alert('ERROR', e.message || 'Failed to sync with server. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleResetAccount = () => {
        Alert.alert(
            "RESET ACCOUNT",
            "This will permanently clear your progress and generate a new User ID. Are you sure?",
            [
                { text: "CANCEL", style: "cancel" },
                {
                    text: "RESET",
                    style: "destructive",
                    onPress: async () => {
                        setIsSaving(true);
                        try {
                            await resetAccount();
                            Alert.alert("SUCCESS", "Account has been reset with a new ID.");
                            setTempName(useUserStore.getState().userName);
                        } catch (e: any) {
                            Alert.alert("ERROR", e.message || "Failed to reset account.");
                        } finally {
                            setIsSaving(false);
                        }
                    }
                }
            ]
        );
    };

    return (
        <View style={styles.container}>
            <CathedralBackground />
            <SafeAreaView style={styles.safeArea}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={{ flex: 1 }}
                >
                    <View style={styles.header}>
                        <TouchableOpacity
                            style={styles.backButton}
                            onPress={() => { playDecisionSound(); navigation.goBack(); }}
                            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                        >
                            <Ionicons name="chevron-back" size={24} color="#FFF" />
                            <Text style={styles.backText}>HOME</Text>
                        </TouchableOpacity>
                        <Text style={styles.title}>MY PROFILE</Text>
                    </View>

                    <ScrollView contentContainerStyle={styles.scrollContent}>
                        {/* Name Change Section */}
                        <BlurView intensity={40} tint="light" style={styles.profileCard}>
                            <View style={styles.iconContainer}>
                                <Ionicons name="person-circle" size={80} color="#4DA8DA" />
                            </View>

                            <View style={styles.inputSection}>
                                <Text style={styles.label}>PLAYER NAME</Text>
                                <TextInput
                                    style={styles.input}
                                    value={tempName}
                                    onChangeText={setTempName}
                                    maxLength={12}
                                    placeholder="Enter name..."
                                    placeholderTextColor="rgba(255,255,255,0.3)"
                                />
                                {uid && (
                                    <Text style={styles.uidText}>ID: {uid}</Text>
                                )}
                                <TouchableOpacity
                                    style={[styles.saveBtn, tempName === userName && styles.saveBtnDisabled]}
                                    onPress={handleSave}
                                    disabled={tempName === userName || isSaving}
                                >
                                    <Text style={styles.saveBtnText}>{isSaving ? 'SAVING...' : 'SAVE CHANGES'}</Text>
                                </TouchableOpacity>
                            </View>
                        </BlurView>

                        {/* Stats Section */}
                        <View style={styles.statsContainer}>
                            <BlurView intensity={30} tint="light" style={styles.statBox}>
                                <Ionicons name="trophy" size={24} color="#FFD700" style={styles.statIcon} />
                                <Text style={styles.statLabel}>BEST SCORE</Text>
                                <Text style={styles.statValue}>{highScore.toLocaleString()}</Text>
                            </BlurView>

                            <BlurView intensity={30} tint="light" style={styles.statBox}>
                                <Ionicons name="flash" size={24} color="#E94560" style={styles.statIcon} />
                                <Text style={styles.statLabel}>PvP RATING</Text>
                                <Text style={styles.statValue}>{rating.toLocaleString()}</Text>
                            </BlurView>
                        </View>

                        {/* Danger Zone: Account Reset */}
                        <View style={styles.dangerZone}>
                            <Text style={styles.dangerTitle}>DANGER ZONE</Text>
                            <TouchableOpacity
                                style={styles.resetBtn}
                                onPress={handleResetAccount}
                                disabled={isSaving}
                            >
                                <BlurView intensity={20} tint="dark" style={styles.resetBlur}>
                                    <Ionicons name="trash-outline" size={20} color="#FF6B6B" />
                                    <Text style={styles.resetBtnText}>CREATE NEW ACCOUNT (RESET)</Text>
                                </BlurView>
                            </TouchableOpacity>
                            <Text style={styles.dangerSub}>
                                This will sign you out and generate a completely new Player ID.
                            </Text>
                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    safeArea: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 20,
        position: 'relative'
    },
    backButton: {
        position: 'absolute',
        left: 20,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
    },
    backText: { color: '#FFF', fontSize: 12, fontWeight: '800', marginLeft: 4 },
    title: { color: '#FFF', fontSize: 20, fontWeight: '800', letterSpacing: 4 },
    scrollContent: { padding: 24, gap: 24 },
    profileCard: {
        borderRadius: 30,
        padding: 30,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        overflow: 'hidden'
    },
    iconContainer: { marginBottom: 20 },
    inputSection: { width: '100%', gap: 10 },
    label: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 5 },
    input: {
        backgroundColor: 'rgba(0,0,0,0.3)',
        color: '#FFF',
        fontSize: 24,
        fontWeight: '900',
        paddingHorizontal: 20,
        paddingVertical: 15,
        borderRadius: 15,
        textAlign: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)'
    },
    uidText: {
        color: 'rgba(255,255,255,0.25)',
        fontSize: 10,
        textAlign: 'center',
        marginTop: 5,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace'
    },
    saveBtn: {
        backgroundColor: '#4DA8DA',
        paddingVertical: 15,
        borderRadius: 15,
        alignItems: 'center',
        marginTop: 10
    },
    saveBtnDisabled: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        opacity: 0.5
    },
    saveBtnText: { color: '#FFF', fontWeight: '900', letterSpacing: 1 },
    statsContainer: { flexDirection: 'row', gap: 15 },
    statBox: {
        flex: 1,
        borderRadius: 24,
        padding: 20,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        overflow: 'hidden'
    },
    statIcon: { marginBottom: 10 },
    statLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
    statValue: { color: '#FFF', fontSize: 24, fontWeight: '900', marginTop: 5 },
    dangerZone: {
        marginTop: 40,
        paddingTop: 40,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        gap: 15
    },
    dangerTitle: {
        color: '#FF6B6B',
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 2
    },
    resetBtn: {
        width: '100%',
        borderRadius: 15,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,107,107,0.3)'
    },
    resetBlur: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 15,
        gap: 10
    },
    resetBtnText: {
        color: '#FF6B6B',
        fontWeight: '900',
        fontSize: 12,
        letterSpacing: 1
    },
    dangerSub: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 10,
        textAlign: 'center',
        paddingHorizontal: 20,
        lineHeight: 16
    }
});
