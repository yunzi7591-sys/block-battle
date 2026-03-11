// Abstracted Multiplayer Service (Mock Version)
// This simulates network latency and CustomEventEmitter-based communication.

type Callback = (...args: any[]) => void;

class CustomEventEmitter {
    private listeners: { [event: string]: Callback[] } = {};

    on(event: string, callback: Callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    emit(event: string, ...args: any[]) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(...args));
        }
    }

    removeAllListeners(event: string) {
        if (this.listeners[event]) {
            delete this.listeners[event];
        }
    }
}

class MultiplayerService {
    private emitter = new CustomEventEmitter();
    private latency = 150; // simulated latency in ms
    private waitingRooms: { id: string, isPrivate: boolean }[] = [];

    private static instance: MultiplayerService;
    public static getInstance() {
        if (!MultiplayerService.instance) MultiplayerService.instance = new MultiplayerService();
        return MultiplayerService.instance;
    }

    createRoom(isPrivate: boolean = false): string {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();

        if (!isPrivate) {
            this.waitingRooms.push({ id: roomId, isPrivate: false });
        }

        console.log(`[Multiplayer] Room Created: ${roomId} (Private: ${isPrivate})`);
        return roomId;
    }

    joinRoom(roomId: string) {
        console.log(`[Multiplayer] Joining Room: ${roomId}`);
        // Remove from waiting list if someone joins
        this.waitingRooms = this.waitingRooms.filter(r => r.id !== roomId);
    }

    autoMatch(): { roomId: string, isHost: boolean } | null {
        // 1. Search for Public & Waiting rooms
        const publicRoom = this.waitingRooms.find(r => !r.isPrivate);

        if (publicRoom) {
            // 2. Found a room! Join as Guest
            const roomId = publicRoom.id;
            this.joinRoom(roomId);
            return { roomId, isHost: false };
        } else {
            // 3. No rooms available. Create as Host
            const roomId = this.createRoom(false); // Public
            return { roomId, isHost: true };
        }
    }

    cancelMatch(roomId: string) {
        console.log(`[Multiplayer] Cancelling Match / Cleaning Ghost Room: ${roomId}`);
        this.waitingRooms = this.waitingRooms.filter(r => r.id !== roomId);
    }

    // Per-hand action sync (send immediately)
    sendAction(roomId: string, action: any) {
        setTimeout(() => {
            this.emitter.emit(`room_action_${roomId}`, action);
        }, this.latency);
    }

    // Host-authority state broadcast (forced sync)
    broadcastState(roomId: string, state: any) {
        setTimeout(() => {
            this.emitter.emit(`room_state_${roomId}`, state);
        }, this.latency);
    }

    subscribeToActions(roomId: string, callback: (action: any) => void) {
        this.emitter.on(`room_action_${roomId}`, callback);
    }

    subscribeToState(roomId: string, callback: (state: any) => void) {
        this.emitter.on(`room_state_${roomId}`, callback);
    }

    onPlayerDisconnected(callback: () => void) {
        // Mock disconnect event (e.g. if one window is closed)
        this.emitter.on('disconnect_emergency', callback);
    }

    triggerEmergencyDisconnect() {
        this.emitter.emit('disconnect_emergency');
    }

    unsubscribeAll(roomId: string) {
        this.emitter.removeAllListeners(`room_action_${roomId}`);
        this.emitter.removeAllListeners(`room_state_${roomId}`);
    }
}

export const multiplayerService = MultiplayerService.getInstance();
