# Block Battle 改善指示書

以下の6つの改善を順番に実装してください。各タスクの実装後、TypeScriptエラーがないことを確認してください。

---

## タスク1: ドラッグ中のブロックをスケールアップ + 半透明化

**ファイル:** `src/components/DraggableBlock.tsx`

**目的:** ドラッグ中にブロックが指で隠れる問題を改善。ドラッグ開始時にscale 1.15 + opacity 0.75にし、リリースで元に戻す。

**実装手順:**

1. コンポーネント内に新しいAnimated.Valueを2つ追加:
```typescript
const dragScaleAnim = useRef(new Animated.Value(1)).current;
const dragOpacityAnim = useRef(new Animated.Value(1)).current;
```

2. `onPanResponderGrant`（ドラッグ開始時）に以下を追加:
```typescript
Animated.parallel([
  Animated.spring(dragScaleAnim, {
    toValue: 1.15,
    useNativeDriver: true,
    friction: 8,
  }),
  Animated.timing(dragOpacityAnim, {
    toValue: 0.75,
    duration: 150,
    useNativeDriver: true,
  }),
]).start();
```

3. `onPanResponderRelease` と `onPanResponderTerminate`（ドラッグ終了時）に以下を追加:
```typescript
Animated.parallel([
  Animated.spring(dragScaleAnim, {
    toValue: 1,
    useNativeDriver: true,
    friction: 8,
  }),
  Animated.timing(dragOpacityAnim, {
    toValue: 1,
    duration: 150,
    useNativeDriver: true,
  }),
]).start();
```

4. ブロックのAnimated.Viewのstyleに`transform`と`opacity`を追加:
```typescript
{
  transform: [
    { translateX: pan.x },
    { translateY: pan.y },
    { scale: dragScaleAnim },  // 追加
  ],
  opacity: dragOpacityAnim,  // 追加
}
```

**注意:** 既存の`scaleAnim`（トレイでの表示用）とは別のアニメーション値を使うこと。既存のトレイ配置時のスケールアニメーションは壊さないこと。

---

## タスク2: スコア表示の弾むフィードバック強化

**ファイル:** `src/screens/GameScreen.tsx`

**目的:** スコア変更時にヘッダーのスコア数字が弾むアニメーションを強化し、加点量のフロートテキストを追加。

**実装手順:**

1. GameScreen.tsxにスコア変更時のアニメーションがすでに実装されている（scoreScale animated value, scale up 1.4x → 1.0）。これを以下に強化:
   - スケール: 1.0 → 1.5 → 1.0（spring、damping低め）
   - 色変化: 加点時に一瞬ゴールドに光る

2. 新しいstate追加:
```typescript
const [scoreDelta, setScoreDelta] = useState(0);
const deltaOpacity = useRef(new Animated.Value(0)).current;
const deltaTranslateY = useRef(new Animated.Value(0)).current;
```

3. スコア変更検知のuseEffect内で、前回スコアとの差分を計算してフロートアニメーション:
```typescript
useEffect(() => {
  if (score > prevScoreRef.current) {
    const delta = score - prevScoreRef.current;
    setScoreDelta(delta);
    deltaOpacity.setValue(1);
    deltaTranslateY.setValue(0);
    Animated.parallel([
      Animated.timing(deltaOpacity, { toValue: 0, duration: 800, useNativeDriver: true }),
      Animated.timing(deltaTranslateY, { toValue: -40, duration: 800, useNativeDriver: true }),
    ]).start();
  }
  prevScoreRef.current = score;
}, [score]);
```

4. スコア表示の隣に`+{delta}`のフロートテキストを追加:
```jsx
{scoreDelta > 0 && (
  <Animated.Text style={{
    position: 'absolute',
    top: -5,
    right: -45,
    color: '#FFD700',
    fontSize: 16,
    fontWeight: 'bold',
    opacity: deltaOpacity,
    transform: [{ translateY: deltaTranslateY }],
  }}>
    +{scoreDelta}
  </Animated.Text>
)}
```

---

## タスク3: 対戦相手のボードをリアルタイム小窓表示

**ファイル:**
- 新規: `src/components/OpponentBoardMini.tsx`
- 修正: `src/screens/GameScreen.tsx` (PvPモード時に小窓を表示)

**目的:** PvP対戦中に相手のボードを右上に小さく表示して「戦っている感」を出す。

**実装手順:**

### OpponentBoardMini.tsx（新規作成）

```typescript
import React, { memo } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { useOnlinePvPStore } from '../store/onlinePvPStore';
import { BOARD_SIZE } from '../constants';

const MINI_CELL_SIZE = 5; // 非常に小さいセル
const MINI_BOARD_SIZE = MINI_CELL_SIZE * BOARD_SIZE;

const OpponentBoardMini: React.FC = memo(() => {
  const sharedBoard = useOnlinePvPStore(s => s.sharedBoard);
  const opponentName = useOnlinePvPStore(s => {
    // 相手のプレイヤー名を取得
    const myUid = s.myUid;
    if (s.player1Uid === myUid) return s.player2Name || 'Opponent';
    return s.player1Name || 'Opponent';
  });

  if (!sharedBoard || sharedBoard.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{opponentName}</Text>
      <View style={styles.board}>
        {sharedBoard.map((row, r) =>
          row.map((cell, c) => (
            <View
              key={`${r}-${c}`}
              style={[
                styles.cell,
                {
                  top: r * MINI_CELL_SIZE,
                  left: c * MINI_CELL_SIZE,
                  backgroundColor: cell ? 'rgba(100, 200, 255, 0.7)' : 'rgba(255,255,255,0.05)',
                },
              ]}
            />
          ))
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    right: 10,
    alignItems: 'center',
    zIndex: 100,
  },
  label: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 9,
    marginBottom: 2,
  },
  board: {
    width: MINI_BOARD_SIZE,
    height: MINI_BOARD_SIZE,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  cell: {
    position: 'absolute',
    width: MINI_CELL_SIZE - 1,
    height: MINI_CELL_SIZE - 1,
    borderRadius: 1,
  },
});

export default OpponentBoardMini;
```

**注意:**
- `sharedBoard`の構造は`onlinePvPStore`にある。storeの実際のstateプロパティ名を確認してから使うこと
- 相手の名前プロパティも実際のstore定義に合わせること
- `BOARD_SIZE`が定数として存在するか確認。なければ数値（8や10など）をハードコードしてOK

### GameScreen.tsxへの追加

PvPモード時（`onlinePvPStore`の`status === 'playing'`の時）に`<OpponentBoardMini />`を表示:

```jsx
import OpponentBoardMini from '../components/OpponentBoardMini';
import { useOnlinePvPStore } from '../store/onlinePvPStore';

// GameScreen内のreturn JSX内に追加:
{pvpStatus === 'playing' && <OpponentBoardMini />}
```

- `pvpStatus`はonlinePvPStoreのstatusをsubscribeして取得
- すでにPvPの判定ロジックがあるならそれを流用

---

## タスク4: 広告表示タイミングの最適化

**ファイル:** `src/services/adService.ts` および関連する呼び出し元

**目的:** 広告のタイミングを最適化し、バナー広告とPvP後のインタースティシャルを追加。

**実装手順:**

### A. ソロモードの頻度制限（5回プレイごと）

adService.tsまたは広告を呼び出しているファイルに、プレイ回数カウンターを追加:

```typescript
let soloPlayCount = 0;

export function incrementSoloPlayCount() {
  soloPlayCount++;
}

export function shouldShowSoloAd(): boolean {
  return soloPlayCount > 0 && soloPlayCount % 5 === 0;
}
```

ゲームオーバー/リスタート時の広告表示を以下に変更:
```typescript
incrementSoloPlayCount();
if (shouldShowSoloAd()) {
  showInterstitialAd();
}
```

### B. PvP試合終了後にインタースティシャル広告

PvP試合終了時（GameOverOverlayが表示されるタイミング、またはリザルト画面を閉じるタイミング）にインタースティシャル広告を表示。ただし**勝利時は表示しない**（ポジティブ体験を壊さない）。敗北時のみ表示。

該当箇所（GameOverOverlayのPLAY AGAINボタンのonPress等）に:
```typescript
if (!isWin) {
  await showInterstitialAd();
}
```

### C. 最小表示間隔の強化

現在60秒間隔の制限があるなら、それは維持。加えて、セッション内で最大3回までの上限を追加:

```typescript
let sessionAdCount = 0;
const MAX_SESSION_ADS = 3;

export function canShowAd(): boolean {
  return sessionAdCount < MAX_SESSION_ADS && /* 既存の時間チェック */;
}
```

---

## タスク5: リワード広告コンティニュー機能（ソロモード限定）

**ファイル:**
- `src/services/adService.ts` に`showRewardedAd()`を追加
- `src/components/GameOverOverlay.tsx` にコンティニューボタンを追加
- `src/store/gameStore.ts` にコンティニューロジックを追加

**目的:** ソロモードのゲームオーバー時に「リワード広告を見てコンティニュー」ボタンを追加。広告視聴でボード上の下3行をクリアして続行。

**実装手順:**

### A. adService.tsにリワード広告を追加

```typescript
import { RewardedAd, RewardedAdEventType, AdEventType, TestIds } from 'react-native-google-mobile-ads';

const REWARDED_AD_UNIT_ID = __DEV__ ? TestIds.REWARDED : 'ca-app-pub-XXXXX/YYYYY';
// ↑実際の広告IDがあればそれを使用。なければTestIdsのままでOK

let rewardedAd: RewardedAd | null = null;

export function loadRewardedAd() {
  if (!_nativeModuleAvailable) return;
  rewardedAd = RewardedAd.createForAdRequest(REWARDED_AD_UNIT_ID);
  rewardedAd.load();
}

export function showRewardedAd(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!rewardedAd) {
      resolve(false);
      return;
    }

    const unsubEarned = rewardedAd.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
      resolve(true);
      cleanup();
    });

    const unsubClosed = rewardedAd.addAdEventListener(AdEventType.CLOSED, () => {
      resolve(false);
      cleanup();
      loadRewardedAd(); // 次回用にプリロード
    });

    function cleanup() {
      unsubEarned();
      unsubClosed();
    }

    rewardedAd.show();
  });
}
```

初期化時に`loadRewardedAd()`を呼ぶ。

### B. gameStoreにcontinueGame関数を追加

```typescript
continueGame: () => {
  const { board } = get();
  const newBoard = board.map((row, r) => {
    // 下3行をクリア（BOARD_SIZEに合わせて調整）
    if (r >= board.length - 3) {
      return row.map(() => null);
    }
    return row;
  });
  set({
    board: newBoard,
    isGameOver: false,
    hasContinued: true, // 1回のゲームで1回だけ
  });
},
```

stateに`hasContinued: boolean`を追加（初期値false、initGameでリセット）。

### C. GameOverOverlayにコンティニューボタンを追加

- **ソロモード** かつ **まだコンティニューしていない** 場合のみ表示
- PvPモードでは非表示

```jsx
{!isPvP && !hasContinued && (
  <TouchableOpacity onPress={handleContinue} style={continueButtonStyle}>
    <Text>▶ 広告を見て続行</Text>
  </TouchableOpacity>
)}
```

```typescript
const handleContinue = async () => {
  const rewarded = await showRewardedAd();
  if (rewarded) {
    gameStore.getState().continueGame();
  }
};
```

---

## タスク6: クラッシュフリー率改善（DFS yield頻度調整）

**ファイル:** `src/game/survivalAlgorithm.ts`

**目的:** 低スペック端末でDFS探索がUIスレッドをブロックする問題を改善。

**実装手順:**

1. 現在の`yieldToUI()`の呼び出し頻度を確認。3回に1回（`count % 3 === 0`）でyieldしているなら、毎回yieldに変更:

変更前:
```typescript
if (count % 3 === 0) {
  await yieldToUI();
}
```

変更後:
```typescript
await yieldToUI();
```

2. ただし、毎回yieldすると生成が遅くなる可能性がある。代替案として、**経過時間ベース**のyieldに変更:

```typescript
const yieldInterval = 8; // 8msごとにyield（1フレーム≒16ms）
let lastYield = Date.now();

// ループ内で:
if (Date.now() - lastYield > yieldInterval) {
  await yieldToUI();
  lastYield = Date.now();
}
```

3. また、`generateBlocksAsync`のリトライ回数（30回）でも見つからない場合のフォールバックを強化:

```typescript
// 最終フォールバック: 最も小さい1×1ブロックを返す
if (attempts >= MAX_ATTEMPTS) {
  console.warn('[Survival] Fallback: returning easy blocks after max attempts');
  return getRandomBlocks('easy', 3);  // 簡単なブロックで確実に配置可能
}
```

---

## 実装順序

1. タスク6（クラッシュフリー率） — 最も影響小、安全な変更
2. タスク2（スコアフィードバック） — 小規模UI改善
3. タスク1（ドラッグスケールアップ） — 操作性改善
4. タスク4（広告タイミング） — 収益改善
5. タスク5（リワード広告） — 新機能追加
6. タスク3（対戦相手ボード） — 最大の新機能

各タスク完了後に`npx tsc --noEmit`でTypeScriptエラーチェックを行ってください。
