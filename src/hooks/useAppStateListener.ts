/**
 * usePvPAppStateGuard
 *
 * Monitors AppState transitions for PvP games.
 * When the app goes to background during an active game:
 *   - Starts a grace-period timer (default 30s)
 *   - If the user returns within the grace period → timer is cancelled, nothing happens
 *   - If the grace period expires while still in background → fires onBackgroundTimeout
 *     (typically used to report defeat / timeout)
 *
 * When the app returns to foreground:
 *   - Fires onForegroundResume (typically used to re-sync state from server)
 */

import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

export function usePvPAppStateGuard(
    isPlaying: boolean,
    onBackgroundTimeout: () => void,
    onForegroundResume: () => void,
    gracePeriodMs: number = 30_000
) {
    const appStateRef = useRef<AppStateStatus>(AppState.currentState);
    const bgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Use refs for callbacks to avoid stale closures without re-subscribing
    const onTimeoutRef = useRef(onBackgroundTimeout);
    const onResumeRef = useRef(onForegroundResume);
    onTimeoutRef.current = onBackgroundTimeout;
    onResumeRef.current = onForegroundResume;

    useEffect(() => {
        if (!isPlaying) {
            // Not in an active game — clear any pending timer and skip
            if (bgTimerRef.current) {
                clearTimeout(bgTimerRef.current);
                bgTimerRef.current = null;
            }
            return;
        }

        const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
            const prevState = appStateRef.current;
            appStateRef.current = nextState;

            // Active → Background / Inactive
            if (prevState === 'active' && (nextState === 'background' || nextState === 'inactive')) {
                console.log(`[AppState] App moved to background. Starting ${gracePeriodMs / 1000}s grace timer.`);

                // Clear any existing timer (safety)
                if (bgTimerRef.current) {
                    clearTimeout(bgTimerRef.current);
                }

                bgTimerRef.current = setTimeout(() => {
                    bgTimerRef.current = null;
                    console.warn('[AppState] Grace period expired while in background. Triggering timeout.');
                    onTimeoutRef.current();
                }, gracePeriodMs);
            }

            // Background / Inactive → Active
            if ((prevState === 'background' || prevState === 'inactive') && nextState === 'active') {
                if (bgTimerRef.current) {
                    // Returned within grace period — cancel timer
                    clearTimeout(bgTimerRef.current);
                    bgTimerRef.current = null;
                    console.log('[AppState] Returned to foreground within grace period. Timer cancelled.');
                } else {
                    // Timer already fired or was never set
                    console.log('[AppState] Returned to foreground (grace period may have expired).');
                }
                onResumeRef.current();
            }
        });

        return () => {
            subscription.remove();
            if (bgTimerRef.current) {
                clearTimeout(bgTimerRef.current);
                bgTimerRef.current = null;
            }
        };
    }, [isPlaying, gracePeriodMs]);
}
