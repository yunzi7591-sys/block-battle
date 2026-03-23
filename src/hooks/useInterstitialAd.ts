/**
 * useInterstitialAd.ts — インタースティシャル広告フック
 *
 * シングルプレイのゲームオーバー → やり直し時に全画面広告を表示。
 * 広告の読み込み失敗・タイムアウト時はスキップして即リスタート。
 *
 * Expo Go（ネイティブモジュール未登録）環境ではno-opとして動作。
 */

import { useCallback, useEffect, useRef } from 'react';
import { TurboModuleRegistry } from 'react-native';

// ─── ネイティブモジュール存在チェック ──────────────────
// TurboModuleRegistryで先に確認し、存在しない場合はrequire()自体を回避。
// これによりExpo GoでのERRORログを完全に防止する。
let InterstitialAd: any = null;
let AdEventType: any = null;
let TestIds: any = null;
let _adsAvailable = false;

try {
    const nativeModule = TurboModuleRegistry.get('RNGoogleMobileAdsModule');
    if (nativeModule) {
        const mobileAds = require('react-native-google-mobile-ads');
        InterstitialAd = mobileAds.InterstitialAd;
        AdEventType = mobileAds.AdEventType;
        TestIds = mobileAds.TestIds;
        _adsAvailable = true;
    } else {
        console.log('[Ad] Native ads module not found (Expo Go). Ads disabled.');
    }
} catch (e) {
    console.warn('[Ad] react-native-google-mobile-ads not available:', e);
}

// ★ 本番ユニットID
const AD_UNIT_ID = _adsAvailable
    ? (__DEV__ ? TestIds.INTERSTITIAL : 'ca-app-pub-2999547425860349/4526181015')
    : '';

// 広告表示の最小間隔 — 連続表示を防止
const MIN_INTERVAL_MS = 60 * 1000; // 60秒
// N回プレイごとに広告を表示（インターバル + 回数の両方を満たす場合のみ）
const GAMES_PER_AD = 3;
// モジュールレベルのプレイカウンター（フック再マウントでも維持）
let _globalGameCount = 0;

export function useInterstitialAd() {
    const adRef = useRef<any>(null);
    const isLoadedRef = useRef(false);
    const lastShownRef = useRef(0);
    const pendingCallbackRef = useRef<(() => void) | null>(null);

    // 広告インスタンスを生成 & ロード
    const loadAd = useCallback(() => {
        if (!_adsAvailable) return () => {};
        isLoadedRef.current = false;

        try {
            const ad = InterstitialAd.createForAdRequest(AD_UNIT_ID, {
                requestNonPersonalizedAdsOnly: true,
            });

            const unsubLoaded = ad.addAdEventListener(AdEventType.LOADED, () => {
                isLoadedRef.current = true;
                console.log('[Ad] Interstitial loaded.');
            });

            const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
                console.log('[Ad] Interstitial closed.');
                isLoadedRef.current = false;

                // 閉じた後にコールバック実行（リスタート等）
                const cb = pendingCallbackRef.current;
                pendingCallbackRef.current = null;
                if (cb) cb();

                // 次の広告を先読み
                loadAd();
            });

            const unsubError = ad.addAdEventListener(AdEventType.ERROR, (error: any) => {
                console.warn('[Ad] Interstitial load error:', error);
                isLoadedRef.current = false;

                // エラー時もコールバック実行（広告なしでリスタート）
                const cb = pendingCallbackRef.current;
                pendingCallbackRef.current = null;
                if (cb) cb();
            });

            ad.load();
            adRef.current = ad;

            return () => {
                unsubLoaded();
                unsubClosed();
                unsubError();
            };
        } catch (e) {
            console.warn('[Ad] Failed to create interstitial:', e);
            return () => {};
        }
    }, []);

    // マウント時に先読み開始
    useEffect(() => {
        const cleanup = loadAd();
        return cleanup;
    }, [loadAd]);

    /**
     * 広告を表示してからコールバックを実行する。
     * 広告未ロード / 間隔制限中 / ネイティブ未対応時はスキップして即コールバック。
     */
    /**
     * 広告を表示してからコールバックを実行する。
     * プレイ回数 + 最小間隔の両方を満たす場合のみ広告を表示。
     * force=true で回数カウントをスキップ（PvP敗北時など）。
     */
    const showAdThen = useCallback((callback: () => void, force: boolean = false) => {
        _globalGameCount++;

        if (!_adsAvailable) {
            callback();
            return;
        }

        const now = Date.now();
        const elapsed = now - lastShownRef.current;
        const intervalOk = elapsed >= MIN_INTERVAL_MS;
        const countOk = force || (_globalGameCount % GAMES_PER_AD === 0);

        if (!isLoadedRef.current || !adRef.current || !intervalOk || !countOk) {
            callback();
            return;
        }

        // コールバックを保存して広告表示
        pendingCallbackRef.current = callback;
        lastShownRef.current = now;

        try {
            adRef.current.show();
        } catch (e) {
            console.warn('[Ad] Failed to show interstitial:', e);
            pendingCallbackRef.current = null;
            callback();
        }
    }, []);

    return { showAdThen };
}
