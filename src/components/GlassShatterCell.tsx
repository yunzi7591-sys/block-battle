/**
 * GlassShatterCell.tsx — 爆速ガラス破砕VFX
 *
 * 170ms の超高速破砕。Easing.out(Easing.exp) で初速極大。
 * 鋭角ポリゴン破片 + 高速回転。発光要素一切なし。
 * Reanimated UIスレッド駆動 — 60fps保証。
 */

import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import ReAnimated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withDelay,
    Easing,
    interpolate,
    SharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { getJewelGradient } from '../utils/colors';

// ─── Timing ─────────────────────────────────────────────
const SHATTER_DURATION = 170; // ms — 爆速破砕

// ─── Shard Configuration ────────────────────────────────
// 6 鋭角破片。飛距離を大きく、回転を激しく。

interface ShardConfig {
    startX: number;
    startY: number;
    destX: number;
    destY: number;
    rotation: number;
    widthRatio: number;
    heightRatio: number;
    skewX: number;
}

const SHARD_CONFIGS: ShardConfig[] = [
    { startX: 0.05, startY: 0.02, destX: -42, destY: -48, rotation: -320, widthRatio: 0.48, heightRatio: 0.32, skewX: -12 },
    { startX: 0.50, startY: 0.0,  destX: 45,  destY: -42, rotation: 290,  widthRatio: 0.50, heightRatio: 0.28, skewX: 15 },
    { startX: 0.0,  startY: 0.38, destX: -50, destY: 8,   rotation: -380, widthRatio: 0.38, heightRatio: 0.26, skewX: -18 },
    { startX: 0.58, startY: 0.32, destX: 48,  destY: 12,  rotation: 350,  widthRatio: 0.42, heightRatio: 0.30, skewX: 10 },
    { startX: 0.05, startY: 0.56, destX: -38, destY: 45,  rotation: -300, widthRatio: 0.44, heightRatio: 0.38, skewX: -8 },
    { startX: 0.48, startY: 0.52, destX: 40,  destY: 50,  rotation: 340,  widthRatio: 0.52, heightRatio: 0.40, skewX: 14 },
];

// ─── Easing ─────────────────────────────────────────────
const EXPLOSIVE_EASE = Easing.out(Easing.exp);

// ─── Shard Component ────────────────────────────────────

function Shard({ progress, config, cellSize, colors }: {
    progress: SharedValue<number>;
    config: ShardConfig;
    cellSize: number;
    colors: string[];
}) {
    const w = cellSize * config.widthRatio;
    const h = cellSize * config.heightRatio;

    const animStyle = useAnimatedStyle(() => {
        const p = progress.value;
        return {
            opacity: interpolate(p, [0, 0.5, 1.0], [1, 0.9, 0]),
            transform: [
                { translateX: interpolate(p, [0, 1], [0, config.destX]) },
                { translateY: interpolate(p, [0, 1], [0, config.destY]) },
                { rotate: `${interpolate(p, [0, 1], [0, config.rotation])}deg` },
                { skewX: `${config.skewX}deg` },
                // 膨張なし: 1.0 → 0 へ純粋縮小のみ
                { scale: interpolate(p, [0, 1.0], [1, 0.2]) },
            ],
        };
    });

    return (
        <ReAnimated.View
            style={[
                {
                    position: 'absolute',
                    left: config.startX * cellSize,
                    top: config.startY * cellSize,
                    width: w,
                    height: h,
                    borderRadius: 1,
                    overflow: 'hidden',
                },
                animStyle,
            ]}
        >
            <LinearGradient
                colors={colors as [string, string, ...string[]]}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            />
            <View style={shardStyles.edge} />
            <View style={shardStyles.crack} />
        </ReAnimated.View>
    );
}

// ─── Main Component ─────────────────────────────────────

interface GlassShatterCellProps {
    color: string;
    cellSize: number;
    staggerDelay?: number;
}

export const GlassShatterCell = React.memo(({ color, cellSize, staggerDelay = 0 }: GlassShatterCellProps) => {
    const progress = useSharedValue(0);
    const gradientColors = useMemo(() => getJewelGradient(color), [color]);

    useEffect(() => {
        const shardAnim = withTiming(1, {
            duration: SHATTER_DURATION,
            easing: EXPLOSIVE_EASE,
        });

        if (staggerDelay > 0) {
            progress.value = withDelay(staggerDelay, shardAnim);
        } else {
            progress.value = shardAnim;
        }
    }, []);

    return (
        <View style={{ width: cellSize, height: cellSize }}>
            {SHARD_CONFIGS.map((config, i) => (
                <Shard
                    key={i}
                    progress={progress}
                    config={config}
                    cellSize={cellSize}
                    colors={gradientColors}
                />
            ))}
        </View>
    );
});

// ─── Styles ─────────────────────────────────────────────

const shardStyles = StyleSheet.create({
    edge: {
        ...StyleSheet.absoluteFillObject,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.25)',
        borderRadius: 1,
    },
    crack: {
        position: 'absolute',
        top: '20%',
        left: '10%',
        width: '80%',
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.3)',
        transform: [{ rotate: '25deg' }],
    },
});
