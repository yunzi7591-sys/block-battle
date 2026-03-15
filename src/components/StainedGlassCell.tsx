import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getJewelGradient } from '../utils/colors';

interface StainedGlassCellProps {
    color: string;
    size?: number;
    margin?: number;
    opacity?: number;
    isPreview?: boolean;
    rowIndex?: number;
    colIndex?: number;
}

export const StainedGlassCell = React.memo(({
    color,
    size,
    margin = 0,
    opacity = 0.8,
    isPreview = false,
    rowIndex = 0,
    colIndex = 0,
}: StainedGlassCellProps) => {
    const finalSize = size ?? 0;
    const colors = useMemo(() => getJewelGradient(color), [color]);

    return (
        <View
            style={[
                styles.container,
                {
                    width: finalSize,
                    height: finalSize,
                    padding: margin,
                    opacity: isPreview ? 0.5 : 1.0,
                },
            ]}
        >
            {/* Layer 1: Main jewel gradient (the body) */}
            <LinearGradient
                colors={colors as [string, string, ...string[]]}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            />

            {/* Layer 2: Surface bevel + lead frame (combined into single View) */}
            <View style={styles.bevelFrame} />
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        borderRadius: 2,
        overflow: 'hidden',
        borderWidth: 2.5,
        borderColor: '#1A1A1A',
    },
    bevelFrame: {
        ...StyleSheet.absoluteFillObject,
        borderWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.35)',
        borderLeftColor: 'rgba(255,255,255,0.25)',
        borderBottomColor: 'rgba(0,0,0,0.3)',
        borderRightColor: 'rgba(0,0,0,0.2)',
    },
});
