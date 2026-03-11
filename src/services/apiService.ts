import { signInAnonymously } from "firebase/auth";
import {
    collection,
    doc,
    setDoc,
    query,
    orderBy,
    limit,
    getDocs,
    DocumentData
} from "firebase/firestore";
import { auth, db } from "../config/firebase";

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
     * Handles missing index errors gracefully by logging the requirement URL.
     */
    fetchLeaderboard: async (type: 'score' | 'rate', period: 'weekly' | 'monthly'): Promise<LeaderboardEntry[]> => {
        console.log(`[Firebase] fetchLeaderboard (type: ${type})`);

        // Firestore field mapping
        const field = type === 'score' ? 'highScore' : 'rating';

        try {
            const usersRef = collection(db, "users");
            // We order by the target field descending
            const q = query(usersRef, orderBy(field, "desc"), limit(10));

            const querySnapshot = await getDocs(q);
            const data: LeaderboardEntry[] = [];

            let rank = 1;
            querySnapshot.forEach((doc) => {
                const userData = doc.data();
                data.push({
                    id: doc.id,
                    name: userData.name || 'Unknown',
                    value: userData[field] || 0,
                    rank: rank++
                });
            });

            return data;
        } catch (error: any) {
            if (error.code === 'failed-precondition') {
                console.error('[Firebase] INDEX MISSING! Please create index here:', error.message);
            } else {
                console.error('[Firebase] Query Error:', error);
            }
            throw new Error('Could not load rankings. Please try again later.');
        }
    },

    /**
     * Syncs user stats/profile to Firestore.
     */
    updateUserData: async (uid: string, data: Partial<Omit<UserBackendData, 'uid'>>): Promise<boolean> => {
        console.log(`[Firebase] updateUserData for ${uid}:`, data);
        try {
            const userRef = doc(db, "users", uid);
            await setDoc(userRef, data, { merge: true });
            return true;
        } catch (error: any) {
            console.error('[Firebase] Update Error:', error);
            throw new Error('Failed to sync profile with server.');
        }
    }
};
