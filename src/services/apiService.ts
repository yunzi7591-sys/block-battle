import { signInAnonymously, deleteUser } from "firebase/auth";
import {
    collection,
    doc,
    setDoc,
    getDoc,
    deleteDoc,
    query,
    orderBy,
    limit,
    getDocs,
    DocumentData
} from "firebase/firestore";
import { ref, remove } from "firebase/database";
import { auth, db, rtdb } from "../config/firebase";

export interface UserBackendData {
    uid: string;
    name: string;
    highScore: number;
    rating: number;
}

export interface LeaderboardEntry {
    id: string;
    name: string;
    value: number;
    rank: number;
}

// ─── ダミーランキングデータ（Firestore取得失敗時のフォールバック）───
const DUMMY_SCORE_DATA: Omit<LeaderboardEntry, 'rank'>[] = [
    { id: 'dummy_001', name: 'xXx魔王xXx',     value: 91200 },
    { id: 'dummy_002', name: 'ゆうな',           value: 76200 },
    { id: 'dummy_003', name: 'BLOCK_GOD_777',   value: 68400 },
    { id: 'dummy_004', name: 'さくら',           value: 64500 },
    { id: 'dummy_005', name: 'zzz',             value: 55800 },
    { id: 'dummy_006', name: 'みお',             value: 52100 },
    { id: 'dummy_007', name: 'うんち',           value: 44300 },
    { id: 'dummy_008', name: 'あかり',           value: 43200 },
    { id: 'dummy_009', name: '俺が最強',         value: 37600 },
    { id: 'dummy_010', name: 'ひなた',           value: 35400 },
    { id: 'dummy_011', name: 'Player_8291',     value: 29800 },
    { id: 'dummy_012', name: 'こはる',           value: 28700 },
    { id: 'dummy_013', name: 'aaa',             value: 24100 },
    { id: 'dummy_014', name: 'すず',             value: 22800 },
    { id: 'dummy_015', name: '暇人',             value: 18900 },
    { id: 'dummy_016', name: 'test',            value: 15600 },
    { id: 'dummy_017', name: 'しゅん',           value: 14800 },
    { id: 'dummy_018', name: '(´・ω・`)',        value: 11700 },
    { id: 'dummy_019', name: 'つむぎ',           value: 10500 },
    { id: 'dummy_020', name: 'Player_4402',     value: 7300 },
];

const DUMMY_RATE_DATA: Omit<LeaderboardEntry, 'rank'>[] = [
    { id: 'dummy_021', name: '野獣先輩',         value: 1842 },
    { id: 'dummy_002', name: 'ゆうな',           value: 1685 },
    { id: 'dummy_022', name: 'xXx魔王xXx',     value: 1671 },
    { id: 'dummy_004', name: 'さくら',           value: 1640 },
    { id: 'dummy_023', name: 'Player_1192',     value: 1608 },
    { id: 'dummy_006', name: 'みお',             value: 1590 },
    { id: 'dummy_024', name: 'ガチ勢です',       value: 1572 },
    { id: 'dummy_008', name: 'あかり',           value: 1560 },
    { id: 'dummy_025', name: 'zzz',             value: 1538 },
    { id: 'dummy_010', name: 'ひなた',           value: 1530 },
    { id: 'dummy_026', name: '(´・ω・`)',        value: 1517 },
    { id: 'dummy_012', name: 'こはる',           value: 1510 },
    { id: 'dummy_013', name: 'aaa',             value: 1502 },
    { id: 'dummy_014', name: 'すず',             value: 1498 },
    { id: 'dummy_027', name: '暇人',             value: 1487 },
    { id: 'dummy_016', name: 'test',            value: 1479 },
    { id: 'dummy_017', name: 'しゅん',           value: 1475 },
    { id: 'dummy_028', name: 'うんち',           value: 1462 },
    { id: 'dummy_019', name: 'つむぎ',           value: 1458 },
    { id: 'dummy_029', name: 'Player_4402',     value: 1443 },
];

function getDummyLeaderboard(type: 'score' | 'rate'): LeaderboardEntry[] {
    const source = type === 'score' ? DUMMY_SCORE_DATA : DUMMY_RATE_DATA;
    return source.map((entry, i) => ({ ...entry, rank: i + 1 }));
}

export const apiService = {
    /**
     * Performs anonymous login using Firebase Auth.
     * Uses existing currentUser if available to prevent double initialization.
     */
    loginAnonymously: async (existingUid?: string): Promise<string> => {
        console.log(`[Firebase] loginAnonymously check...`);

        // Check if already signed in
        if (auth.currentUser) {
            console.log(`[Firebase] Existing user found: ${auth.currentUser.uid}`);
            return auth.currentUser.uid;
        }

        try {
            const userCredential = await signInAnonymously(auth);
            const uid = userCredential.user.uid;
            console.log(`[Firebase] New Anonymous Login: ${uid}`);
            return uid;
        } catch (error: any) {
            console.error('[Firebase] Auth Error Details:');
            console.error('Code:', error.code);
            console.error('Message:', error.message);

            if (error.code === 'auth/operation-not-allowed') {
                console.error('CRITICAL: Anonymous Authentication is NOT enabled in the Firebase Console (Authentication > Sign-in method).');
            } else if (error.code === 'auth/network-request-failed') {
                console.error('Network error. Check your internet connection and Firebase Config databaseURL.');
            }

            throw new Error(`Authentication failed (${error.code}). Please check your connection and Firebase console settings.`);
        }
    },

    /**
     * Fetches top players from Firestore.
     */
    fetchLeaderboard: async (type: 'score' | 'rate', period: 'weekly' | 'monthly'): Promise<LeaderboardEntry[]> => {
        console.log(`[Firebase] fetchLeaderboard (type: ${type})`);

        const field = type === 'score' ? 'highScore' : 'rating';
        let realData: LeaderboardEntry[] = [];

        try {
            const usersRef = collection(db, "users");
            const q = query(usersRef, orderBy(field, "desc"), limit(20));
            const querySnapshot = await getDocs(q);

            let rank = 1;
            querySnapshot.forEach((docSnap) => {
                const userData = docSnap.data();
                const nameDisplay = userData.name || userData.displayName || 'Unknown';
                realData.push({
                    id: docSnap.id,
                    name: nameDisplay,
                    value: userData[field] || 0,
                    rank: rank++
                });
            });
        } catch (error: any) {
            console.warn('[Firebase] fetchLeaderboard Error (using dummy fallback):', error);
        }

        // ダミーデータとマージ: 実ユーザーのIDと重複しないダミーだけ追加
        const dummy = getDummyLeaderboard(type);
        const realIds = new Set(realData.map(e => e.id));
        const merged = [...realData];
        for (const d of dummy) {
            if (!realIds.has(d.id)) {
                merged.push(d);
            }
        }

        // value降順でソートし直してrankを振り直す
        merged.sort((a, b) => b.value - a.value);
        return merged.slice(0, 20).map((entry, i) => ({ ...entry, rank: i + 1 }));
    },

    /**
     * Fetches a single user profile from Firestore.
     */
    getUserProfile: async (uid: string): Promise<UserBackendData | null> => {
        try {
            const userRef = doc(db, "users", uid);
            const docSnap = await getDoc(userRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                return {
                    uid: docSnap.id,
                    name: data.name || data.displayName || 'Unknown',
                    highScore: data.highScore || 0,
                    rating: data.rating || 1500
                };
            }
            return null;
        } catch (e) {
            console.error('[Firebase] getUserProfile Error:', e);
            return null;
        }
    },

    /**
     * Syncs user stats/profile to Firestore.
     */
    updateUserData: async (uid: string, data: Partial<Omit<UserBackendData, 'uid'>>): Promise<boolean> => {
        console.log(`[Firebase] updateUserData for ${uid}:`, data);
        try {
            const userRef = doc(db, "users", uid);
            // Use setDoc with merge:true to ensure we don't overwrite other fields (like createdAt)
            await setDoc(userRef, {
                ...data,
                updatedAt: new Date().getTime()
            }, { merge: true });
            return true;
        } catch (error: any) {
            console.error('[Firebase] Update Error:', error);
            return false;
        }
    },

    /**
     * Deletes the current user's account and all associated data.
     * 1. Firestore users/{uid} document
     * 2. RTDB users/{uid} node (if exists)
     * 3. Firebase Auth user
     */
    deleteAccount: async (uid: string): Promise<void> => {
        console.log(`[Firebase] deleteAccount for ${uid}`);
        try {
            // 1. Delete Firestore user document
            const userRef = doc(db, "users", uid);
            await deleteDoc(userRef);
            console.log(`[Firebase] Firestore user/${uid} deleted.`);

            // 2. Delete RTDB user node (if exists)
            const rtdbUserRef = ref(rtdb, `users/${uid}`);
            await remove(rtdbUserRef);
            console.log(`[Firebase] RTDB users/${uid} deleted.`);

            // 3. Delete Firebase Auth user
            const currentUser = auth.currentUser;
            if (currentUser && currentUser.uid === uid) {
                await deleteUser(currentUser);
                console.log(`[Firebase] Auth user ${uid} deleted.`);
            }
        } catch (error: any) {
            console.error('[Firebase] deleteAccount Error:', error);
            throw new Error(`Account deletion failed: ${error.message}`);
        }
    }
};
