const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const config = getDefaultConfig(__dirname);
// Opt-in local native QA only. Release bundles cannot resolve fixture modules.
if (process.env.BUFFAGO_NATIVE_VISUAL_QA === '1') {
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const resolved = context.resolveRequest(context, moduleName, platform);
    const replacements = {
      [path.join(__dirname, 'lib', 'supabase.js')]: 'supabase.js',
      [path.join(__dirname, 'providers', 'LocationProvider.tsx')]: 'LocationProvider.jsx',
      ...(process.env.BUFFAGO_NATIVE_VISUAL_PHOTO === '1' ? { [path.join(__dirname, 'tests', 'fixtures', 'native-visual', 'approvedPhoto.js')]: 'approvedPhoto.local.json' } : {}),
    };
    const replacement = replacements[resolved.filePath];
    if (!replacement) return resolved;
    if (!context.dev) throw new Error('Native visual fixtures require a development bundle');
    return { type: 'sourceFile', filePath: path.join(__dirname, 'tests', 'fixtures', 'native-visual', replacement) };
  };
}
module.exports = config;
