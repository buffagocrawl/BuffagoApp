module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],          // already includes expo-router support
    plugins: [
      'react-native-reanimated/plugin',      // keep this, must remain last
    ],
  };
};