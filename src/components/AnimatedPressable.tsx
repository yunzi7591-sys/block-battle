/**
 * AnimatedPressable
 *
 * Drop-in replacement for TouchableOpacity with spring-based
 * scale feedback on press. Runs entirely on the UI thread via
 * react-native-reanimated for guaranteed 60fps.
 */

import React from 'react';
import { Pressable, PressableProps, ViewStyle, StyleProp } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
} from 'react-native-reanimated';
import { SPRING_SNAPPY } from '../utils/animations';

const AnimatedPressableView = Animated.createAnimatedComponent(Pressable);

interface Props extends PressableProps {
    style?: StyleProp<ViewStyle>;
    children?: React.ReactNode;
    /** Scale factor when pressed (default 0.96) */
    pressScale?: number;
}

export function AnimatedPressable({
    style,
    children,
    pressScale = 0.96,
    onPressIn,
    onPressOut,
    ...rest
}: Props) {
    const scale = useSharedValue(1);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    return (
        <AnimatedPressableView
            {...rest}
            style={[style, animatedStyle]}
            onPressIn={(e) => {
                scale.value = withSpring(pressScale, SPRING_SNAPPY);
                onPressIn?.(e);
            }}
            onPressOut={(e) => {
                scale.value = withSpring(1, SPRING_SNAPPY);
                onPressOut?.(e);
            }}
        >
            {children}
        </AnimatedPressableView>
    );
}
