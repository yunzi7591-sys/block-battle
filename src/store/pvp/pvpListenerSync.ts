/**
 * pvpListenerSync.ts — Firebase room data synchronization logic
 */
import { BlockShape } from '../../game/types';
import { hasAnyValidPlacement } from '../../game/board';
import { RoomData, normalizeBlocks, normalizeBoard } from '../../services/LobbyService';
import { useGameStore } from '../gameStore';
import { useUserStore } from '../userStore';
import { PvPSet, PvPGet } from './pvpTypes';

/**
 * Core room data synchronization handler.
 * Called by both Host and Guest listeners when room data changes.
 */
export function handleRoomSync(
    set: PvPSet,
    get: PvPGet,
    roomData: RoomData,
    user: { uid: string | null }
) {
    const state = get();
    const gameStore = useGameStore.getState();

    // Ensure PvP mode is set in gameStore
    if (!gameStore.isPvP) gameStore.setPvPMode(true);

    const serverMoveCount = roomData.placedCount || 0;
    const serverBoard = normalizeBoard(roomData.board);
    const serverBlocks = normalizeBlocks(roomData.currentBlocks);

    const currentUid = (user.uid || "").trim();
    const serverTurnUid = (roomData.currentTurn || "").trim();

    // Guard against partial room updates
    if (!serverTurnUid && roomData.status === 'playing') {
        console.log("[PvP/Guard] Skipping sync due to empty serverTurnUid in playing room.");
        return;
    }

    const isMyTurn = currentUid === serverTurnUid;

    // Robust Turn Change Detection (初回同期 null→uid も含む)
    const prevTurnUid = state.currentTurn;
    const isFirstSync = prevTurnUid === null && serverTurnUid !== '';
    const turnChanged = isFirstSync || (prevTurnUid !== null && prevTurnUid !== serverTurnUid);

    if (turnChanged) {
        console.log(`[PvP/Turn] Turn transition detected: ${prevTurnUid} -> ${serverTurnUid}`);
        set({
            pendingMoveCount: 0,
            isProcessingPlacement: false,
            lastOptimisticMoveTime: 0,
        });
        gameStore.resetTurnState(serverBlocks);
    }

    // Push Turn status to gameStore
    gameStore.setIsMyTurn(isMyTurn);

    // Turn-Transition-Aware Guard
    const isFreshTurn = serverMoveCount === 0 && serverBlocks.every(b => b !== null);
    const localPlacedCount = gameStore.placedFlags.filter(f => f).length;
    const isActivelyPlaying = isMyTurn &&
        (state.isProcessingPlacement || localPlacedCount > serverMoveCount);

    let shouldSyncData = false;

    if (turnChanged) {
        shouldSyncData = true;
    } else if (isFreshTurn) {
        shouldSyncData = !isActivelyPlaying;
        if (isActivelyPlaying) {
            console.log("[PvP/Guard] Sync suppressed during Fresh Turn: Local move already in progress.");
        }
    } else if (!isMyTurn) {
        shouldSyncData = true;
    } else if (isActivelyPlaying) {
        shouldSyncData = false;
        console.log("[PvP/Guard] Active placement detected. Ignoring server echo.");
    } else {
        shouldSyncData = true;
    }

    // Force sync if server is significantly ahead (Safety Rollback)
    if (isMyTurn && serverMoveCount > state.pendingMoveCount + 1) {
        shouldSyncData = true;
        console.warn("[PvP/Sync] Server move count significantly ahead. Forcing sync.");
    }

    // Sync board and blocks
    const incomingBlocks = serverBlocks;
    const incomingCount = incomingBlocks.filter(b => b !== null).length;

    if (shouldSyncData && incomingCount > 0 && incomingCount <= 3) {
        // ★ クリアアニメーション中はgameStoreへの書き込みを遅延
        const applySyncToGameStore = () => {
            gameStore.setBoard(serverBoard);
            if (incomingBlocks.length === 3) {
                gameStore.setBlocks(incomingBlocks as BlockShape[]);
            }
        };

        if (gameStore.clearingCells && gameStore.clearingCells.length > 0) {
            console.log("[PvP/Sync] Clearing animation active. Deferring gameStore sync.");
            setTimeout(applySyncToGameStore, 150);
        } else {
            applySyncToGameStore();
        }

        const syncUpdate: any = {
            sharedBoard: serverBoard,
            currentBlocks: incomingBlocks,
            pendingMoveCount: serverMoveCount,
        };
        if (get().pendingMoveCount === 0) {
            syncUpdate.lastOptimisticMoveTime = 0;
        }
        set(syncUpdate);
        console.log(`[PvP/Sync] Store synced with Server (Count: ${incomingCount}, Turn: ${serverTurnUid}, Fresh: ${isFreshTurn})`);
    }

    // Always trust server status (map 'waiting' → 'matching' for local state)
    const mappedStatus = roomData.status === 'waiting' ? 'matching' as const : roomData.status;
    set({
        currentTurn: serverTurnUid,
        placedCount: serverMoveCount,
        turnStartTime: roomData.turnStartTime || null,
        status: mappedStatus,
        lastMove: roomData.lastMove
            ? { row: roomData.lastMove.row, col: roomData.lastMove.col, uid: roomData.lastMove.uid }
            : null,
    });

    // Set opponent rating from player1 if guest
    if (!state.isHost && roomData.player1) {
        set({ opponentRating: roomData.player1.rate });
    }

    // Check for local defeat (stuck detection)
    if (isMyTurn && !state.isGameOver && roomData.status === 'playing') {
        const usableBlocks = serverBlocks.filter(b => b !== null) as BlockShape[];
        const canMove = usableBlocks.some(b => hasAnyValidPlacement(serverBoard, b));
        if (!canMove && usableBlocks.length > 0) {
            console.log("[Store] Stuck detected. Reporting defeat...");
            get().reportDefeat();
        }
    }
}

/**
 * Handle game completion (winner determined by server).
 */
export function handleGameCompletion(
    set: PvPSet,
    get: PvPGet,
    roomData: RoomData,
    user: { uid: string | null }
) {
    const state = get();
    const isWin = roomData.winner === user.uid;
    const isRankedMatch = !!roomData.isRanked;

    let delta = 0;
    // 常にuserStoreから実レートを取得（PvPストアの初期値1500問題を回避）
    const currentRealRating = useUserStore.getState().rating;
    let newRating = currentRealRating;

    if (isRankedMatch && !state.ratingApplied) {
        // PvPストアのratingを実レートで上書きしてからElo計算
        set({ rating: currentRealRating });
        delta = state.calculateRatingChange(isWin);
        newRating = currentRealRating + delta;

        // Firebase永続化: userStore → syncProfile → Firestore
        useUserStore.getState().updateRating(newRating);
    }

    set({
        isGameOver: true,
        winner: roomData.winner!,
        status: 'finished',
        ratingChange: isRankedMatch ? delta : null,
        rating: newRating,
        isRanked: isRankedMatch,
        ratingApplied: isRankedMatch ? true : state.ratingApplied,
    });

    console.log(`[PvP/Rating] Game finished. Delta: ${delta}, New rating: ${newRating}, Persisted: ${isRankedMatch && !state.ratingApplied}`);
}
