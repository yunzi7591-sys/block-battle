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
    resetAccount: () => Promise<void>;
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

            setUserName: (name) => set({ userName: name }),
            updateHighScore: (score) => set((state) => ({
                highScore: Math.max(state.highScore, score)
            })),
            updateRating: (newRating: number) => {
                set({ rating: newRating });
            },
            setUid: (uid) => set({ uid }),
            setAuthLoading: (loading) => set({ isAuthLoading: loading }),
            setHasHydrated: (state) => set({ _hasHydrated: state }),

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
                    console.log(`[Auth] Anonymous Login Success. UID: ${finalUid}`);
                    setUid(finalUid);
                } catch (e) {
                    console.error('[Auth] Failed to initialize anonymous auth:', e);
                } finally {
                    setAuthLoading(false);
                }
            },

            resetAccount: async () => {
                console.log('[Auth] Resetting Account...');
                const { auth } = await import('../config/firebase');

                try {
                    // 1. Sign out from Firebase
                    await auth.signOut();

                    // 2. Clear local storage
                    await AsyncStorage.removeItem('user-storage');

                    // 3. Reset in-memory state
                    set({
                        uid: null,
                        userName: generateInitialName(),
                        highScore: 0,
                        rating: 1500,
                    });

                    // 4. Force re-login
                    await get().initializeAuth();
                    console.log('[Auth] Account reset complete.');
                } catch (e) {
                    console.error('[Auth] Reset Account Error:', e);
                    throw e;
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
