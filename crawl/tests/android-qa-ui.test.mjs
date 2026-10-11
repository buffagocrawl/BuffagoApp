import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('production enables Jury and preserves five tabs with guest discoverability', () => {
  assert.equal(JSON.parse(read('eas.json')).build.production.env.EXPO_PUBLIC_ENABLE_WING_JURY,'true');
  assert.equal((read('app/(tabs)/_layout.tsx').match(/<Tabs.Screen/g)||[]).length,5);
  assert.match(read('app/(tabs)/ratings/index.jsx'), /testID="wingdex-wing-jury-entry"/);
  assert.match(read('app/(tabs)/home/index.jsx'), /testID="home-wing-jury-entry"/);
});
test('Wingdex keeps controls in a scrollable modal with a compact discovery toolbar', () => {
 const source=read('app/(tabs)/ratings/index.jsx');
 const header=source.slice(source.indexOf('accessibilityLabel="Wingdex search and filters"'),source.indexOf('{loading ||',source.indexOf('accessibilityLabel="Wingdex search and filters"')));
 assert.match(header,/styles.discoveryToolbar/);assert.match(header,/wingdex-filters-entry/);assert.match(header,/activeFilterCount/);assert.match(header,/wingdex-wing-jury-entry/);
 assert.doesNotMatch(header,/RADIUS_OPTIONS.map|tagsForFilter.map|wingdexHintVisible/);
 const modal=source.slice(source.indexOf('<Dialog visible={filtersOpen}'),source.indexOf('{/* Choose state dialog */}'));
 assert.match(modal,/ScrollView/);assert.match(modal,/RADIUS_OPTIONS.map/);assert.match(modal,/tagsForFilter.map/);assert.match(modal,/setDiscoverySort/);assert.match(modal,/setStatePickerOpen/);
 assert.match(source,/filterControls:.*flexWrap: 'wrap'/);assert.match(source,/filterChip:.*minHeight: 48/);assert.match(source,/toolbarAction:.*minHeight: 48/);
 assert.match(source,/approvedThumbnails\[destIdStr\]/);assert.match(source,/Add a photo/);
});

test('signup clients never submit welcome amounts and notices read committed balances', () => {
  for(const p of ['app/auth/login.jsx','app/auth/callback.jsx']) assert.doesNotMatch(read(p),/onboarding_seed_bonus|grantOnboardingSeedCoinIfNeeded/);
  const notice=read('components/CoinBonusNotice.jsx');
  assert.match(notice,/buffacoin_wallets/);
  assert.doesNotMatch(notice,/from\('buffacoin_ledger'\)\.insert|\.rpc\(/);
  assert.match(notice,/from\('buffacoin_bonus_notice_ack'\)\.insert/);
});

test('Wingdex uses singular photo copy and production cannot activate native fixtures', () => {
 assert.match(read('app/(tabs)/ratings/index.jsx'),/pictureCounts\[destIdStr\] === 1 \? 'photo' : 'photos'/);
 const metro=read('metro.config.js');assert.match(metro,/BUFFAGO_NATIVE_VISUAL_QA === '1'/);assert.match(metro,/if \(!context.dev\) throw new Error/);
 const eas=JSON.parse(read('eas.json'));assert.equal(eas.build.production.env.BUFFAGO_NATIVE_VISUAL_QA,undefined);assert.equal(eas.submit['internal-testing'].android.track,'internal');
 assert.doesNotMatch(read('lib/supabase.js'),/12345|QA Harbor|native-visual/);
});
