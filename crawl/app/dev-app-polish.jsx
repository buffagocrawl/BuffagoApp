// Opt-in, development-only fixture entry. The invalid-host client check is
// deliberate: setting the flag without Metro's fixture boundary is insufficient.
import React, { useState } from 'react';
import { Image, ScrollView } from 'react-native';
import { Button, Text } from 'react-native-paper';
import WingmanAddDialog from '../components/WingmanAddDialog';
import WingdexPhotoGallery from '../components/WingdexPhotoGallery';
import { WingShotFlow } from '../components/wingShots/WingShotFlow';
import { selectedMediaFromAsset } from '../components/wingShots/mediaAdapter';
import { supabase } from '../lib/supabase';

const fixtureAsset = require('../tests/fixtures/native-visual/framing-landscape.png');
const chooseFixture = async () => {
  const asset = typeof fixtureAsset === 'number' ? Image.resolveAssetSource(fixtureAsset) : fixtureAsset;
  const uri = typeof asset === 'string' ? asset : asset.uri;
  return selectedMediaFromAsset({ uri, type: 'image', width: asset.width || 1024, height: asset.height || 1024 });
};
const adapter = { takePhoto: chooseFixture, chooseFromLibrary: chooseFixture };
const restaurant = { destination_id: 'fixture-spot-0', name: 'QA Harbor Wings' };

export default function AppPolishFixture() {
  const [wingman, setWingman] = useState(false);
  const [confidence, setConfidence] = useState(false);
  const [shot, setShot] = useState(false);
  if (!__DEV__ || process.env.EXPO_PUBLIC_BUFFAGO_APP_POLISH_QA !== '1' || supabase.supabaseUrl !== 'https://native-fixture.invalid') return null;
  return <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 64, gap: 20 }}>
    <Text variant="headlineSmall">Local app polish fixtures</Text>
    <Button mode="contained" onPress={() => {setConfidence(false);setWingman(true);}}>Test Wingman focus</Button>
    <Button mode="contained" onPress={() => {setConfidence(true);setWingman(true);}}>Test Wingman confidence</Button>
    <Button mode="contained" onPress={() => setShot(true)}>Test Wing Shot framing</Button>
    <Text>Inline Wingdex photos</Text>
    <WingdexPhotoGallery restaurant={restaurant} embedded compact />
    <Text>Restaurant detail — same votes</Text>
    <WingdexPhotoGallery restaurant={restaurant} embedded />
    <WingmanAddDialog visible={wingman} onDismiss={() => setWingman(false)} initialRestaurant={confidence ? 'QA Confidence Wings' : 'QA Focus Wings'} initialStateId={1} initialStateCode="NY" manualReviewQueuedMessage="Local verification retry; no restaurant created." />
    <WingShotFlow visible={shot} destinationId={restaurant.destination_id} submissionSource="profile"
      onClose={() => setShot(false)} mediaAdapter={adapter} isOnline
      validationTransport={async () => ({ data: { valid: true } })} />
  </ScrollView>;
}
