module.exports = function (api) {
    api.cache(true);
    return {
        presets: ['babel-preset-expo'],
        plugins: [
            // Phase 42: Strip console.log/info/debug in production builds.
            // Keeps console.error and console.warn for crash diagnostics.
            ...(process.env.NODE_ENV === 'production'
                ? [['transform-remove-console', { exclude: ['error', 'warn'] }]]
                : []),
            // IMPORTANT: react-native-reanimated/plugin MUST be listed LAST.
            // After adding/updating this plugin, always run: npx expo start -c
            // to clear the Metro cache. Skipping this WILL cause a crash.
            'react-native-reanimated/plugin',
        ]
    };
};
