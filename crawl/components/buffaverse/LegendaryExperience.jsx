import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { Button, Card, Chip, ProgressBar, Text } from 'react-native-paper';
import { MascotCelebration } from '../mascot/MascotCelebration';

const ORANGE = '#FF6B2C';
const GOLD = '#F2B705';
const DARK = '#17110E';

const timeLabel = (minutes) => minutes > 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m left` : minutes > 0 ? `${minutes}m left` : 'Window closed';

export function buildLegendaryShareMessage(event, completed = false) {
  if (!event?.restaurantName) return 'I found a Buffago Legendary moment. Discover local wing spots with Buffago.';
  return completed
    ? `I completed a Legendary wing stop at ${event.restaurantName} in ${event.city}. Buffago turns local wing discovery into a mission. Find your next stop: https://buffago.app/legendary/${event.key}`
    : `${event.restaurantName} in ${event.city} is temporarily Legendary on Buffago. I found it before the window closed. Discover local wing spots: https://buffago.app/legendary/${event.key}`;
}

function LegendaryMarker({ selected = false, cluster = false, onPress }) {
  return (
    <Pressable testID="legendary-marker" accessibilityRole="button" accessibilityLabel={cluster ? 'Three Legendary restaurant stops' : 'Legendary restaurant marker'} onPress={onPress} style={[styles.marker, selected && styles.markerSelected]}>
      <Text style={styles.markerIcon}>{cluster ? '✦3' : '✦'}</Text>
      <Text style={styles.markerLabel}>{cluster ? 'LEGENDARY STOPS' : 'LEGENDARY'}</Text>
    </Pressable>
  );
}

export function LegendaryExperience({ fixture, reducedMotion = false }) {
  const [completed, setCompleted] = useState(fixture.status === 'completed' || fixture.status === 'pending_reward');
  const [selected, setSelected] = useState(false);
  const event = useMemo(() => ({ ...fixture, progress: completed ? 1 : fixture.progress }), [completed, fixture]);
  const isEmpty = ['empty', 'disabled'].includes(event.status) || !event.restaurantName;
  const unavailable = ['paused', 'cancelled', 'expired', 'stale', 'offline'].includes(event.status);
  const canComplete = !isEmpty && !unavailable && !completed;

  const share = async () => {
    try { await Share.share({ message: buildLegendaryShareMessage(event, completed) }); } catch (_error) { Alert.alert('Share unavailable', 'Your Legendary moment is still saved here.'); }
  };

  const finish = () => setCompleted(true);

  return (
    <ScrollView contentContainerStyle={styles.page} testID="legendary-experience">
      <View style={styles.eyebrowRow}><Text style={styles.eyebrow}>BUFFAGO DISCOVERY</Text><Chip compact style={styles.chip}>NOT SPONSORED</Chip></View>
      {isEmpty ? (
        <Card style={styles.hero} accessible accessibilityLabel="Legendary discovery is not active">
          <Card.Content>
            <Text style={styles.heroKicker}>NOTHING GLOWING NEARBY</Text>
            <Text accessibilityRole="header" style={styles.heroTitle}>{event.status === 'disabled' ? 'Legendary is taking a breather.' : 'Your next wing story is still out there.'}</Text>
            <Text style={styles.heroBody}>{event.reason}</Text>
            <Button mode="contained" accessibilityLabel="Explore Wingdex" onPress={() => Alert.alert('Explore Wingdex', 'The Wingdex is ready for your next local discovery.')} style={styles.primary}>Explore Wingdex</Button>
          </Card.Content>
        </Card>
      ) : (
        <Card style={styles.hero} accessible accessibilityLabel={`Legendary mission at ${event.restaurantName}`}>
          <Card.Content>
            <View style={styles.heroTop}><View style={styles.star}><Text style={styles.starText}>✦</Text></View><View style={{ flex: 1 }}><Text style={styles.heroKicker}>LEGENDARY RIGHT NOW</Text><Text style={styles.city}>{event.city} · {event.scope === 'statewide' ? 'statewide find' : 'nearby find'}</Text></View></View>
            <Text accessibilityRole="header" style={styles.heroTitle}>{event.restaurantName}</Text>
            <Text style={styles.reason}>{event.reason}</Text>
            <View style={styles.timerRow}><Text accessibilityLabel={`${timeLabel(event.minutesRemaining)} remaining`} style={styles.timer}>{timeLabel(event.minutesRemaining)}</Text><Text style={styles.timerHint}>{completed ? 'mission complete' : 'limited window'}</Text></View>
            <Text accessibilityLabel={`Mission: rate wings at ${event.restaurantName} before the window ends`} style={styles.mission}>{completed ? 'You rated it. This stop is yours.' : `Rate wings at ${event.restaurantName} before the window ends.`}</Text>
            <ProgressBar progress={event.progress} color={GOLD} style={styles.progress} accessibilityLabel={`${Math.round(event.progress * 100)} percent complete`} />
            <Text style={styles.progressText}>{completed ? '1 of 1 stop complete' : event.progress ? 'Started · 1 rating finishes it' : '1 rating finishes it'}</Text>
            <Button mode="contained" accessibilityRole="button" accessibilityLabel={completed ? 'Share completed Legendary stop' : 'Rate wings and complete mission'} onPress={completed ? share : finish} disabled={!canComplete && !completed} style={styles.primary}>{completed ? 'Share this stop' : 'Rate wings to finish'}</Button>
            {!completed && <Button mode="text" onPress={share} accessibilityLabel="Share Legendary discovery before completion">Share the find</Button>}
          </Card.Content>
        </Card>
      )}

      <View style={styles.mapPanel} accessible accessibilityLabel="Legendary marker map preview">
        <View style={styles.mapHeader}><Text accessibilityRole="header" style={styles.sectionTitle}>Find the glow</Text><Text style={styles.mapMeta}>Markers use shape + text, not color alone.</Text></View>
        <View style={styles.mapSurface}><View style={styles.roadOne} /><View style={styles.roadTwo} /><LegendaryMarker selected={selected} cluster={event.status === 'clustered'} onPress={() => setSelected(true)} />{selected && <View style={styles.callout}><Text style={styles.calloutTitle}>{event.restaurantName}</Text><Text style={styles.calloutBody}>{timeLabel(event.minutesRemaining)} · {event.reason}</Text><Button compact mode="contained" onPress={() => Alert.alert('Open mission', 'The mission is already visible above.')} style={styles.calloutButton}>Open mission</Button></View>}</View>
        <View style={styles.legend}><Text style={styles.legendGlyph}>✦</Text><Text>Legendary stop</Text><Text style={styles.legendCluster}>✦3</Text><Text>cluster</Text></View>
      </View>

      <Card style={styles.detailCard}><Card.Content><Text style={styles.sectionTitle}>At the restaurant</Text><Text style={styles.detailMission}>{completed ? 'Legendary stop complete' : 'Your mission is one rating, then recognition.'}</Text><Text style={styles.detailBody}>{unavailable ? event.reason : completed ? 'Buffago recorded your completion. Any reward reference is pending review—not coins in your wallet.' : 'Go taste the wings, rate the stop, and leave with a local find worth talking about.'}</Text>{completed && <View style={styles.completion}><MascotCelebration active surface="rating-completion" sourceScreen="buffaverse-showcase" triggerAnimation={!reducedMotion} level="standard" size="medium" accessibilityLabel="Buffago celebrates your Legendary stop" testID="legendary-completion-mascot" /><Text accessibilityRole="header" style={styles.completeTitle}>Legendary stop complete</Text><Text accessibilityLiveRegion="polite" style={styles.completeBody}>Recognition recorded · reward reference pending</Text><Button mode="outlined" onPress={share} accessibilityLabel="Share completed stop with a friend">Share your find</Button></View>}</Card.Content></Card>
      <View style={styles.footer}><Text style={styles.footerText}>Buffago-curated event. Not sponsored unless Buffago says so.</Text><Text style={styles.footerText}>Showcase fixture: {fixture.key} · development/test only</Text></View>
    </ScrollView>
  );
}

export function LegendaryShowcaseHarness({ fixtures }) {
  const [key, setKey] = useState('activeNearby');
  const [reducedMotion, setReducedMotion] = useState(false);
  return <View style={styles.harness}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fixtureBar}>{Object.keys(fixtures).map((name) => <Pressable key={name} onPress={() => setKey(name)} accessibilityRole="button" accessibilityState={{ selected: key === name }} style={[styles.fixture, key === name && styles.fixtureSelected]}><Text style={styles.fixtureText}>{name}</Text></Pressable>)}</ScrollView><View style={styles.toolbar}><Text style={styles.toolbarText}>SHOWCASE / {key}</Text><Pressable onPress={() => setReducedMotion((value) => !value)} accessibilityRole="switch" accessibilityState={{ checked: reducedMotion }}><Text style={styles.motionToggle}>{reducedMotion ? 'Reduced motion: on' : 'Reduced motion: off'}</Text></Pressable></View><LegendaryExperience fixture={fixtures[key]} reducedMotion={reducedMotion} /></View>;
}

const styles = StyleSheet.create({
  harness: { flex: 1, backgroundColor: '#FFF7E9' }, page: { padding: 18, gap: 16, paddingBottom: 42 }, fixtureBar: { padding: 12, gap: 8 }, fixture: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 99, backgroundColor: '#F2DDC9' }, fixtureSelected: { backgroundColor: DARK }, fixtureText: { fontSize: 11, fontWeight: '800', color: DARK }, toolbar: { paddingHorizontal: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, toolbarText: { fontSize: 11, fontWeight: '900', letterSpacing: 1, color: ORANGE }, motionToggle: { fontSize: 12, fontWeight: '800', color: DARK }, eyebrowRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, eyebrow: { fontSize: 12, letterSpacing: 1.6, fontWeight: '900', color: ORANGE }, chip: { backgroundColor: '#F9EBCB' }, hero: { borderRadius: 26, backgroundColor: DARK, overflow: 'hidden' }, heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 }, star: { width: 52, height: 52, borderRadius: 18, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center' }, starText: { color: DARK, fontSize: 30, fontWeight: '900' }, heroKicker: { color: '#FFDFA7', letterSpacing: 1.2, fontWeight: '900', fontSize: 12 }, city: { color: '#C8BEB5', fontSize: 12, marginTop: 4 }, heroTitle: { color: '#FFF7E9', fontWeight: '900', fontSize: 30, lineHeight: 34, marginTop: 18 }, reason: { color: '#F6EADF', fontSize: 16, lineHeight: 22, marginTop: 8 }, heroBody: { color: '#F6EADF', lineHeight: 22, fontSize: 16, marginTop: 12 }, timerRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 20 }, timer: { color: GOLD, fontSize: 25, fontWeight: '900' }, timerHint: { color: '#C8BEB5', fontSize: 12, fontWeight: '800' }, mission: { color: '#FFF7E9', fontSize: 16, lineHeight: 22, fontWeight: '800', marginTop: 16 }, progress: { height: 9, borderRadius: 99, marginTop: 14, backgroundColor: '#49382D' }, progressText: { color: '#C8BEB5', fontSize: 12, marginTop: 6 }, primary: { borderRadius: 14, marginTop: 16, backgroundColor: ORANGE }, mapPanel: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 16 }, mapHeader: { marginBottom: 10 }, sectionTitle: { fontSize: 19, fontWeight: '900', color: DARK }, mapMeta: { color: '#76675B', fontSize: 12, marginTop: 3 }, mapSurface: { height: 210, borderRadius: 16, overflow: 'hidden', backgroundColor: '#E9E5D8', position: 'relative' }, roadOne: { position: 'absolute', width: '140%', height: 20, backgroundColor: '#FFF7E9', top: 100, left: -30, transform: [{ rotate: '-18deg' }] }, roadTwo: { position: 'absolute', width: 20, height: '140%', backgroundColor: '#FFF7E9', left: 140, top: -30, transform: [{ rotate: '24deg' }] }, marker: { position: 'absolute', left: '42%', top: 72, padding: 8, minWidth: 70, borderRadius: 15, backgroundColor: ORANGE, borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', shadowColor: DARK, shadowOpacity: 0.22, shadowRadius: 8, elevation: 5 }, markerSelected: { backgroundColor: GOLD, transform: [{ scale: 1.08 }] }, markerIcon: { color: DARK, fontSize: 26, fontWeight: '900' }, markerLabel: { color: DARK, fontSize: 8, fontWeight: '900', letterSpacing: 0.5 }, callout: { position: 'absolute', left: 16, right: 16, bottom: 12, borderRadius: 14, padding: 12, backgroundColor: DARK }, calloutTitle: { color: '#FFF7E9', fontWeight: '900', fontSize: 16 }, calloutBody: { color: '#F6EADF', lineHeight: 18, marginTop: 3 }, calloutButton: { alignSelf: 'flex-start', marginTop: 6 }, legend: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 10 }, legendGlyph: { color: ORANGE, fontSize: 20, fontWeight: '900' }, legendCluster: { color: ORANGE, fontSize: 16, fontWeight: '900', marginLeft: 8 }, detailCard: { borderRadius: 22, backgroundColor: '#FFFFFF' }, detailMission: { color: ORANGE, fontWeight: '900', fontSize: 16, marginTop: 4 }, detailBody: { color: '#5E5047', lineHeight: 20, marginTop: 8 }, completion: { borderTopWidth: 1, borderTopColor: '#F2DDC9', marginTop: 18, paddingTop: 16, alignItems: 'center', gap: 6 }, completeTitle: { color: DARK, fontSize: 22, fontWeight: '900', textAlign: 'center' }, completeBody: { color: '#5E5047', textAlign: 'center', marginBottom: 8 }, footer: { gap: 4 }, footerText: { color: '#76675B', fontSize: 11, textAlign: 'center' }, fixtureSelectedText: { color: '#FFF7E9' },
});
