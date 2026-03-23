module.exports = function (api) {
    api.cache(true);
    const isProduction = process.env.NODE_ENV === 'production' || process.env.BABEL_ENV === 'production';
    return {
        presets: ['babel-preset-expo'],
        plugins: [
            // Strip console.log/info/debug in production builds.
            // Keeps console.error and console.warn for crash diagnostics.
            // Covers: EAS Build (NODE_ENV=production), expo start --no-dev (BABEL_ENV=production)
            ...(isProduction
                ? [['transform-remove-console', { exclude: ['error', 'warn'] }]]
                : []),
            // IMPORTANT: react-native-reanimated/plugin MUST be listed LAST.
            // After adding/updating this plugin, always run: npx expo start -c
            // to clear the Metro cache. Skipping this WILL cause a crash.
            'react-native-reanimated/plugin',
        ]
    };
};
