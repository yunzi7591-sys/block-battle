/**
 * pvpConnection.ts — Room creation, joining, matchmaking logic + AI fallback
 */

import { useUserStore } from '../userStore';
import { useGameStore } from '../gameStore';
import { LobbyService, PlayerInfo, RoomData } from '../../services/LobbyService';
import { createBoard } from '../../game/board';
import { generatePvPBlocks } from '../../game/survivalAlgorithm';
import { handleRoomSync, handleGameCompletion } from './pvpListenerSync';
import { PvPSet, PvPGet } from './pvpTypes';
import { getRandomAIName } from '../../utils/randomNames';
import { ref, onValue } from 'firebase/database';
import { rtdb } from '../../config/firebase';

// ─── AI Match Timer (module-level) ──────────────────────
let _aiMatchTimerId: ReturnType<typeof setTimeout> | null = null;

// ─── Firebase 接続監視 ─────────────────────────────────
let _connectionUnsub: (() => void) | null = null;
let _wasDisconnected = false;

/**
 * Firebase RTDB接続状態を監視。
 * 切断→復帰時に forceResync を自動発火してステートを再同期。
 */
function startConnectionMonitor(get: PvPGet) {
    if (_connectionUnsub) return; // 既に監視中
    const connRef = ref(rtdb, '.info/connected');
    const unsub = onValue(connRef, (snap) => {
        const connected = snap.val() === true;
        if (!connected) {
            _wasDisconnected = true;
            return;
        }
        // 復帰時: アクティブなPvP対戦中なら自動resync
        if (_wasDisconnected) {
            _wasDisconnected = false;
            const state = get();
            if (state.status === 'playing' && !state.isGameOver && !state.isAIMatch) {
                console.log('[Connection] Network restored during PvP. Force resyncing...');
                state.forceResync();
            }
        }
    });
    _connectionUnsub = () => unsub();
}

function stopConnectionMonitor() {
    if (_connectionUnsub) { _connectionUnsub(); _connectionUnsub = null; }
    _wasDisconnected = false;
}

export function clearAIMatchTimer() {
    if (_aiMatchTimerId !== null) {
        clearTimeout(_aiMatchTimerId);
        _aiMatchTimerId = null;
    }
}

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

    // ★ 接続監視を開始（切断→復帰時にforceResyncが自動発火）
    startConnectionMonitor(get);

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

            // ★ 対人マッチ成立 → AIタイマー解除
            clearAIMatchTimer();

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
            // 対人マッチ成立 → AIタイマー解除
            clearAIMatchTimer();

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

        // AIタイマーをクリア（再マッチング時の二重起動防止）
        clearAIMatchTimer();

        set({ isMatching: true, matchingLocked: false, roomId: null, isRanked: true, isAIMatch: false, aiUid: null, rating: useUserStore.getState().rating });

        // ★ 最大2回リトライ（ゾンビルーム回避）
        for (let attempt = 0; attempt < 2; attempt++) {
            const existingRoomId = await LobbyService.findPublicRoom();
            if (!existingRoomId) break;

            const success = await get().joinRoom(existingRoomId);
            if (success) {
                return; // 対人マッチ成立 → AIタイマー不要
            }
            // join失敗 → isMatchingを復元してリトライ or ルーム作成に移行
            console.log(`[Store] joinRoom failed (attempt ${attempt + 1}). Retrying...`);
            set({ isMatching: true, matchingLocked: false });
        }

        // 公開ルーム未発見 → ルーム作成して待機
        await get().createRoom(false, true);

        // ★ 10〜15秒のランダムタイミングでAIフォールバック開始（UIは30秒カウントダウン）
        const aiDelay = 10000 + Math.random() * 5000; // 10〜15秒
        _aiMatchTimerId = setTimeout(() => {
            _aiMatchTimerId = null;
            const state = get();
            // マッチング中 & まだ対戦開始していない & 対人マッチ未成立
            if (state.status !== 'playing' && !state.matchingLocked && !state.isAIMatch) {
                console.log(`[AI/Fallback] ${Math.round(aiDelay / 1000)}s elapsed. No opponent found. Switching to AI match...`);
                startAIMatch(set, get);
            }
        }, aiDelay);
    };
}

/**
 * AIマッチを開始する。
 * 既存Firebaseルームを閉じ、ローカルAI対戦をセットアップ。
 */
async function startAIMatch(set: PvPSet, get: PvPGet) {
    const state = get();
    const user = useUserStore.getState();

    // 1. 既存Firebaseルームをキャンセル
    if (state.roomId) {
        try {
            await LobbyService.cancelRoom(state.roomId);
        } catch (e) {
            console.warn('[AI/Setup] cancelRoom failed (may already be cleaned up):', e);
        }
    }
    if (state._unsubscribeRoom) {
        state._unsubscribeRoom();
    }

    // 2. AI対戦相手を生成
    const aiUid = '__AI_PLAYER__';
    const aiName = getRandomAIName();
    const aiRating = Math.max(100, user.rating + Math.floor(Math.random() * 61) - 30); // ±30

    // 3. 初期ゲーム状態を生成
    const initialBoard = createBoard();
    const initialBlocks = generatePvPBlocks(initialBoard, 1);

    // 4. gameStoreを初期化
    const gameStore = useGameStore.getState();
    gameStore.setPvPMode(true);
    gameStore.setBoard(initialBoard);
    gameStore.setBlocks(initialBlocks);
    gameStore.setIsMyTurn(true);

    // 5. 1〜2秒のフェイクディレイ（人間マッチ演出）
    const fakeDelay = 1000 + Math.random() * 1000;
    await new Promise(resolve => setTimeout(resolve, fakeDelay));

    // ディレイ中にキャンセル or 対人マッチ成立の確認
    const currentState = get();
    if (currentState.matchingLocked || currentState.status === 'playing' || currentState.isAIMatch ||
        (!currentState.isMatching && currentState.status !== 'matching')) {
        console.log('[AI/Setup] Cancelled or matched during fake delay. Aborting AI match.');
        return;
    }

    // 6. "MATCH FOUND!" を発火 → LobbyScreenのカウントダウン開始
    set({
        isAIMatch: true,
        aiUid,
        roomId: `AI_${Date.now()}`,
        isHost: true,
        myPlayerNumber: 1,
        isMatching: true, // オーバーレイ維持（カウントダウンへのフラッシュ防止）
        matchingLocked: true,
        status: 'playing',
        isRanked: true,
        sharedBoard: initialBoard,
        currentBlocks: initialBlocks,
        currentTurn: user.uid!,
        turnStartTime: Date.now(),
        turnDuration: 30000,
        timeLeft: 30,
        placedCount: 0,
        turnNumber: 1,
        isGameOver: false,
        winner: null,
        player1: { uid: user.uid!, name: user.userName, rate: user.rating },
        player2: { uid: aiUid, name: aiName, rate: aiRating },
        opponentRating: aiRating,
        pendingMoveCount: 0,
        isProcessingPlacement: false,
        _unsubscribeRoom: null,
        _subscribedRoomId: null,
        serverTimeOffset: 0,
        ratingApplied: false,
        ratingChange: null,
    });

    console.log(`[AI/Setup] AI match started. Opponent: ${aiName} (Rate: ${aiRating})`);
}

export function createCancelAutoMatch(set: PvPSet, get: PvPGet) {
    return async () => {
        // ★ AIタイマー解除
        clearAIMatchTimer();

        const state = get();
        if (state.matchingLocked || state.status === 'playing') {
            console.log("[Store] cancelAutoMatch blocked: Game already in progress.");
            return;
        }
        if (state.roomId && !state.isAIMatch) {
            await LobbyService.cancelRoom(state.roomId);
        }
        if (state._unsubscribeRoom) {
            state._unsubscribeRoom();
            set({ _unsubscribeRoom: null, _subscribedRoomId: null });
        }
        set({ isMatching: false, roomId: null, status: 'matching', isHost: false, isAIMatch: false, aiUid: null });
    };
}

export function createReset(set: PvPSet, get: PvPGet) {
    return () => {
        // ★ AIタイマー解除 + 接続監視停止
        clearAIMatchTimer();
        stopConnectionMonitor();

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
            // ★ AI state reset
            isAIMatch: false,
            aiUid: null,
        });
    };
}
