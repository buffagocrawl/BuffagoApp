import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMapPreviewRegion, createMapPreviewOpenGate, normalizeMapCoordinate, prepareMapPreview } from '../utils/mapPreview.js';

test('normalizes valid numeric and numeric-string map coordinates', () => {
  assert.deepEqual(normalizeMapCoordinate({ lat: '42.8864', lng: -78.8784 }), {
    latitude: 42.8864,
    longitude: -78.8784,
  });
});

test('rejects null, non-finite, empty, and out-of-range map coordinates', () => {
  for (const stop of [
    { lat: null, lng: -78.8 },
    { lat: 'not-a-number', lng: -78.8 },
    { lat: '', lng: -78.8 },
    { lat: Infinity, lng: -78.8 },
    { lat: NaN, lng: -78.8 },
    { lat: 91, lng: -78.8 },
    { lat: 42.8, lng: -181 },
  ]) {
    assert.equal(normalizeMapCoordinate(stop), null);
  }
});

test('reports a safe fallback when no stop has a valid coordinate', () => {
  const preview = prepareMapPreview([{ lat: null, lng: null }, { lat: 'NaN', lng: 'Infinity' }]);
  assert.equal(preview.failureCategory, 'no_valid_coordinates');
  assert.equal(preview.coordinates.length, 0);
  assert.equal(preview.canRenderPolyline, false);
  assert.equal(preview.canFitCoordinates, false);
});

test('does not fit or draw a polyline for one valid stop', () => {
  const preview = prepareMapPreview([{ id: 'a', lat: 42.8, lng: -78.8 }, { id: 'b', lat: null, lng: null }]);
  assert.equal(preview.coordinateStops.length, 1);
  assert.equal(preview.canRenderPolyline, false);
  assert.equal(preview.canFitCoordinates, false);
});

test('preserves valid stops and enables map path rendering for two or more coordinates', () => {
  const preview = prepareMapPreview([
    { id: 'a', lat: 42.8, lng: -78.8 },
    { id: 'bad', lat: 200, lng: 20 },
    { id: 'b', latitude: '42.9', longitude: '-78.9' },
  ]);
  assert.deepEqual(preview.coordinates, [
    { latitude: 42.8, longitude: -78.8 },
    { latitude: 42.9, longitude: -78.9 },
  ]);
  assert.equal(preview.canRenderPolyline, true);
  assert.equal(preview.canFitCoordinates, true);
});

test('the Somers production route produces four safe native-map coordinates', () => {
  const preview = prepareMapPreview([
    { id: 'bond-124', lat: 41.9851, lng: -72.4882 },
    { id: 'joannas', lat: 41.986, lng: -72.4865 },
    { id: 'sonnys', lat: 41.9861, lng: -72.4683 },
    { id: 'marios', lat: 41.9816, lng: -72.4484 },
  ]);
  assert.equal(preview.coordinates.length, 4);
  assert.equal(preview.canRenderPolyline, true);
  assert.equal(preview.canFitCoordinates, true);
});

test('the preview press gate prevents duplicate presentation until the first press is scheduled', () => {
  const gate = createMapPreviewOpenGate();
  assert.equal(gate.tryAcquire(), true);
  assert.equal(gate.tryAcquire(), false);
  gate.release();
  assert.equal(gate.tryAcquire(), true);
});

test('builds a finite initial region only from valid map coordinates', () => {
  assert.deepEqual(buildMapPreviewRegion([{ latitude: 42.8, longitude: -78.8 }]), {
    latitude: 42.8, longitude: -78.8, latitudeDelta: 0.015, longitudeDelta: 0.015,
  });
  assert.equal(buildMapPreviewRegion([]), null);
  assert.equal(buildMapPreviewRegion([{ latitude: null, longitude: -78.8 }]), null);
});
