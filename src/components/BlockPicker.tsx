import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useGameStore } from '../store/gameStore';
import { useOnlinePvPStore } from '../store/onlinePvPStore';
import { DraggableBlock } from './DraggableBlock';

export const BlockPicker = ({ isPvP }: { isPvP?: boolean }) => {
    const gameStore = useGameStore();
    const currentBlocks = gameStore.currentBlocks;

    // Phase 27: Unified Block Source (Always use gameStore for rendering)
    const isPlaced = (index: number) => {
        return gameStore.placedFlags[index];
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
