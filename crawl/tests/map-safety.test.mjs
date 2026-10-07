import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { mapCoordinate, mapCoordinates, mapRegion, fitMap, createMapRequestGuard } from '../lib/mapSafety.js';
import { decodePolyline, getWalkingPath } from '../utils/walkRoute.js';
import { mobileModule, hookRuntime } from './helpers/mobile-runtime.mjs';

for (const [label, value] of Object.entries({ 'null latitude': { lat: null, lng: 2 }, 'null longitude': { lat: 1, lng: null },
  'invalid strings': { lat: 'bad', lng: '2' }, NaN: { lat: NaN, lng: 2 }, Infinity: { lat: 1, lng: Infinity },
  'out of bounds': { lat: 91, lng: -181 }, 'empty strings': { lat: '', lng: ' ' }, boolean: { lat: true, lng: 2 } })) {
  test(`Maps rejects ${label}`, () => assert.equal(mapCoordinate(value), null));
}
test('valid numeric and decimal-string coordinates preserve equator and prime meridian', () => {
  assert.deepEqual(mapCoordinate({ lat: '0', lng: '-72.5' }), { latitude: 0, longitude: -72.5 });
  assert.deepEqual(mapCoordinate({ latitude: 90, longitude: 180 }), { latitude: 90, longitude: 180 });
});
test('mixed destinations omit invalid points and empty input is safe', () => {
  assert.deepEqual(mapCoordinates([{ lat: null, lng: 2 }, { lat: '1', lng: '2' }, { lat: 99, lng: 2 }]), [{ latitude: 1, longitude: 2 }]);
  assert.deepEqual(mapCoordinates(null), []);
});
test('region rejects bad centers and sanitizes invalid deltas', () => {
  assert.equal(mapRegion({ latitude: NaN, longitude: 2 }), null);
  assert.deepEqual(mapRegion({ latitude: 0, longitude: 0, latitudeDelta: -1, longitudeDelta: Infinity }), { latitude: 0, longitude: 0, latitudeDelta: 0.4, longitudeDelta: 0.4 });
});
test('fit handles zero points, one point, mixed points, and map ref not ready', () => {
  const calls = []; const map = { fitToCoordinates: (points) => calls.push(points), animateToRegion: (region) => calls.push(region) };
  assert.equal(fitMap(null, true, [{ lat: 1, lng: 2 }]), false);
  assert.equal(fitMap(map, false, [{ lat: 1, lng: 2 }]), false);
  assert.equal(fitMap(map, true, [{ lat: null, lng: 2 }]), false);
  assert.equal(fitMap(map, true, [{ lat: 1, lng: 2 }]), true);
  assert.equal(calls[0].latitude, 1);
  fitMap(map, true, [{ lat: 1, lng: 2 }, { lat: NaN, lng: 2 }, { lat: 3, lng: 4 }]);
  assert.equal(calls[1].length, 2);
  assert.equal(fitMap({ fitToCoordinates() { throw Error('native'); } }, true, [{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }]), false);
});

for (const [label, result] of [['API failure', { status: 'REQUEST_DENIED', error_message: 'private provider text' }],
  ['empty route', { status: 'OK', routes: [] }], ['malformed path', { status: 'OK', routes: [{ overview_polyline: { points: '_' } }] }]]) {
  test(`Directions ${label} returns no line`, async () => {
    assert.deepEqual(await getWalkingPath([{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }], { apiKey: 'placeholder', fetchImpl: async () => ({ json: async () => result }) }), []);
  });
}
test('Directions network failure leaves markers available', async () => {
  const points = [{ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 }];
  assert.deepEqual(await getWalkingPath(points, { apiKey: 'placeholder', fetchImpl: async () => { throw Error('offline'); } }), []);
  assert.equal(points.length, 2);
});
test('Directions rejects stale request and aborted response', async () => {
  const guard = createMapRequestGuard(); const request = guard.begin();
  let resolve; const waiting = new Promise((r) => { resolve = r; });
  const pending = getWalkingPath([{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }], { apiKey: 'placeholder', isCurrent: () => guard.current(request), fetchImpl: () => waiting });
  guard.cancel(); resolve({ json: async () => ({ status: 'OK', routes: [{ overview_polyline: { points: '??' } }] }) });
  assert.deepEqual(await pending, []);
  const controller = new AbortController(); controller.abort();
  assert.deepEqual(await getWalkingPath([{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }], { apiKey: 'placeholder', signal: controller.signal }), []);
});
test('encoded route parser rejects truncation, invalid characters and oversized input', () => {
  assert.equal(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@').length, 3);
  for (const value of [null, '_', '?', '!!!!', '_'.repeat(1000001)]) assert.deepEqual(decodePolyline(value), []);
});

for (const [name, file, start, end] of [
  ['Crawl tab', 'app/(tabs)/routes/index.jsx', 'const openAllRoutesMap = useCallback(', '}, [filtered,'],
  ['Wingdex tab', 'app/(tabs)/ratings/index.jsx', 'const openRestaurantsMap = useCallback(', '}, [locationMode, user?.id]'],
]) test(`${name} Map button opens without issuing premature native commands`, () => {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const offset = source.indexOf(start) + start.length;
  const tail = source.indexOf(end, offset);
  assert.ok(tail > offset);
  const coords = [{ lat: null, lng: 2 }, { lat: 'bad', lng: 2 }, { lat: 1, lng: 2 }, { lat: 3, lng: 4 }];
  const fitted = []; let opened = false;
  const context = { mapCoordinate, filtered: coords.map((stop, id) => ({ id, stops: [stop] })), filteredRef: { current: coords },
    setAllMarkers: (items) => assert.equal(items.length, 2), setOpenAllMap: () => { opened = true; }, setOpenMap: () => { opened = true; },
    setMapLegendFilter() {}, trackEvent() {}, user: null, session: null, locationMode: 'all', selectedStatus: null, selectedTag: null,
    allMapRef: { current: { fitToCoordinates: (points) => fitted.push(points) } }, requestAnimationFrame: (fn) => fn() };
  vm.runInNewContext(`(${source.slice(offset, tail + 1)})()`, context);
  assert.equal(opened, true); assert.equal(fitted.length, 0);
  assert.match(source, /mapCoordinate\((first|r)\)/);
});

test('native wrapper prevents missing configuration and waits for onMapReady', () => {
  const runtime = hookRuntime(); let config = {};
  const react = { ...runtime.react, Component: class {}, forwardRef: (fn) => fn, Children: { toArray: (value) => value || [] },
    useImperativeHandle: (ref, make) => { ref.current = make(); } };
  const module = mobileModule('lib/platformMap.native.js', { react, 'react/jsx-runtime': runtime.jsx,
    'react-native': { Platform: { OS: 'android' }, Text: 'text', View: 'view' }, 'expo-constants': { expoConfig: { get extra() { return config; } } },
    'react-native-maps': { __esModule: true, default: 'native-map', Marker: 'native-marker', Polyline: 'native-polyline', PROVIDER_GOOGLE: 'google' },
    './mapSafety': { mapCoordinate, mapCoordinates, mapRegion, fitMap } });
  const ref = {}; const props = { children: [{ props: { coordinate: { latitude: 1, longitude: 2 } } }] };
  const render = () => runtime.render((p) => module.default(p, ref), props);
  assert.equal(render().type, 'view');
  config = { androidMapsConfigured: true };
  const map = render().props.children; const calls = [];
  map.props.ref.current = { animateToRegion: (region) => calls.push(region) };
  ref.current.fitToCoordinates([{ lat: 1, lng: 2 }]); assert.equal(calls.length, 0);
  map.props.onMapReady({}); assert.equal(calls.length, 1);
  config = {};
  assert.equal(render().type, 'view');
  ref.current.fitToCoordinates([{ lat: 1, lng: 2 }]);
  assert.equal(calls.length, 1, 'unavailable map resets stale native readiness');
  assert.equal(module.Marker({ coordinate: { latitude: NaN, longitude: 2 } }), null);
  assert.equal(module.Polyline({ coordinates: [{ lat: 1, lng: 2 }] }), null);
});
