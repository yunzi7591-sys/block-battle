/**
 * pvpConnection.ts — Room creation, joining, and matchmaking logic
 */

import { useUserStore } from '../userStore';
import { useGameStore } from '../gameStore';
import { LobbyService, PlayerInfo, RoomData } from '../../services/LobbyService';
import { createBoard } from '../../game/board';
import { handleRoomSync, handleGameCompletion } from './pvpListenerSync';
import { PvPSet, PvPGet } from './pvpTypes';

/**
 * Sets up a Firebase room listener with sync logic.
 * Used by both createRoom (Host) and joinRoom (Guest).
 */
function setupRoomListener(
    roomId: string,
    isGuest: boolean,
    set: PvPSet,
    get: PvPGet
) {
    // 既存リスナーを確実に解除（二重登録防止）
    const prev = get();
    if (prev._unsubscribeRoom) {
        prev._unsubscribeRoom();
        set({ _unsubscribeRoom: null, _subscribedRoomId: null });
    }

    const unsub = LobbyService.subscribeToRoom(roomId, (roomData: RoomData) => {
        set({
            player1: roomData.player1,
            player2: roomData.player2 || null,
            isRanked: !!roomData.isRanked
        });
        const state = get();
        const user = useUserStore.getState();

        // Host: Handle Guest Join & Start Game
        if (!isGuest && roomData.status === 'waiting' && roomData.player2 && !state.matchingLocked) {
            console.log(`[Store] Guest ${roomData.player2.uid} detected. Host starting game...`);
            LobbyService.startGame(roomId);
            set({
                isMatching: false,
                matchingLocked: true,
                opponentRating: roomData.player2.rate,
                status: 'playing'
            });
        }

        // Sync shared state
        if (roomData.status === 'playing' || roomData.status === 'finished') {
            handleRoomSync(set, get, roomData, user);
        }

        // Handle game completion
        const finishedField = isGuest ? roomData.isFinished : (roomData.status === 'finished');
        if (finishedField && roomData.winner && !state.isGameOver) {
            handleGameCompletion(set, get, roomData, user);
        }
    });

    const timeUnsub = LobbyService.getServerTimeOffset((offset) => set({ serverTimeOffset: offset }));
    set({
        _unsubscribeRoom: () => { unsub(); timeUnsub(); },
        _subscribedRoomId: roomId
    });
}

export function createCreateRoom(set: PvPSet, get: PvPGet) {
    return async (isPrivate: boolean = true, isRanked: boolean = false) => {
        const user = useUserStore.getState();
        const playerInfo: PlayerInfo = {
            uid: user.uid!,
            name: user.userName,
            rate: user.rating,
        };

        const id = await LobbyService.createRoom(playerInfo, isPrivate, isRanked);
        set({ roomId: id, isHost: true, myPlayerNumber: 1, status: 'matching', isRanked, rating: user.rating });

        const state = get();
        if (state._subscribedRoomId === id) return;
        if (state._unsubscribeRoom) state._unsubscribeRoom();

        setupRoomListener(id, false, set, get);
    };
}

export function createJoinRoom(set: PvPSet, get: PvPGet) {
    return async (id: string): Promise<boolean> => {
        set({ matchingLocked: true, isMatching: true });
        const user = useUserStore.getState();
        const playerInfo: PlayerInfo = {
            uid: user.uid!,
            name: user.userName,
            rate: user.rating,
        };

        const success = await LobbyService.joinRoom(id, playerInfo);
        if (success) {
            set({ roomId: id, isHost: false, myPlayerNumber: 2, isMatching: false, status: 'matching', rating: user.rating });

            const state = get();
            if (state._subscribedRoomId === id) return true;
            if (state._unsubscribeRoom) state._unsubscribeRoom();

            setupRoomListener(id, true, set, get);
            return true;
        } else {
            console.warn(`[Store] joinRoom failed: Transaction not committed.`);
            set({ matchingLocked: false, isMatching: false });
            return false;
        }
    };
}

export function createStartAutoMatch(set: PvPSet, get: PvPGet) {
    return async () => {
        const myUid = useUserStore.getState().uid;
        console.log(`[Store] startAutoMatch initiated. My UID: ${myUid}`);

        set({ isMatching: true, matchingLocked: false, roomId: null, isRanked: true, rating: useUserStore.getState().rating });

        const existingRoomId = await LobbyService.findPublicRoom();
        if (existingRoomId) {
            const success = await get().joinRoom(existingRoomId);
            if (!success) {
                console.log(`[Store] joinRoom failed. Waiting 3s before allowing retry...`);
                await new Promise(resolve => setTimeout(resolve, 3000));
                set({ isMatching: false });
            }
        } else {
            await get().createRoom(false, true);
        }
    };
}

export function createCancelAutoMatch(set: PvPSet, get: PvPGet) {
    return async () => {
        const state = get();
        if (state.matchingLocked || state.status === 'playing') {
            console.log("[Store] cancelAutoMatch blocked: Game already in progress.");
            return;
        }
        if (state.roomId) await LobbyService.cancelRoom(state.roomId);
        if (state._unsubscribeRoom) {
            state._unsubscribeRoom();
            set({ _unsubscribeRoom: null, _subscribedRoomId: null });
        }
        set({ isMatching: false, roomId: null, status: 'matching', isHost: false });
    };
}

export function createReset(set: PvPSet, get: PvPGet) {
    return () => {
        const state = get();
        if (state.status === 'playing') {
            console.log("[Store] reset blocked: Keeping active PvP session.");
            return;
        }
        if (state._unsubscribeRoom) state._unsubscribeRoom();

        // gameStoreの盤面・ブロックを初期化（前回の残骸を確実にクリア）
        const gameStore = useGameStore.getState();
        gameStore.init();

        set({
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
            ratingChange: null,
            isRanked: false,
            _unsubscribeRoom: null,
            _subscribedRoomId: null,
            currentTurn: null,
            placedCount: 0,
            turnNumber: 1,
            turnStartTime: null,
            turnDuration: 30000,
            serverTimeOffset: 0,
            lastMove: null,
            opponentRating: 1500,
            ratingApplied: false,
            pendingMoveCount: 0,
            isProcessingPlacement: false,
            lastOptimisticMoveTime: 0,
            lastTimeoutReportTime: 0,
        });
    };
}
