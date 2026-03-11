import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getJewelGradient } from '../utils/colors';

interface StainedGlassCellProps {
    color: string;
    size?: number; // Optional for flex-based layout
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
            {/* Layer 1: CATHEDRAL INNER REFRACTION (The "Body") */}
            <LinearGradient
                colors={colors as [string, string, ...string[]]}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            />

            {/* Layer 2: INTERNAL LIGHT PATTERN (Simulates light passing through thick glass) */}
            <LinearGradient
                colors={['transparent', 'rgba(255,255,255,0.08)', 'transparent']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0.3, y: 0 }}
                end={{ x: 0.7, y: 1 }}
            />

            {/* Layer 3: HEAVY LEAD FRAME (Artisan Metal) */}
            <View style={styles.leadFrame} />

            {/* Layer 4: SURFACE HIGHLIGHTS & BEVELS */}
            <LinearGradient
                colors={['rgba(255,255,255,0.4)', 'rgba(255,255,255,0)', 'rgba(0,0,0,0.2)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
            />

            {/* Layer 5: PRECISION CUT CORNER GLOSS */}
            <View style={styles.cornerHighlight} />

            {/* Layer 6: ARTISAN BEVEL OVERLAY */}
            <View style={styles.bevelFrame} />
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        borderRadius: 2, // Slight rounding for "pressed" glass segments
        overflow: 'hidden',
    },
    leadFrame: {
        ...StyleSheet.absoluteFillObject,
        borderWidth: 3, // Increased for "Cathedral" weight
        borderColor: '#1A1A1A', // Darker, more "leaden"
        opacity: 0.9,
    },
    bevelFrame: {
        ...StyleSheet.absoluteFillObject,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.2)',
        margin: 3, // Sits inside the lead frame
    },
    cornerHighlight: {
        position: 'absolute',
        top: 4,
        left: 4,
        width: '45%',
        height: '45%',
        borderLeftWidth: 2,
        borderTopWidth: 2,
        borderColor: 'rgba(255,255,255,0.7)',
        borderTopLeftRadius: 4,
    },
});
