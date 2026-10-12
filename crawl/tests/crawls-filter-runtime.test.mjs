import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mobileModule, hookRuntime, findElement } from './helpers/mobile-runtime.mjs';

const path = 'app/(tabs)/routes/index.jsx';
const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
function fixture(width = 390, fontScale = 1) {
  const runtime = hookRuntime();
  const names = [...source.matchAll(/const \[([^,]+),[^\]]+\] = useState/g)].map(match => match[1]);
  let stateNumber = 0;
  const routes = [
    { id: 'active', title: 'Active', travel_tag_id: 1, stops: [], distanceMi: 1 },
    { id: 'completed', title: 'Completed', travel_tag_id: 2, stops: [], distanceMi: 2 },
    { id: 'fresh', title: 'Fresh', travel_tag_id: 1, stops: [], distanceMi: 3 },
  ];
  const initialValues = { loading: false, routesRaw: routes, tags: [{ id: 1, travel: 'Walkable' }, { id: 2, travel: 'Drive' }], activeProgressByRoute: { active: { hits: 1 } }, completionsByRoute: { active: 1, completed: 1 } };
  const react = { ...runtime.react, useEffect() {}, useState(initial) { const name = names[stateNumber++]; return runtime.react.useState(name in initialValues ? initialValues[name] : initial); } };
  const inert = new Proxy(function () {}, { get(_target, key) { if (key === '__esModule') return true; return inert; } });
  const imports = Object.fromEntries([...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => [match[1], inert]));
  imports.react = { ...react, default: react, __esModule: true };
  imports['react/jsx-runtime'] = runtime.jsx;
  imports['react-native'] = { View: 'view', FlatList: 'list', ScrollView: 'scroll', Pressable: 'pressable', RefreshControl: 'refresh', Alert: {}, StyleSheet: { create: value => value }, useWindowDimensions: () => ({ width, height: 780, fontScale }) };
  imports['react-native-safe-area-context'] = { SafeAreaView: 'safe', useSafeAreaInsets: () => ({ top: 24, bottom: 24 }) };
  imports['react-native-paper'] = { ...Object.fromEntries(['Card', 'Text', 'Portal', 'Dialog', 'Button', 'Divider', 'ProgressBar', 'TextInput', 'HelperText', 'IconButton'].map(name => [name, inert])), useTheme: () => ({ colors: {}, dark: false }) };
  imports['../../../providers/LocationProvider'] = { useLocationCtx: () => ({ coords: null, status: 'undetermined' }) };
  imports['expo-router'] = { useRouter: () => ({}), useLocalSearchParams: () => ({}) };
  imports['../../../lib/routePreview'] = { featuredRecommendation: () => null };
  const { default: Crawls } = mobileModule(path, imports);
  const render = () => { stateNumber = 0; return runtime.render(Crawls, {}); };
  return { render };
}
function list(tree) { return tree.props.children.find(node => node?.type === 'list'); }
for (const width of [360, 390, 412, 430]) for (const scale of [1, 1.3]) {
  test(`Crawls filter selection controls real results at ${width} dp / ${scale} text`, () => {
    const { render } = fixture(width, scale);
    let tree = render();
    assert.equal(findElement(tree, 'crawls-filters-dialog').props.visible, false);
    const header = list(tree).props.ListHeaderComponent.props.children[0];
    findElement(header.type(header.props), 'crawls-filters-entry').props.onPress();
    tree = render();
    assert.equal(findElement(tree, 'crawls-filters-dialog').props.visible, true);
    findElement(tree, 'crawls-status-completed').props.onPress();
    tree = render();
    assert.deepEqual(Array.from(list(tree).props.data, route => route.id), ['completed']);
    assert.equal(findElement(tree, 'crawls-status-completed').props.selected, true);
    findElement(tree, 'crawls-tag-1').props.onPress();
    tree = render();
    assert.equal(list(tree).props.data.length, 0);
    findElement(tree, 'crawls-status-all').props.onPress();
    tree = render();
    assert.deepEqual(Array.from(list(tree).props.data, route => route.id), ['active', 'fresh']);
    findElement(tree, 'crawls-status-not_started').props.onPress();
    tree = render();
    assert.deepEqual(Array.from(list(tree).props.data, route => route.id), ['fresh']);
    findElement(tree, 'crawls-show-results').props.onPress();
    assert.equal(findElement(render(), 'crawls-filters-dialog').props.visible, false);
  });
}
test('Five bottom tabs retain route identities and associated labels in required order', () => {
  const layout = readFileSync(new URL('../app/(tabs)/_layout.tsx', import.meta.url), 'utf8');
  const screens = [...layout.matchAll(/<Tabs.Screen\s+name="([^"]+)"[\s\S]*?tabBarButtonTestID: '([^']+)'/g)];
  assert.deepEqual(screens.map(match => [match[1], match[2]]), [['home/index', 'nav.home'], ['ratings/index', 'nav.wingdex'], ['routes/index', 'nav.crawl'], ['journey/index', 'nav.profile'], ['leaderboards/index', 'nav.leaderboard']]);
});
