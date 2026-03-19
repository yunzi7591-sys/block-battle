/**
 * adService.ts — ATT + UMP (GDPR) + MobileAds 初期化サービス
 *
 * アプリ起動時に1回だけ呼ぶ。
 * 1. ATT (App Tracking Transparency) ダイアログを表示
 * 2. UMP (User Messaging Platform) で GDPR 同意フォームを処理
 * 3. MobileAds SDK を初期化
 *
 * Expo Go 環境ではネイティブモジュールが存在しないため全処理をスキップ。
 */

import { Platform, TurboModuleRegistry } from 'react-native';

let _initialized = false;

/**
 * ネイティブモジュールの存在を安全にチェック。
 * require()するとTurboModuleが即座に呼ばれてERRORになるので、
 * 先にレジストリで存在確認する。
 */
function isNativeModuleAvailable(moduleName: string): boolean {
    try {
        return TurboModuleRegistry.get(moduleName) !== null;
    } catch {
        return false;
    }
}

const _adsNativeAvailable = isNativeModuleAvailable('RNGoogleMobileAdsModule');

export async function initializeAds(): Promise<void> {
    if (_initialized) return;
    _initialized = true;

    // ─── 1. ATT (iOS only) ──────────────────────────────
    if (Platform.OS === 'ios') {
        try {
            const { requestTrackingPermissionsAsync } = require('expo-tracking-transparency');
            const { status } = await requestTrackingPermissionsAsync();
            console.log(`[Ad/ATT] Tracking permission status: ${status}`);
        } catch (e) {
            console.warn('[Ad/ATT] expo-tracking-transparency not available.');
        }
    }

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
