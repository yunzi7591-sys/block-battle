import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiService } from '../services/apiService';

interface UserState {
    userName: string;
    highScore: number;
    rating: number;
    uid: string | null;
    isAuthLoading: boolean;
    _hasHydrated: boolean;

    // Actions
    setUserName: (name: string) => void;
    updateHighScore: (score: number) => void;
    updateRating: (newRating: number) => void;
    setUid: (uid: string) => void;
    setAuthLoading: (loading: boolean) => void;
    initializeAuth: () => Promise<void>;
    setHasHydrated: (state: boolean) => void;
    syncProfile: () => Promise<void>;
    deleteAccount: () => Promise<void>;
}

const generateInitialName = () => {
    const id = Math.floor(Math.random() * 9000) + 1000;
    return `Player_${id}`;
};

export const useUserStore = create<UserState>()(
    persist(
        (set, get) => ({
            userName: generateInitialName(),
            highScore: 0,
            rating: 1500,
            uid: null,
            isAuthLoading: false,
            _hasHydrated: false,

            setUserName: (name) => {
                set({ userName: name });
                get().syncProfile();
            },
            updateHighScore: (score) => {
                const currentHighScore = get().highScore;
                if (score > currentHighScore) {
                    set({ highScore: score });
                    get().syncProfile();
                }
            },
            updateRating: (newRating: number) => {
                set({ rating: newRating });
                get().syncProfile();
            },
            setUid: (uid) => set({ uid }),
            setAuthLoading: (loading: boolean) => set({ isAuthLoading: loading }),
            setHasHydrated: (state: boolean) => set({ _hasHydrated: state }),

            syncProfile: async () => {
                const { uid, userName, highScore, rating } = get();
                if (!uid) return;
                try {
                    await apiService.updateUserData(uid, {
                        name: userName,
                        highScore,
                        rating
                    });
                } catch (e) {
                    console.error('[UserStore] syncProfile Error:', e);
                }
            },

            deleteAccount: async () => {
                const { uid } = get();
                if (!uid) throw new Error('No account to delete.');
                // 1. Delete from Firebase (Auth + Firestore + RTDB)
                await apiService.deleteAccount(uid);
                // 2. Clear local AsyncStorage
                await AsyncStorage.clear();
                // 3. Reset local state to defaults
                set({
                    userName: generateInitialName(),
                    highScore: 0,
                    rating: 1500,
                    uid: null,
                    isAuthLoading: false,
                    _hasHydrated: true,
                });
                console.log('[UserStore] Account deleted and local state reset.');
            },

            initializeAuth: async () => {
                const state = get();
                const { uid, _hasHydrated, setUid, setAuthLoading } = state;

                // CRITICAL: Block initialization until hydration is complete
                if (!_hasHydrated) {
                    console.log('[Auth] Waiting for hydration...');
                    return;
                }

                setAuthLoading(true);
                try {
                    const finalUid = await apiService.loginAnonymously(uid || undefined);
                    console.log(`[Auth/Persistence] Session UID: ${finalUid} (Previous: ${uid || 'N/A'})`);
                    setUid(finalUid);

                    // --- Phase 41: Restore Profile from Server ---
                    const profile = await apiService.getUserProfile(finalUid);
                    if (profile) {
                        console.log(`[Auth] Profile restored for ${finalUid}:`, profile);
                        set({
                            userName: profile.name || state.userName,
                            highScore: Math.max(state.highScore, profile.highScore || 0),
                            rating: profile.rating || state.rating
                        });
                    } else {
                        // First time user on this UID: Save initial profile
                        await get().syncProfile();
                    }
                } catch (e) {
                    console.error('[Auth] Failed to initialize anonymous auth:', e);
                } finally {
                    setAuthLoading(false);
                }
            },

        }),
        {
            name: 'user-storage',
            storage: createJSONStorage(() => AsyncStorage),
            onRehydrateStorage: (state) => {
                console.log('[Hydration] userStore hydration starting...');
                return (state, error) => {
                    if (error) {
                        console.error('[Hydration] error during hydration:', error);
                    } else {
                        console.log('[Hydration] userStore hydrated successfully.');
                        state?.setHasHydrated(true);
                    }
                };
            },
        }
    )
);
