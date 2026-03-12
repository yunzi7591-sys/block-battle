import { initializeApp, getApps, getApp } from "firebase/app";
import {
    initializeAuth,
    getAuth,
    getReactNativePersistence
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBGrSffYDqzLunxr49rWHq7k_EbI0N3Mj8",
    authDomain: "blockpuzzle-online.firebaseapp.com",
    projectId: "blockpuzzle-online",
    storageBucket: "blockpuzzle-online.firebasestorage.app",
    messagingSenderId: "690391372308",
    appId: "1:690391372308:web:71f69069d1acd59d3f0d01",
    measurementId: "G-1Z647Y53WD",
    databaseURL: "https://blockpuzzle-online-default-rtdb.firebaseio.com/"
};

// Initialize Firebase safely
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Services with Persistence
export const auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
});

export const db = getFirestore(app);
export const rtdb = getDatabase(app);
