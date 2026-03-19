/**
 * onlinePvPStore.ts — PvP multiplayer state management (Refactored)
 *
 * Responsibilities split into:
 * - pvp/pvpTypes.ts        — Type definitions
 * - pvp/pvpConnection.ts   — Room creation, joining, matchmaking, AI fallback
 * - pvp/pvpListenerSync.ts — Firebase room data synchronization
 * - pvp/pvpGameActions.ts  — placeBlockSync, tickTimer, reportDefeat, processAITurn
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { createBoard } from '../game/board';
import { useUserStore } from './userStore';
import { useGameStore } from './gameStore';
import { OnlinePvPState } from './pvp/pvpTypes';

// Import action creators from split modules
import { createCreateRoom, createJoinRoom, createStartAutoMatch, createCancelAutoMatch, createReset } from './pvp/pvpConnection';
import { createPlaceBlockSync, createTickTimer, createReportDefeat, createCalculateRatingChange, createForceResync, createProcessAITurn } from './pvp/pvpGameActions';

export const useOnlinePvPStore = create<OnlinePvPState>()(subscribeWithSelector((set, get) => ({
    // ─── Initial State ────────────────────────────────────
    roomId: null,
    isHost: false,
    sharedBoard: createBoard(),
    myPlayerNumber: 0,
    currentBlocks: [],
    timeLeft: 30,
    isGameOver: false,
    winner: null,
    status: 'matching',
    isMatching: false,
    matchingLocked: false,
    boardLayout: null,
    preview: null,
    player1: null,
    player2: null,
    rating: useUserStore.getState().rating,
    opponentRating: 1500,
    ratingChange: null,
    isRanked: false,
    lastOptimisticMoveTime: 0,
    _unsubscribeRoom: null,
    _subscribedRoomId: null,

    currentTurn: null,
    placedCount: 0,
    turnNumber: 1,
    turnStartTime: null,
    turnDuration: 30000,
    serverTimeOffset: 0,
    lastMove: null,
    pendingMoveCount: 0,
    isProcessingPlacement: false,
    lastTimeoutReportTime: 0,
    ratingApplied: false,

    // ─── AI Match State ───────────────────────────────────
    isAIMatch: false,
    aiUid: null,

    // ─── Connection Actions (from pvpConnection.ts) ──────
    createRoom: createCreateRoom(set, get),
    joinRoom: createJoinRoom(set, get),
    startAutoMatch: createStartAutoMatch(set, get),
    cancelAutoMatch: createCancelAutoMatch(set, get),
    reset: createReset(set, get),

    // ─── Game Actions (from pvpGameActions.ts) ───────────
    placeBlockSync: createPlaceBlockSync(set, get),
    tickTimer: createTickTimer(set, get),
    reportDefeat: createReportDefeat(set, get),
    forceResync: createForceResync(set, get),
    calculateRatingChange: createCalculateRatingChange(get),
    processAITurn: createProcessAITurn(set, get),

    // ─── Simple Actions ─────────────────────────────────
    setBoardLayout: (layout) => set({ boardLayout: layout }),
    setPreview: (preview) => set({ preview }),
    handleDisconnect: () => {
        set({ status: 'finished', isGameOver: true, winner: null, ratingChange: 0 });
    },
})));

// ─── Observer: Defeat Reporting (Secondary Guard) ────────
// PvP mode uses server authority. gameStore.isGameOver stays false in PvP.
// This observer only fires for solo mode as a safety guard.
useGameStore.subscribe(
    (state) => state.isGameOver,
    (isGameOver) => {
        if (isGameOver) {
            // PvP mode: suppress local defeat reporting
            if (useGameStore.getState().isPvP) return;

            const pvpStore = useOnlinePvPStore.getState();
            if (pvpStore.roomId && pvpStore.status === 'playing') {
                const userUid = useUserStore.getState().uid || "";
                if (pvpStore.currentTurn === userUid) {
                    if (pvpStore.isProcessingPlacement) {
                        console.log("[PvP/GameOver] Suppressing reporting during active placement.");
                        return;
                    }
                    console.log("[PvP/GameOver] Defeat detected via store observer. Reporting...");
                    pvpStore.reportDefeat();
                }
            }
        }
    }
);
