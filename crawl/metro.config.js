const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const config = getDefaultConfig(__dirname);
// Local Expo exports and acceptance runtimes are generated caches, not app
// sources. Crawling them can delay manifest/bundle responses until the Android
// development client times out. Keep Expo's existing exclusions as well.
const defaultBlockList = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(defaultBlockList) ? defaultBlockList : [defaultBlockList]).filter(Boolean),
  /[\\/]\.expo(?:[\\/]|$)/,
];
// Opt-in local native QA only. Release bundles cannot resolve fixture modules.
if (process.env.BUFFAGO_NATIVE_VISUAL_QA === '1') {
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const resolved = context.resolveRequest(context, moduleName, platform);
    const replacements = {
      [path.join(__dirname, 'lib', 'supabase.js')]: 'supabase.js',
      [path.join(__dirname, 'providers', 'LocationProvider.tsx')]: 'LocationProvider.jsx',
      ...(process.env.EXPO_PUBLIC_BUFFAGO_APP_POLISH_QA === '1' ? {
        [path.join(__dirname, 'lib', 'Wingman', 'WingmanService.ts')]: 'WingmanService.ts',
        [path.join(__dirname, 'lib', 'wingShotStaging.ts')]: 'wingShotStaging.ts',
      } : {}),
      ...(process.env.EXPO_PUBLIC_BUFFAGO_NATIVE_GALLERY_QA === '1' ? { [path.join(__dirname, 'components', 'ui', 'OperationUI.jsx')]: 'OperationUI.jsx' } : {}),
      ...(process.env.BUFFAGO_NATIVE_VISUAL_PHOTO === '1' ? { [path.join(__dirname, 'tests', 'fixtures', 'native-visual', 'approvedPhoto.js')]: 'approvedPhoto.local.json' } : {}),
    };
    const replacement = replacements[resolved.filePath];
    if (!replacement) return resolved;
    // The fixture adapter delegates every non-image export to the real module.
    if (context.originModulePath === path.join(__dirname, 'tests', 'fixtures', 'native-visual', 'OperationUI.jsx')) return resolved;
    if (!context.dev) throw new Error('Native visual fixtures require a development bundle');
    return { type: 'sourceFile', filePath: path.join(__dirname, 'tests', 'fixtures', 'native-visual', replacement) };
  };
}
module.exports = config;
