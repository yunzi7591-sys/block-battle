/**
 * Jewel Tone Palette for Cathedral Stained Glass
 * These represent deep, rich historical glass colors.
 */

export const JEWEL_PALETTE = {
    RUBY: {
        main: '#A10D2D', // Deep Ruby
        light: '#D72638',
        dark: '#4B000E',
        glow: 'rgba(215, 38, 56, 0.4)'
    },
    SAPPHIRE: {
        main: '#0F4C81', // Classic Sapphire
        light: '#1B9AAA',
        dark: '#051923',
        glow: 'rgba(27, 154, 170, 0.4)'
    },
    EMERALD: {
        main: '#065F46', // Deep Emerald
        light: '#10B981',
        dark: '#064E3B',
        glow: 'rgba(16, 185, 129, 0.4)'
    },
    AMETHYST: {
        main: '#4C1D95', // Rich Amethyst
        light: '#8B5CF6',
        dark: '#2E1065',
        glow: 'rgba(139, 92, 246, 0.4)'
    },
    AMBER: {
        main: '#B45309', // Deep Amber
        light: '#F59E0B',
        dark: '#78350F',
        glow: 'rgba(245, 158, 11, 0.4)'
    },
    AQUAMARINE: {
        main: '#155E75', // Deep Teal/Aqua
        light: '#06B6D4',
        dark: '#164E63',
        glow: 'rgba(6, 182, 212, 0.4)'
    }
};

export type JewelColor = keyof typeof JEWEL_PALETTE;

export const getRandomJewelColor = () => {
    const keys = Object.keys(JEWEL_PALETTE) as JewelColor[];
    const key = keys[Math.floor(Math.random() * keys.length)];
    return JEWEL_PALETTE[key].main;
};

// For multi-stop gradients
export const getJewelGradient = (hex: string) => {
    // Find the palette entry that matches this color
    const entry = Object.values(JEWEL_PALETTE).find(e => e.main === hex);
    if (entry) {
        return [entry.dark, entry.main, entry.light];
    }
    // Fallback if color doesn't match palette (though it should)
    return [hex, hex, hex];
};
