import test from 'node:test';
import assert from 'node:assert/strict';
import { featuredRecommendation, routePreviewPoints } from '../lib/routePreview.js';

test('recommendation retains eligible nearest ordering and excludes existing crawls', () => {
  const routes = ['active', 'completed', 'new', 'later'].map((id) => ({ id, stops: [{}], distanceMi: 1 }));
  routes.splice(2, 0, { id: 'no-stops', stops: [], distanceMi: 0 });
  routes.splice(3, 0, { id: 'unknown-distance', stops: [{}], distanceMi: null });
  assert.equal(featuredRecommendation(routes, { active: {} }, (id) => id === 'completed').id, 'new');
  assert.equal(featuredRecommendation(routes.slice(0, 2), { active: {} }, (id) => id === 'completed'), null);
});
test('preview rejects unavailable or invalid coordinates and preserves original stop numbers', () => {
  assert.deepEqual(routePreviewPoints([{ lat: null, lng: null }, { lat: 91, lng: 0 }]), []);
  const points = routePreviewPoints([{ lat: 41, lng: -72 }, {}, { lat: 42, lng: -71 }]);
  assert.deepEqual(points.map((point) => point.number), [1, 3]);
  assert.ok(points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)));
  assert.ok(points[0].x < points[1].x && points[0].y > points[1].y);
});
test('single and coincident stops remain finite without inventing positions', () => {
  const points = routePreviewPoints([{ lat: 41, lng: -72 }, { lat: 41, lng: -72 }]);
  assert.deepEqual(points.map(({ x, y }) => ({ x, y })), [{ x: 160, y: 78 }, { x: 160, y: 78 }]);
});
