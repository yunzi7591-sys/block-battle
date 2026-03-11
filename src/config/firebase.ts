import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";

// Firebase configuration provided by theProducer
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
