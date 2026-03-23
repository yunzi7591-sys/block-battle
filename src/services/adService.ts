/**
 * adService.ts — ATT + UMP (GDPR) + MobileAds 初期化サービス
 *
 * ATTダイアログはアプリUIが完全に表示された後に呼ぶ。
 * 1. ATT (App Tracking Transparency) ダイアログを表示
 * 2. UMP (User Messaging Platform) で GDPR 同意フォームを処理
 * 3. MobileAds SDK を初期化
 *
 * Expo Go 環境ではネイティブモジュールが存在しないため広告処理をスキップ。
 */

import { Platform, TurboModuleRegistry, AppState } from 'react-native';

let _initialized = false;

/**
 * ネイティブモジュールの存在を安全にチェック。
 */
function isNativeModuleAvailable(moduleName: string): boolean {
    try {
        return TurboModuleRegistry.get(moduleName) !== null;
    } catch {
        return false;
    }
}

const _adsNativeAvailable = isNativeModuleAvailable('RNGoogleMobileAdsModule');

/**
 * ATTダイアログを表示する。
 * アプリがアクティブ状態であることを確認し、少し待ってから表示。
 * iOS のみ。undetermined の場合のみダイアログを出す。
 */
async function requestATT(): Promise<void> {
    if (Platform.OS !== 'ios') return;

    try {
        const {
            requestTrackingPermissionsAsync,
            getTrackingPermissionsAsync,
        } = require('expo-tracking-transparency');

        // まず現在のステータスを確認
        const current = await getTrackingPermissionsAsync();
        console.log(`[Ad/ATT] Current tracking status: ${current.status}`);

        // undetermined の場合のみダイアログを表示
        if (current.status !== 'undetermined') {
            console.log(`[Ad/ATT] Already determined (${current.status}). Skipping dialog.`);
            return;
        }

        // ★ アプリが完全にアクティブになるのを待つ
        await waitForAppActive();

        // ★ UIが描画完了するまで少し待つ（Apple推奨）
        await new Promise(resolve => setTimeout(resolve, 1500));

        const { status } = await requestTrackingPermissionsAsync();
        console.log(`[Ad/ATT] Tracking permission result: ${status}`);
    } catch (e) {
        console.warn('[Ad/ATT] expo-tracking-transparency not available:', e);
    }
}

/**
 * AppState が 'active' になるまで待機するヘルパー。
 */
function waitForAppActive(): Promise<void> {
    return new Promise(resolve => {
        if (AppState.currentState === 'active') {
            resolve();
            return;
        }
        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') {
                subscription.remove();
                resolve();
            }
        });
        // 5秒でタイムアウト（万一activeにならない場合）
        setTimeout(() => {
            subscription.remove();
            resolve();
        }, 5000);
    });
}

/**
 * 広告初期化のエントリーポイント。
 * App.tsx から起動時に1回だけ呼ぶ。
 */
export async function initializeAds(): Promise<void> {
    if (_initialized) return;
    _initialized = true;

    // ─── 1. ATT (iOS only) ──────────────────────────────
    await requestATT();

    // Expo Go: ネイティブ広告モジュールなし → 以降スキップ
    if (!_adsNativeAvailable) {
        console.log('[Ad] Native ads module not available (Expo Go). Skipping UMP & SDK init.');
        return;
    }

    // ─── 2. UMP (GDPR Consent) ──────────────────────────
    try {
        const { AdsConsent, AdsConsentStatus } = require('react-native-google-mobile-ads');

        const consentInfo = await AdsConsent.requestInfoUpdate();
        console.log(`[Ad/UMP] Consent status: ${consentInfo.status}, formAvailable: ${consentInfo.isConsentFormAvailable}`);

        if (
            consentInfo.isConsentFormAvailable &&
            (consentInfo.status === AdsConsentStatus.REQUIRED ||
             consentInfo.status === AdsConsentStatus.UNKNOWN)
        ) {
            const result = await AdsConsent.showForm();
            console.log(`[Ad/UMP] Form result: ${result.status}`);
        }
    } catch (e) {
        console.warn('[Ad/UMP] Consent handling skipped:', e);
    }

    // ─── 3. MobileAds SDK 初期化 ────────────────────────
    try {
        const mobileAds = require('react-native-google-mobile-ads');
        const defaultModule = mobileAds.default;
        if (defaultModule && typeof defaultModule === 'function') {
            await defaultModule().initialize();
            console.log('[Ad/SDK] MobileAds initialized successfully.');
        }
    } catch (e) {
        console.warn('[Ad/SDK] MobileAds initialization skipped:', e);
    }
}
