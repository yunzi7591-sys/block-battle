import React, { useEffect } from 'react';
import { Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import ReAnimated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withDelay,
    runOnJS,
} from 'react-native-reanimated';

// ─── Toast Store ─────────────────────────────────────────
interface ToastState {
    message: string | null;
    type: 'error' | 'info' | 'success';
    visible: boolean;
    showToast: (message: string, type?: 'error' | 'info' | 'success') => void;
    hideToast: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
    message: null,
    type: 'info',
    visible: false,
    showToast: (message, type = 'info') => {
        set({ message, type, visible: true });
        // Auto-dismiss after 3 seconds
        setTimeout(() => set({ visible: false }), 3000);
    },
    hideToast: () => set({ visible: false }),
}));

// ─── Color Map ───────────────────────────────────────────
const COLORS: Record<string, string> = {
    error: '#E94560',
    info: '#4DA8DA',
    success: '#2ECC71',
};

// ─── Toast Component ─────────────────────────────────────
export function Toast() {
    const { message, type, visible } = useToastStore();
    const insets = useSafeAreaInsets();
    const translateY = useSharedValue(-100);

    useEffect(() => {
        if (visible) {
            translateY.value = withTiming(0, { duration: 300 });
        } else {
            translateY.value = withTiming(-100, { duration: 300 });
        }
    }, [visible]);

    const animStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
    }));

    if (!message && !visible) return null;

    return (
        <ReAnimated.View
            style={[
                styles.container,
                { top: insets.top + 8, backgroundColor: COLORS[type] || COLORS.info },
                animStyle,
            ]}
            pointerEvents="none"
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
        >
            <Text style={styles.text}>{message}</Text>
        </ReAnimated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        left: 20,
        right: 20,
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 12,
        zIndex: 9999,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 10,
    },
    text: {
        color: '#FFF',
        fontSize: 14,
        fontWeight: '700',
        textAlign: 'center',
    },
});
