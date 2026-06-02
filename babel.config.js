// Babel config for Expo SDK 56 + NativeWind 4 + Reanimated 4.
// - `jsxImportSource: 'nativewind'` lets className flow through JSX.
// - `nativewind/babel` compiles Tailwind classes.
// - `react-native-worklets/plugin` powers Reanimated 4 worklets and MUST be last.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: ['react-native-worklets/plugin'],
  };
};
