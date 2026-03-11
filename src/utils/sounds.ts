import { Audio } from 'expo-av';

let placeSound: Audio.Sound | null = null;
let clearSound: Audio.Sound | null = null;
let comboSound: Audio.Sound | null = null;
let errorSound: Audio.Sound | null = null;
let cheerSound: Audio.Sound | null = null;
let gongSound: Audio.Sound | null = null;
let bgmSound: Audio.Sound | null = null;
let decisionSound: Audio.Sound | null = null;
let bgmFadeTimer: ReturnType<typeof setInterval> | null = null;

// Debug info store
export let lastAudioError: string = 'None';
export let audioLoadStatus: { place: string, clear: string } = { place: 'Not Started', clear: 'Not Started' };

export async function initSounds() {
    try {
        console.log('[Audio] Initializing Audio Mode...');
        await Audio.setAudioModeAsync({
            playsInSilentModeIOS: true,
            staysActiveInBackground: true,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
        });
        console.log('[Audio] Audio mode configured (playsInSilentModeIOS: true)');

        // Parallel loading strategy
        audioLoadStatus.place = 'Loading...';
        audioLoadStatus.clear = 'Loading...';

        const loadPlace = async () => {
            try {
                const { sound, status } = await Audio.Sound.createAsync(
                    require('../../assets/sounds/place_glass.mp3'),
                    { shouldPlay: false, volume: 1.0 }
                );
                placeSound = sound;
                if (status.isLoaded) {
                    audioLoadStatus.place = 'OK (Embed)';
                    console.log('[Audio] place_glass.mp3 loaded successfully (Require)');
                }
            } catch (e: any) {
                audioLoadStatus.place = 'NG';
                const msg = e?.message || String(e);
                lastAudioError = `Place Load Fail: ${msg}`;
                console.error('[Audio] Failed to load place_glass:', e);
            }
        };

        const loadClear = async () => {
            try {
                const { sound, status } = await Audio.Sound.createAsync(
                    require('../../assets/sounds/clear_glass.mp3'),
                    { shouldPlay: false, volume: 1.0 }
                );
                clearSound = sound;
                if (status.isLoaded) {
                    audioLoadStatus.clear = 'OK (Embed)';
                    console.log('[Audio] clear_glass.mp3 loaded successfully (Require)');
                }
            } catch (e: any) {
                audioLoadStatus.clear = 'NG';
                const msg = e?.message || String(e);
                lastAudioError = `Clear Load Fail: ${msg}`;
                console.error('[Audio] Failed to load clear_glass:', e);
            }
        };

        const loadExtras = async () => {
            try {
                const { sound: cmbSound } = await Audio.Sound.createAsync(require('../../assets/combo.wav'));
                comboSound = cmbSound;
                const { sound: eSound } = await Audio.Sound.createAsync(require('../../assets/error.wav'));
                errorSound = eSound;
            } catch (e) {
                console.warn('[Audio] Failed to load extra wavs', e);
            }
        };

        const loadBGM = async () => {
            try {
                const { sound, status } = await Audio.Sound.createAsync(
                    require('../../assets/sounds/bgm_coast.mp3'),
                    { shouldPlay: false, isLooping: true, volume: 0 } // Start at 0 for fade-in
                );
                bgmSound = sound;
                if (status.isLoaded) {
                    console.log('[Audio] bgm_coast.mp3 loaded successfully (Require)');
                }
            } catch (e) {
                console.warn('[Audio] Failed to load BGM', e);
            }
        };

        const loadCheer = async () => {
            try {
                const { sound, status } = await Audio.Sound.createAsync(
                    require('../../assets/sounds/cheer_stadium.mp3'),
                    { shouldPlay: false, volume: 1.0 }
                );
                cheerSound = sound;
                if (status.isLoaded) {
                    console.log('[Audio] cheer_stadium.mp3 loaded successfully (Require)');
                }
            } catch (e) {
                console.warn('[Audio] Failed to load Cheer', e);
            }
        };

        const loadGong = async () => {
            try {
                const { sound, status } = await Audio.Sound.createAsync(
                    require('../../assets/sounds/gong.mp3'),
                    { shouldPlay: false, volume: 1.0 }
                );
                gongSound = sound;
                if (status.isLoaded) {
                    console.log('[Audio] gong.mp3 loaded successfully (Require)');
                }
            } catch (e) {
                console.warn('[Audio] Failed to load Gong', e);
            }
        };

        const loadDecision = async () => {
            try {
                const { sound } = await Audio.Sound.createAsync(
                    require('../../assets/sounds/place_glass.mp3'), // Placeholder for decision
                    { shouldPlay: false, volume: 1.0 }
                );
                decisionSound = sound;
            } catch (e) { console.warn('[Audio] Failed to load decision sound', e); }
        };

        // Run all concurrently
        await Promise.all([loadPlace(), loadClear(), loadExtras(), loadBGM(), loadCheer(), loadGong(), loadDecision()]);

        console.log('[Audio] Initialization complete');
    } catch (e: any) {
        lastAudioError = e?.message || String(e);
        console.error('[Audio] CRITICAL INIT ERROR:', e);
    }
}

export async function playPlaceSound() {
    if (!placeSound) return;
    try {
        const status = await placeSound.getStatusAsync();
        if (status.isLoaded) {
            await placeSound.setVolumeAsync(1.0);
            await placeSound.replayAsync().catch(() => { }); // Use replayAsync for rapid fire
        }
    } catch (e: any) {
        lastAudioError = e?.message || String(e);
        console.warn(`[Audio] playPlaceSound Suppressed: ${lastAudioError}`);
    }
}

export async function playClearSound(comboCount: number = 0) {
    if (!clearSound) return;
    try {
        const status = await clearSound.getStatusAsync();
        if (!status.isLoaded) return;

        const rate = Math.min(2.0, 1.0 + comboCount * 0.15);
        await clearSound.setVolumeAsync(1.0);
        await clearSound.setRateAsync(rate, false);
        await clearSound.replayAsync().catch(() => { });
    } catch (e: any) {
        lastAudioError = e?.message || String(e);
        console.warn(`[Audio] playClearSound Suppressed: ${lastAudioError}`);
    }
}

export async function playCheerSound() {
    if (!cheerSound) return;
    try {
        const status = await cheerSound.getStatusAsync();
        if (status.isLoaded) {
            await cheerSound.setVolumeAsync(1.0);
            await cheerSound.replayAsync().catch(() => { });
        }
    } catch (e: any) {
        lastAudioError = e?.message || String(e);
        console.warn(`[Audio] playCheerSound Suppressed: ${lastAudioError}`);
    }
}

export async function playGongSound() {
    if (bgmSound) {
        bgmSound.stopAsync().catch(() => { });
    }
    if (!gongSound) return;
    try {
        const status = await gongSound.getStatusAsync();
        if (status.isLoaded) {
            await gongSound.setVolumeAsync(1.0);
            await gongSound.replayAsync().catch(() => { });
        }
    } catch (e: any) {
        lastAudioError = e?.message || String(e);
        console.warn(`[Audio] playGongSound Suppressed: ${lastAudioError}`);
    }
}

export async function playBGM() {
    if (!bgmSound) return;
    try {
        const status = await bgmSound.getStatusAsync();
        if (!status.isLoaded || status.isPlaying) return;

        await bgmSound.setVolumeAsync(0);
        await bgmSound.playAsync();

        const targetVolume = 0.15;
        const duration = 2000;
        const steps = 15;
        const interval = duration / steps;
        const volumeStep = targetVolume / steps;

        let currentVolume = 0;
        if (bgmFadeTimer) clearInterval(bgmFadeTimer);
        bgmFadeTimer = setInterval(async () => {
            currentVolume += volumeStep;
            if (currentVolume >= targetVolume) {
                await bgmSound?.setVolumeAsync(targetVolume).catch(() => { });
                if (bgmFadeTimer) { clearInterval(bgmFadeTimer); bgmFadeTimer = null; }
            } else {
                await bgmSound?.setVolumeAsync(currentVolume).catch(() => { });
            }
        }, interval);
    } catch (e: any) {
        lastAudioError = e?.message || String(e);
        console.warn(`[Audio] playBGM Suppressed: ${lastAudioError}`);
    }
}

export async function stopBGM() {
    if (bgmFadeTimer) { clearInterval(bgmFadeTimer); bgmFadeTimer = null; }
    if (!bgmSound) return;
    try {
        const status = await bgmSound.getStatusAsync();
        if (status.isLoaded && status.isPlaying) {
            await bgmSound.stopAsync().catch(() => { });
        }
    } catch (e: any) {
        lastAudioError = e?.message || String(e);
        console.warn(`[Audio] stopBGM Suppressed: ${lastAudioError}`);
    }
}

export async function testEmergencySound() {
    try {
        await Audio.setAudioModeAsync({
            playsInSilentModeIOS: true,
            staysActiveInBackground: true,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
        });

        if (placeSound) {
            await placeSound.setVolumeAsync(1.0);
            await placeSound.replayAsync().catch(() => { });
        }
    } catch (e: any) {
        console.warn('[Audio] Emergency Test Suppressed:', e);
    }
}

export function playComboSound() { }

export function playErrorSound() {
    errorSound?.replayAsync().catch(() => { });
}

export async function playDecisionSound() {
    if (decisionSound) {
        await decisionSound.setVolumeAsync(1.0).catch(() => { });
        await decisionSound.replayAsync().catch(() => { });
    }
}
