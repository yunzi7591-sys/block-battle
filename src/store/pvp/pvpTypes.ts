/**
 * pvpTypes.ts — Shared type definitions for PvP store modules
 */
import { Board, BlockShape } from '../../game/types';
import { PlayerInfo } from '../../services/LobbyService';

export type PvPSet = (partial: Partial<OnlinePvPState> | ((state: OnlinePvPState) => Partial<OnlinePvPState>)) => void;
export type PvPGet = () => OnlinePvPState;

export interface OnlinePvPState {
    roomId: string | null;
    isHost: boolean;
    sharedBoard: Board;
    myPlayerNumber: number;
    currentBlocks: (BlockShape | null)[];
    timeLeft: number;
    isGameOver: boolean;
    winner: string | null;
    status: 'matching' | 'playing' | 'finished';
    isMatching: boolean;
    matchingLocked: boolean;
    boardLayout: { x: number; y: number; size: number; cellSize: number } | null;
    preview: { shape: BlockShape; row: number; col: number } | null;
    player1: PlayerInfo | null;
    player2: PlayerInfo | null;

    // Turn-based & Sync
    currentTurn: string | null;
    placedCount: number;
    turnNumber: number;
    turnStartTime: number | null;
    turnDuration: number;
    serverTimeOffset: number;
    lastMove: { row: number; col: number; uid: string } | null;
    pendingMoveCount: number;

    // Rating & Elo
    rating: number;
    opponentRating: number;
    ratingChange: number | null;
    isRanked: boolean;
    lastOptimisticMoveTime: number;

    // Actions
    createRoom: (isPrivate?: boolean, isRanked?: boolean) => void;
    joinRoom: (id: string) => Promise<boolean>;
    startAutoMatch: () => void;
    cancelAutoMatch: () => void;
    placeBlockSync: (index: number, row: number, col: number) => void;
    tickTimer: () => void;
    setBoardLayout: (layout: any) => void;
    setPreview: (preview: any) => void;
    reset: () => void;
    handleDisconnect: () => void;
    calculateRatingChange: (win: boolean) => number;
    reportDefeat: () => void;
    forceResync: () => void;

    // Internal
    _unsubscribeRoom: (() => void) | null;
    _subscribedRoomId: string | null;
    isProcessingPlacement: boolean;
    lastTimeoutReportTime: number;
    ratingApplied: boolean;
}
