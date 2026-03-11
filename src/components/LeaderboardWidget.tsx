import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useUserStore } from '../store/userStore';
import { apiService, LeaderboardEntry } from '../services/apiService';

// Types
type LeaderboardType = 'score' | 'rate';
type RankingPeriod = 'weekly' | 'monthly';

export function LeaderboardWidget() {
    const { userName, highScore, rating } = useUserStore();
    const [type, setType] = useState<LeaderboardType>('score');
    const [period, setPeriod] = useState<RankingPeriod>('weekly');

    const [data, setData] = useState<LeaderboardEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Cache state to prevent redundant API hits (Future-proof for BaaS billing)
    const [cache, setCache] = useState<Record<string, LeaderboardEntry[]>>({});

    const loadData = useCallback(async (forced: boolean = false) => {
        const cacheKey = `${type}_${period}`;

        // Return if already loading
        if (isLoading) return;

        // Check cache unless forced (e.g. pull to refresh)
        if (!forced && cache[cacheKey]) {
            setData(cache[cacheKey]);
            setError(null);
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const result = await apiService.fetchLeaderboard(type, period);
            setData(result);
            setCache(prev => ({ ...prev, [cacheKey]: result }));
        } catch (e: any) {
            setError(e.message || 'Failed to fetch rankings');
            setData([]);
        } finally {
            setIsLoading(false);
        }
    }, [type, period, cache, isLoading]);

    useEffect(() => {
        loadData();
    }, [type, period, loadData]);

    const top10 = useMemo(() => data.slice(0, 10), [data]);

    // My Stats (Local state + API rank if found)
    const myStats = useMemo(() => {
        const found = data.find(item => item.name === userName);
        return {
            rank: found ? found.rank : '---',
            value: type === 'score' ? highScore : rating
        };
    }, [data, userName, type, highScore, rating]);

    const renderRankIcon = (rank: number) => {
        if (rank === 1) return <Ionicons name="medal" size={20} color="#FFD700" />;
        if (rank === 2) return <Ionicons name="medal" size={18} color="#C0C0C0" />;
        if (rank === 3) return <Ionicons name="medal" size={16} color="#CD7F32" />;
        return <Text style={styles.rankText}>{rank}</Text>;
    };

    const getRankStyle = (rank: number) => {
        if (rank === 1) return styles.rank1;
        if (rank === 2) return styles.rank2;
        if (rank === 3) return styles.rank3;
        return null;
    };

    return (
        <BlurView intensity={40} tint="dark" style={styles.container}>
            {/* Top Level Tabs */}
            <View style={styles.topTabs}>
                <TouchableOpacity
                    style={[styles.topTab, type === 'score' && styles.activeTopTab]}
                    onPress={() => setType('score')}
                >
                    <Text style={[styles.topTabText, type === 'score' && styles.activeTopTabText]}>SINGLE SCORE</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.topTab, type === 'rate' && styles.activeTopTab]}
                    onPress={() => setType('rate')}
                >
                    <Text style={[styles.topTabText, type === 'rate' && styles.activeTopTabText]}>PVP RATING</Text>
                </TouchableOpacity>
            </View>

            {/* Header / Sub-Tabs */}
            <View style={styles.header}>
                <Text style={styles.title}>{type === 'score' ? 'HIGHSCORE' : 'ELO RANKING'}</Text>
                <View style={styles.headerRight}>
                    {type === 'score' && (
                        <View style={styles.tabBar}>
                            <TouchableOpacity
                                style={[styles.tab, period === 'weekly' && styles.activeTab]}
                                onPress={() => setPeriod('weekly')}
                            >
                                <Text style={[styles.tabText, period === 'weekly' && styles.activeTabText]}>WEEKLY</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.tab, period === 'monthly' && styles.activeTab]}
                                onPress={() => setPeriod('monthly')}
                            >
                                <Text style={[styles.tabText, period === 'monthly' && styles.activeTabText]}>MONTHLY</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                    <TouchableOpacity onPress={() => loadData(true)} style={styles.refreshBtn}>
                        <Ionicons name="refresh" size={14} color="rgba(255,255,255,0.5)" />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Content Area */}
            <View style={styles.contentArea}>
                {isLoading && (
                    <View style={styles.stateOverlay}>
                        <ActivityIndicator color="#4DA8DA" size="small" />
                        <Text style={styles.stateText}>FETCHING DATA...</Text>
                    </View>
                )}

                {error && !isLoading && (
                    <View style={styles.stateOverlay}>
                        <Ionicons name="alert-circle" size={24} color="#E94560" />
                        <Text style={[styles.stateText, { color: '#E94560' }]}>{error}</Text>
                        <TouchableOpacity style={styles.retryBtn} onPress={() => loadData(true)}>
                            <Text style={styles.retryBtnText}>RETRY</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {!isLoading && !error && (
                    <ScrollView style={styles.listScrollView} showsVerticalScrollIndicator={false}>
                        <View style={styles.list}>
                            {top10.map((item: LeaderboardEntry) => (
                                <View key={item.id} style={[styles.row, getRankStyle(item.rank)]}>
                                    <View style={styles.rankCell}>
                                        {renderRankIcon(item.rank)}
                                    </View>
                                    <Text style={[styles.nameCell, item.rank <= 3 && styles.topName]}>{item.name}</Text>
                                    <Text style={styles.scoreCell}>{item.value.toLocaleString()}</Text>
                                </View>
                            ))}
                        </View>
                    </ScrollView>
                )}
            </View>

            {/* Sticky Footer (My Rank) */}
            <View style={styles.myRankFooterContainer}>
                <LinearGradient
                    colors={type === 'score' ? ['rgba(77, 168, 218, 0.3)', 'rgba(77, 168, 218, 0.1)'] : ['rgba(233, 69, 96, 0.3)', 'rgba(233, 69, 96, 0.1)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.myRankFooter}
                >
                    <View style={styles.rankCell}>
                        <Text style={[styles.myRankText, type === 'rate' && { color: '#E94560' }]}>{myStats.rank}</Text>
                    </View>
                    <Text style={styles.myNameCell}>{userName} (YOU)</Text>
                    <Text style={[styles.myScoreCell, type === 'rate' && { color: '#E94560' }]}>{myStats.value.toLocaleString()}</Text>
                </LinearGradient>
            </View>
        </BlurView>
    );
}

const styles = StyleSheet.create({
    container: {
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
        marginVertical: 8,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    topTabs: {
        flexDirection: 'row',
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    topTab: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
    },
    activeTopTab: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderBottomWidth: 2,
        borderBottomColor: '#4DA8DA',
    },
    topTabText: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 1,
    },
    activeTopTabText: {
        color: '#FFF',
    },
    header: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
        backgroundColor: 'rgba(255,255,255,0.03)',
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    refreshBtn: {
        padding: 4,
        opacity: 0.8,
    },
    contentArea: {
        height: 240,
        position: 'relative',
        justifyContent: 'center',
    },
    stateOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 5,
        gap: 10,
    },
    stateText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 1,
    },
    retryBtn: {
        marginTop: 5,
        backgroundColor: 'rgba(233, 69, 96, 0.2)',
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(233, 69, 96, 0.4)',
    },
    retryBtnText: {
        color: '#E94560',
        fontSize: 10,
        fontWeight: '900',
    },
    title: {
        color: '#FFF',
        fontSize: 11,
        fontWeight: '900',
        letterSpacing: 1.5,
        opacity: 0.8,
    },
    tabBar: {
        flexDirection: 'row',
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderRadius: 12,
        padding: 3,
    },
    tab: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 10,
    },
    activeTab: {
        backgroundColor: 'rgba(255,255,255,0.15)',
    },
    tabText: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 9,
        fontWeight: '800',
    },
    activeTabText: {
        color: '#FFF',
    },
    listScrollView: {
        maxHeight: 240, // Ensure fixed height for internal scroll on small screens
    },
    list: {
        paddingVertical: 2,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 4,
        paddingHorizontal: 16,
    },
    rankCell: {
        width: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rankText: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 12,
        fontWeight: '700',
    },
    nameCell: {
        flex: 1,
        color: 'rgba(255,255,255,0.7)',
        fontSize: 13,
        fontWeight: '600',
        marginLeft: 12,
    },
    topName: {
        color: '#FFF',
        fontWeight: '800',
    },
    scoreCell: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 13,
        fontWeight: '700',
        fontVariant: ['tabular-nums'],
    },
    rank1: {
        backgroundColor: 'rgba(255, 215, 0, 0.08)',
    },
    rank2: {
        backgroundColor: 'rgba(192, 192, 192, 0.05)',
    },
    rank3: {
        backgroundColor: 'rgba(205, 127, 50, 0.05)',
    },
    myRankFooterContainer: {
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.2)',
    },
    myRankFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    myRankText: {
        color: '#4DA8DA',
        fontSize: 14,
        fontWeight: '900',
    },
    myNameCell: {
        flex: 1,
        color: '#FFF',
        fontSize: 12,
        fontWeight: '800',
        marginLeft: 12,
        letterSpacing: 1,
    },
    myScoreCell: {
        color: '#4DA8DA',
        fontSize: 15,
        fontWeight: '900',
        fontVariant: ['tabular-nums'],
    },
});
