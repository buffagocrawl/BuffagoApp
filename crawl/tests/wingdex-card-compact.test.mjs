import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../app/(tabs)/ratings/index.jsx', import.meta.url), 'utf8');
const card = source.slice(source.indexOf('const renderItem'), source.indexOf('const locationLabel', source.indexOf('const renderItem')));
test('Wingdex places photo counts with restaurant name and rate action with score/count', () => {
 const header = card.slice(card.indexOf('<View style={styles.restaurantHeader}>'), card.indexOf('<View style={styles.restaurantActions}>'));
 assert.match(header, /item.name/);
 assert.match(header, /pictureCounts\[destIdStr\] === 1 \? 'photo' : 'photos'/);
 assert.match(header, /0 photos/);
 assert.match(header, /setGalleryRestaurant\(item\)/);
 const rating = card.slice(card.indexOf('<View style={styles.restaurantActions}>'), card.indexOf('{savedFeatureEnabled'));
 assert.match(rating, /displayAvg/); assert.match(rating, /ratingsLabel/); assert.match(rating, /onPressCoinRate\(item\)/);
 assert.doesNotMatch(rating, /pictureCountsStatus/);
 assert.match(card, /approvedThumbnails\[destIdStr\]/);
 assert.match(header, /distText/);
});
test('card name, count, and rating controls can wrap without fixed height or clipping', () => {
 assert.match(source, /restaurantHeader:.*flexWrap: 'wrap'/);
 assert.match(source, /restaurantCardName:.*flexShrink: 1.*minWidth: 0/);
 assert.match(source, /restaurantPhotoCount:.*maxWidth: '100%'/);
 assert.match(source, /restaurantActions:.*flexWrap: 'wrap'/);
 assert.match(source, /restaurantMetrics:.*flexWrap: 'wrap'.*flexShrink: 1/);
 assert.match(source, /rateBtnInlineContent:.*minHeight: 44/);
 assert.doesNotMatch(card, /numberOfLines=\{1\}/);
});

test('scrolled restaurant actions stay below the fixed discovery toolbar', () => {
 const list = source.slice(source.indexOf('<Animated.FlatList'), source.indexOf('ItemSeparatorComponent'));
 assert.match(list, /style=\{\{ flex: 1, marginTop: headerHeight \}\}/);
 assert.doesNotMatch(list, /paddingTop: headerHeight/);
});

test('saved collections reserve label space and maintain touch size', () => {
 assert.match(source, /savedDestinationChip:.*minHeight: 44.*paddingHorizontal: 8/);
 const rail=source.slice(source.indexOf('<View style={styles.savedDestinationRail}'),source.indexOf('placeholder="Search destinations'));
 assert.doesNotMatch(rail, /icon=\{icon\}/);
 assert.match(rail, /\['wantToTry', 'Want to Try'\]/);
});
