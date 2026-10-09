import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mobileModule, hookRuntime } from './helpers/mobile-runtime.mjs';
import { featuredRecommendation } from '../lib/routePreview.js';

test('Crawls hook render supports an opened active route without temporal initialization errors', () => {
  const runtime = hookRuntime();
  const source = readFileSync(new URL('../app/(tabs)/routes/index.jsx', import.meta.url), 'utf8');
  const stateNames = [...source.matchAll(/const \[([^,]+),[^\]]+\] = useState/g)].map((match) => match[1]);
  let stateNumber = 0;
  const route = { id: 'active-route', title: 'Fixture route', stops: [], distanceMi: 1 };
  const react = { ...runtime.react, useEffect() {}, useState(initial) {
    const name = stateNames[stateNumber++];
    const value = name === 'active' ? route : name === 'activeProgressByRoute' ? { [route.id]: { hits: 0 } } : name === 'openDetails' ? true : name === 'loading' ? false : initial;
    return runtime.react.useState(value);
  } };
  const inert = new Proxy(function () { return null; }, { get(_target, key) { if (key === '__esModule') return true; return inert; } });
  const imports = {};
  for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) imports[match[1]] = inert;
  imports.react = { ...react, default: react, __esModule: true };
  imports['react/jsx-runtime'] = runtime.jsx;
  imports['react-native'] = { View: 'view', FlatList: 'list', RefreshControl: 'refresh', ScrollView: 'scroll', Alert: {}, StyleSheet: { create: (value) => value } };
  imports['react-native-paper'] = { ...Object.fromEntries(['ActivityIndicator', 'Card', 'Text', 'Portal', 'Dialog', 'Button', 'Divider', 'ProgressBar', 'TextInput', 'HelperText', 'IconButton'].map((name) => [name, inert])), useTheme: () => ({ colors: {}, dark: true }) };
  imports['../../../providers/LocationProvider'] = { useLocationCtx: () => ({ coords: null, status: 'undetermined' }) };
  imports['expo-router'] = { useRouter: () => ({}), useLocalSearchParams: () => ({}) };
  imports['../../../lib/routePreview'] = { featuredRecommendation };
  const { default: Crawls } = mobileModule('app/(tabs)/routes/index.jsx', imports);
  let tree;
  assert.doesNotThrow(() => { tree = runtime.render(Crawls, {}); });
  assert.match(JSON.stringify(tree), /Resume Crawl/);
});
