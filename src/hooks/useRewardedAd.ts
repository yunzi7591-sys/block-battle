/**
 * useRewardedAd.ts — リワード広告フック
 *
 * ゲームオーバー時の「コンティニュー」機能で使用。
 * 広告視聴完了後にコールバックを実行する。
 * Expo Go環境ではno-opとして動作。
 */

import { useCallback, useEffect, useRef } from 'react';
import { TurboModuleRegistry } from 'react-native';

let RewardedAd: any = null;
let RewardedAdEventType: any = null;
let AdEventType: any = null;
let TestIds: any = null;
let _adsAvailable = false;

try {
    const nativeModule = TurboModuleRegistry.get('RNGoogleMobileAdsModule');
    if (nativeModule) {
        const mobileAds = require('react-native-google-mobile-ads');
        RewardedAd = mobileAds.RewardedAd;
        RewardedAdEventType = mobileAds.RewardedAdEventType;
        AdEventType = mobileAds.AdEventType;
        TestIds = mobileAds.TestIds;
        _adsAvailable = true;
    }
} catch (e) {
    // react-native-google-mobile-ads not available
}

// ★ 本番ユニットID（リワード広告）
const REWARDED_AD_UNIT_ID = _adsAvailable
    ? (__DEV__ ? TestIds.REWARDED : 'ca-app-pub-2999547425860349/1234567890')
    : '';

export function useRewardedAd() {
    const adRef = useRef<any>(null);
    const isLoadedRef = useRef(false);
    const pendingCallbackRef = useRef<(() => void) | null>(null);

    const loadAd = useCallback(() => {
        if (!_adsAvailable) return () => {};
        isLoadedRef.current = false;

        try {
            const ad = RewardedAd.createForAdRequest(REWARDED_AD_UNIT_ID, {
                requestNonPersonalizedAdsOnly: true,
            });

            const unsubLoaded = ad.addAdEventListener(AdEventType.LOADED, () => {
                isLoadedRef.current = true;
                console.log('[Ad] Rewarded ad loaded.');
            });

            const unsubEarned = ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
                console.log('[Ad] Reward earned!');
                const cb = pendingCallbackRef.current;
                pendingCallbackRef.current = null;
                if (cb) cb();
            });

            const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
                console.log('[Ad] Rewarded ad closed.');
                isLoadedRef.current = false;
                // If reward wasn't earned (user skipped), callback was already cleared or never set
                pendingCallbackRef.current = null;
                loadAd();
            });

            const unsubError = ad.addAdEventListener(AdEventType.ERROR, (error: any) => {
                console.warn('[Ad] Rewarded ad error:', error);
                isLoadedRef.current = false;
                pendingCallbackRef.current = null;
            });

            ad.load();
            adRef.current = ad;

            return () => {
                unsubLoaded();
                unsubEarned();
                unsubClosed();
                unsubError();
            };
        } catch (e) {
            console.warn('[Ad] Failed to create rewarded ad:', e);
            return () => {};
        }
    }, []);

    useEffect(() => {
        const cleanup = loadAd();
        return cleanup;
    }, [loadAd]);

    /**
     * リワード広告を表示する。
     * 広告視聴完了時にonRewardを実行。
     * 広告が利用不可の場合はfalseを返す（UIで「広告なし」と表示するため）。
     */
    const showRewardedAd = useCallback((onReward: () => void): boolean => {
        if (!_adsAvailable || !isLoadedRef.current || !adRef.current) {
            return false;
        }

        pendingCallbackRef.current = onReward;

        try {
            adRef.current.show();
            return true;
        } catch (e) {
            console.warn('[Ad] Failed to show rewarded ad:', e);
            pendingCallbackRef.current = null;
            return false;
        }
    }, []);

    return { showRewardedAd, isRewardedAdReady: () => _adsAvailable && isLoadedRef.current };
}
