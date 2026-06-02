// Metro config wired for NativeWind. `input` points at the global stylesheet
// that holds the @tailwind directives and the design-token CSS variables.
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: './src/global.css' });
