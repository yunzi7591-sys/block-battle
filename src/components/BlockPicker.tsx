import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useGameStore } from '../store/gameStore';
import { useShallow } from 'zustand/react/shallow';
import { DraggableBlock } from './DraggableBlock';

export const BlockPicker = ({ isPvP }: { isPvP?: boolean }) => {
    // PERF: スコア・コンボ・クリアアニメーション等での不要な再レンダーを防止
    const { currentBlocks, placedFlags } = useGameStore(useShallow(s => ({
        currentBlocks: s.currentBlocks,
        placedFlags: s.placedFlags,
    })));

    const isPlaced = (index: number) => {
        return placedFlags[index];
    };

    return (
        <View style={styles.container} accessibilityLabel="Block picker tray" accessibilityRole="toolbar">
            {currentBlocks.map((block: any, i: number) => (
                <View
                    key={block ? `${block.id}-${i}` : `empty-${i}`}
                    style={styles.slot}
                    accessibilityLabel={block ? `Block ${i + 1}: ${block.id || 'piece'}${isPlaced(i) ? ', already placed' : ', available to drag'}` : `Empty slot ${i + 1}`}
                    accessibilityRole="button"
                    accessibilityHint={block && !isPlaced(i) ? "Drag to place this block on the board" : undefined}
                >
                    {block && (
                        <DraggableBlock block={block} index={i} placed={isPlaced(i)} isPvP={isPvP} />
                    )}
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        justifyContent: 'space-evenly',
        alignItems: 'center',
        width: '100%',
        height: 100,
        paddingHorizontal: 8,
    },
    slot: {
        flex: 1,
        height: 90,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
