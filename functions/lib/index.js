"use strict";
/**
 * Block Battle — Cloud Functions
 *
 * Server-side rating calculation with cheat prevention and idempotency.
 *
 * Trigger:  RTDB `rooms/{roomId}` — fires when `isFinished` transitions to `true`
 * Logic:
 *   1. Idempotency guard via `isRatingCalculated` flag (RTDB Transaction)
 *   2. Cheat detection: reject games that finished in under 30 seconds
 *   3. ELO calculation (K=32) using both players' current Firestore ratings
 *   4. Atomic Firestore batch write for winner + loser rating updates
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.onGameFinished = void 0;
const app_1 = require("firebase-admin/app");
const database_1 = require("firebase-admin/database");
const firestore_1 = require("firebase-admin/firestore");
const database_2 = require("firebase-functions/v2/database");
// Initialize Firebase Admin SDK (uses default service account)
(0, app_1.initializeApp)();
// ============================================================================
// Constants
// ============================================================================
/** Minimum game duration in milliseconds to consider the result legitimate. */
const MIN_GAME_DURATION_MS = 30_000; // 30 seconds
/** ELO K-factor — controls how much ratings change per game. */
const ELO_K_FACTOR = 32;
/** Default rating for new / unranked players. */
const DEFAULT_RATING = 1500;
// ============================================================================
// ELO Calculation
// ============================================================================
/**
 * Computes the ELO rating delta for the winner.
 * The loser receives the negative of this delta.
 */
function calculateEloDelta(winnerRating, loserRating) {
    const expectedScore = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
    return Math.round(ELO_K_FACTOR * (1 - expectedScore));
}
// ============================================================================
// Cloud Function: onGameFinished
// ============================================================================
exports.onGameFinished = (0, database_2.onValueUpdated)({
    ref: "/rooms/{roomId}",
    region: "us-central1", // Same region as RTDB (default bucket)
}, async (event) => {
    const roomId = event.params.roomId;
    const after = event.data.after.val();
    // ----------------------------------------------------------------
    // Gate 1: Basic validity — only proceed for finished ranked games
    // ----------------------------------------------------------------
    if (!after) {
        return; // Room was deleted
    }
    if (!after.isFinished || !after.winner || !after.loser) {
        return; // Not a finished game (or missing winner/loser)
    }
    if (!after.isRanked) {
        console.log(`[CF] Room ${roomId}: Unranked match. Skipping rating update.`);
        return;
    }
    // ----------------------------------------------------------------
    // Gate 2: Player validation — winner and loser must be participants
    // ----------------------------------------------------------------
    const p1Uid = after.player1?.uid;
    const p2Uid = after.player2?.uid;
    if (!p1Uid || !p2Uid) {
        console.warn(`[CF] Room ${roomId}: Missing player UIDs. Aborting.`);
        return;
    }
    const participants = new Set([p1Uid, p2Uid]);
    if (!participants.has(after.winner) || !participants.has(after.loser)) {
        console.warn(`[CF] Room ${roomId}: winner=${after.winner} / loser=${after.loser} ` +
            `are not valid participants [${p1Uid}, ${p2Uid}]. Aborting.`);
        return;
    }
    if (after.winner === after.loser) {
        console.warn(`[CF] Room ${roomId}: winner === loser. Aborting.`);
        return;
    }
    // ----------------------------------------------------------------
    // Gate 3: Idempotency — use RTDB Transaction to claim processing
    // ----------------------------------------------------------------
    const db = (0, database_1.getDatabase)();
    const roomRef = db.ref(`rooms/${roomId}`);
    const txResult = await roomRef.transaction((currentData) => {
        if (!currentData) {
            return currentData; // Room deleted, abort
        }
        if (currentData.isRatingCalculated) {
            return undefined; // Already processed — abort transaction
        }
        // Claim: set flag so no other invocation processes this room
        currentData.isRatingCalculated = true;
        return currentData;
    });
    if (!txResult.committed) {
        console.log(`[CF] Room ${roomId}: Rating already calculated (idempotency guard). Skipping.`);
        return;
    }
    // ----------------------------------------------------------------
    // Gate 4: Cheat detection — minimum game duration
    // ----------------------------------------------------------------
    const gameStartTime = after.gameStartTime;
    if (typeof gameStartTime === "number" && gameStartTime > 0) {
        const now = Date.now();
        const gameDurationMs = now - gameStartTime;
        if (gameDurationMs < MIN_GAME_DURATION_MS) {
            console.warn(`[CF] Room ${roomId}: Suspicious fast game ` +
                `(${(gameDurationMs / 1000).toFixed(1)}s < ${MIN_GAME_DURATION_MS / 1000}s). ` +
                `Rating update SKIPPED.`);
            return; // Do NOT update ratings — flag already set, so this won't re-trigger
        }
    }
    else {
        // gameStartTime missing — legacy room or tampering. Skip rating for safety.
        console.warn(`[CF] Room ${roomId}: gameStartTime missing or invalid (${gameStartTime}). ` +
            `Rating update SKIPPED for safety.`);
        return;
    }
    // ----------------------------------------------------------------
    // Step 5: Fetch current ratings from Firestore
    // ----------------------------------------------------------------
    const firestore = (0, firestore_1.getFirestore)();
    const [winnerDoc, loserDoc] = await Promise.all([
        firestore.doc(`users/${after.winner}`).get(),
        firestore.doc(`users/${after.loser}`).get(),
    ]);
    const winnerCurrentRating = (winnerDoc.exists && typeof winnerDoc.data()?.rating === "number")
        ? winnerDoc.data().rating
        : DEFAULT_RATING;
    const loserCurrentRating = (loserDoc.exists && typeof loserDoc.data()?.rating === "number")
        ? loserDoc.data().rating
        : DEFAULT_RATING;
    // ----------------------------------------------------------------
    // Step 6: Calculate ELO deltas
    // ----------------------------------------------------------------
    const delta = calculateEloDelta(winnerCurrentRating, loserCurrentRating);
    const newWinnerRating = winnerCurrentRating + delta;
    const newLoserRating = Math.max(0, loserCurrentRating - delta); // Floor at 0
    console.log(`[CF] Room ${roomId}: ELO update — ` +
        `Winner(${after.winner}) ${winnerCurrentRating} → ${newWinnerRating} (+${delta}), ` +
        `Loser(${after.loser}) ${loserCurrentRating} → ${newLoserRating} (-${delta})`);
    // ----------------------------------------------------------------
    // Step 7: Atomic Firestore batch write
    // ----------------------------------------------------------------
    const batch = firestore.batch();
    const now = Date.now();
    batch.set(firestore.doc(`users/${after.winner}`), {
        rating: newWinnerRating,
        updatedAt: now,
    }, { merge: true });
    batch.set(firestore.doc(`users/${after.loser}`), {
        rating: newLoserRating,
        updatedAt: now,
    }, { merge: true });
    await batch.commit();
    console.log(`[CF] Room ${roomId}: Rating update committed successfully.`);
});
//# sourceMappingURL=index.js.map