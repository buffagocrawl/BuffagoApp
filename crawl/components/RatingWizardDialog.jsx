// components/RatingWizardDialog.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, ScrollView, FlatList, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { Button, Dialog, ProgressBar, Text, useTheme } from 'react-native-paper';

/** Clamp a score to integer 1–10 */
const toNumber = (v, def = 5) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(1, Math.min(10, Math.round(n)));
};

// enforce max N selected
function toggleInArray(arr, val, max = 2) {
  const set = new Set(Array.isArray(arr) ? arr : []);
  if (set.has(val)) set.delete(val);
  else {
    if (set.size >= max) return Array.from(set);
    set.add(val);
  }
  return Array.from(set).sort((a, b) => a - b);
}

/* Color helper: green → yellow → red */
function lerpColor(a, b, t) {
  const ah = parseInt(a.replace('#', ''), 16);
  const ar = (ah >> 16) & 0xff;
  const ag = (ah >> 8) & 0xff;
  const ab = ah & 0xff;

  const bh = parseInt(b.replace('#', ''), 16);
  const br = (bh >> 16) & 0xff;
  const bg = (bh >> 8) & 0xff;
  const bb = bh & 0xff;

  const rr = Math.round(ar + (br - ar) * t);
  const rg = Math.round(ag + (bg - ag) * t);
  const rb = Math.round(ab + (bb - ab) * t);

  return `rgb(${rr}, ${rg}, ${rb})`;
}

function pepperColorForValue(value) {
  const t = Math.max(0, Math.min(1, (value - 1) / 9));
  const green = '#2e7d32';
  const mid = '#FFB300';
  const red = '#c62828';
  if (t <= 0.5) return lerpColor(green, mid, t / 0.5);
  return lerpColor(mid, red, (t - 0.5) / 0.5);
}

/* Pepper-style slider row */
function SliderRowPretty({ label, value, onChange, description, badLabel, goodLabel }) {
  const theme = useTheme();
  const progress = Math.max(0, Math.min(1, (value - 1) / 9));
  const pepperColor = pepperColorForValue(value);

  return (
    <View style={{ marginBottom: 24 }}>
      <Text style={[styles.stepTitle, { color: theme.colors.onSurface }]}>{label}</Text>

      {(badLabel || goodLabel) ? (
        <View style={styles.pepperLabelsRow}>
          <Text style={[styles.pepperEdgeLabel, { color: theme.colors.onSurface }]}>
            {badLabel ?? ''}
          </Text>
          <Text style={[styles.pepperEdgeLabel, { color: theme.colors.onSurface }]}>
            {goodLabel ?? ''}
          </Text>
        </View>
      ) : null}

      <View style={styles.pepperOuter}>
        <View style={styles.pepperVisualWrapper} pointerEvents="none">
          <View style={styles.pepperBodyBase}>
            <View
              style={[
                styles.pepperFill,
                { width: `${progress * 100}%`, backgroundColor: pepperColor },
              ]}
            />
          </View>

          <View pointerEvents="none" style={[styles.pepperArrowContainer, { left: `${progress * 100}%` }]}>
            <View style={styles.pepperArrow} />
          </View>
        </View>

        <Slider
          value={value}
          minimumValue={1}
          maximumValue={10}
          step={1}
          onValueChange={(v) => onChange(Math.round(v))}
          minimumTrackTintColor="transparent"
          maximumTrackTintColor="transparent"
          thumbTintColor="rgba(255,255,255,0.001)"
          style={styles.pepperSliderGesture}
        />
      </View>

      {description ? (
        <Text style={[styles.sliderDescription, { color: theme.colors.onSurface }]}>{description}</Text>
      ) : null}
    </View>
  );
}

function SelectableTagChips({ options, selectedId, onSelect }) {
  const theme = useTheme();

  if (!options?.length) {
    return <Text style={{ opacity: 0.7, textAlign: 'center' }}>No tags available.</Text>;
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 6 }}>
      <Button
        key="tag-none"
        compact
        mode={selectedId == null ? 'contained' : 'outlined'}
        style={[styles.tagChip, selectedId == null && { opacity: 0.95 }]}
        onPress={() => onSelect?.(null)}
      >
        No tag
      </Button>

      {(options || []).map((opt) => {
        const id = opt?.id;
        const label = String(opt?.label ?? opt?.tag ?? '').trim() || String(id);

        return (
          <Button
            key={`tag-${id}`}
            compact
            mode={Number(selectedId) === Number(id) ? 'contained' : 'outlined'}
            style={styles.tagChip}
            onPress={() => onSelect?.(id)}
          >
            {label}
          </Button>
        );
      })}
    </ScrollView>
  );
}

/* NumberWheel */
function NumberWheel({ value, onChange, min = 1, max = 50, itemWidth = 48, visibleItems = 7 }) {
  const theme = useTheme();
  const listRef = useRef(null);

  const data = useMemo(() => Array.from({ length: max - min + 1 }, (_, i) => min + i), [min, max]);
  const pad = Math.floor(visibleItems / 2);
  const containerW = itemWidth * visibleItems;

  useEffect(() => {
    const idx0 = Math.max(0, Math.min(data.length - 1, data.indexOf(value)));
    const offset = idx0 * itemWidth;
    requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset, animated: false }));
  }, [value, data, itemWidth]);

  const handleSnap = (x) => {
    const idx0 = Math.max(0, Math.min(data.length - 1, Math.round(x / itemWidth)));
    const snappedOffset = idx0 * itemWidth;
    listRef.current?.scrollToOffset({ offset: snappedOffset, animated: true });
    const val = data[idx0];
    if (val !== value) onChange?.(val);
  };

  return (
    <View style={{ width: containerW, height: 44, alignSelf: 'center' }}>
      <FlatList
        ref={listRef}
        horizontal
        data={data}
        keyExtractor={(it) => String(it)}
        bounces={false}
        showsHorizontalScrollIndicator={false}
        snapToInterval={itemWidth}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: pad * itemWidth }}
        getItemLayout={(_d, index) => ({ length: itemWidth, offset: index * itemWidth, index })}
        onMomentumScrollEnd={(e) => handleSnap(e.nativeEvent.contentOffset.x)}
        onScrollEndDrag={(e) => handleSnap(e.nativeEvent.contentOffset.x)}
        renderItem={({ item }) => {
          const diff = Math.abs(item - value);
          const isCenter = diff === 0;
          const isNear = diff <= 2;
          const opacity = isCenter ? 1 : isNear ? 0.6 : 0.25;
          const color = isCenter ? '#FF6F00' : theme.colors.onSurface;
          const fontSize = isCenter ? 24 : isNear ? 18 : 14;

          return (
            <View style={{ width: itemWidth, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
              <Text style={{ fontSize, fontWeight: '900', color, opacity, textAlign: 'center' }}>
                {item}
              </Text>
            </View>
          );
        }}
      />
    </View>
  );
}

function DialogHeaderArrow({ title, onBack }) {
  const theme = useTheme();
  return (
    <View style={styles.dialogHeader}>
      <Pressable onPress={onBack} hitSlop={10} style={styles.dialogBackBtn}>
        <MaterialCommunityIcons name="arrow-left" size={26} color={theme.colors.primary} />
      </Pressable>

      <View style={{ flex: 1, paddingRight: 32 }}>
        <Text style={styles.dialogTitleText} numberOfLines={2}>
          {title}
        </Text>
      </View>
    </View>
  );
}

/**
 * RatingWizardDialog
 *
 * Props:
 * - visible: boolean
 * - destinationName: string
 * - tagOptions: array<{id, tag}>
 * - saving: boolean
 * - onDismiss: () => void
 * - onFinalize: (payload) => void | Promise<void>
 *
 * Payload shape:
 * {
 *   scores: { crispiness, sauce, meat, overall },
 *   sauceStyle,
 *   flavorVibe,
 *   spiceLevel,
 *   wingsEaten,
 *   selectedTagId,
 *   wouldOrderAgain
 * }
 */
export default function RatingWizardDialog({
  visible,
  destinationName,
  tagOptions = [],
  saving = false,
  onDismiss,
  onFinalize,
}) {
  const theme = useTheme();
  const surface = theme.colors.surface;

  const totalSteps = 10;
  const [step, setStep] = useState(0);

  const [scores, setScores] = useState({ crispiness: 1, sauce: 1, meat: 1, overall: 1 });
  const [sauceStyle, setSauceStyle] = useState(2);
  const [flavorVibe, setFlavorVibe] = useState([]);
  const [spiceLevel, setSpiceLevel] = useState(5);
  const [wouldOrderAgain, setWouldOrderAgain] = useState(null);
  const [wingsEaten, setWingsEaten] = useState(6);
  const [selectedTagId, setSelectedTagId] = useState(null);

  const sliderDescriptions = useMemo(
    () => ({
      sauce: 'How tasty and balanced was the sauce? Think flavor, heat, and cling.',
      crispiness: 'How crunchy were the wings? No one wants soggy breading.',
      meat: 'How juicy and high-quality was the chicken itself?',
      overall: 'The wing experience, presentation, aroma, overall vibe, all rolled together.',
    }),
    []
  );

  const sliderEdges = useMemo(
    () => ({
      sauce: { bad: 'Bleh', good: 'Unforgettable' },
      crispiness: { bad: 'Soggy', good: 'Crunchy' },
      meat: { bad: 'Foul', good: 'Five-star' },
      overall: { bad: 'Never Again', good: 'Back Tomorrow' },
    }),
    []
  );

  // Reset state on open, so every destination starts clean
  useEffect(() => {
    if (!visible) return;
    setStep(0);
    setScores({ crispiness: 1, sauce: 1, meat: 1, overall: 1 });
    setSauceStyle(2);
    setFlavorVibe([]);
    setSpiceLevel(5);
    setWouldOrderAgain(null);
    setWingsEaten(6);
    setSelectedTagId(null);
  }, [visible]);

  const goBack = () => {
    if (saving) return;
    if (step === 0) onDismiss?.();
    else setStep((s) => Math.max(0, s - 1));
  };

  const goNext = async () => {
    if (saving) return;
    if (step < totalSteps - 1) {
      setStep((s) => Math.min(totalSteps - 1, s + 1));
      return;
    }

    const payload = {
      scores: {
        crispiness: toNumber(scores.crispiness),
        sauce: toNumber(scores.sauce),
        meat: toNumber(scores.meat),
        overall: toNumber(scores.overall),
      },
      sauceStyle,
      flavorVibe: Array.isArray(flavorVibe) ? flavorVibe : [],
      spiceLevel: toNumber(spiceLevel, 5),
      wingsEaten: wingsEaten == null ? null : Number(wingsEaten),
      selectedTagId: selectedTagId ?? null,
      wouldOrderAgain: wouldOrderAgain == null ? null : !!wouldOrderAgain,
    };

    await onFinalize?.(payload);
  };

  return (
    <Dialog
      visible={visible}
      onDismiss={() => {
        if (!saving) onDismiss?.();
      }}
      style={[styles.dialog, { backgroundColor: surface }]}
    >
      <DialogHeaderArrow title={destinationName || 'Rate this stop'} onBack={goBack} />

      <Dialog.Content>
        <ProgressBar progress={(step + 1) / totalSteps} style={styles.ratingProgress} />

        <View style={{ marginTop: 16 }}>
          {step === 0 ? (
            <View>
              <Text style={styles.stepTitle}>Sauce Style</Text>
              <View style={styles.choiceRow}>
                <Button
                  compact
                  mode={sauceStyle === 1 ? 'contained' : 'outlined'}
                  style={styles.choiceBtn}
                  onPress={() => setSauceStyle(1)}
                >
                  Dry
                </Button>
                <Button
                  compact
                  mode={sauceStyle === 2 ? 'contained' : 'outlined'}
                  style={styles.choiceBtn}
                  onPress={() => setSauceStyle(2)}
                >
                  Neither
                </Button>
                <Button
                  compact
                  mode={sauceStyle === 3 ? 'contained' : 'outlined'}
                  style={styles.choiceBtn}
                  onPress={() => setSauceStyle(3)}
                >
                  Saucy
                </Button>
              </View>
              <Text style={styles.stepDescription}>Pick the overall style.</Text>
            </View>
          ) : null}

          {step === 1 ? (
            <SliderRowPretty
              label={sauceStyle === 1 ? 'Rub' : 'Sauce'}
              value={scores.sauce}
              description={
                sauceStyle === 1
                  ? 'How good was the rub? Balance, punch, and how it stuck to the wing.'
                  : sliderDescriptions.sauce
              }
              badLabel={sliderEdges.sauce.bad}
              goodLabel={sliderEdges.sauce.good}
              onChange={(v) => setScores((s) => ({ ...s, sauce: v }))}
            />
          ) : null}

          {step === 2 ? (
            <SliderRowPretty
              label="Crispiness"
              value={scores.crispiness}
              description={sliderDescriptions.crispiness}
              badLabel={sliderEdges.crispiness.bad}
              goodLabel={sliderEdges.crispiness.good}
              onChange={(v) => setScores((s) => ({ ...s, crispiness: v }))}
            />
          ) : null}

          {step === 3 ? (
            <SliderRowPretty
              label="Chicken Quality"
              value={scores.meat}
              description={sliderDescriptions.meat}
              badLabel={sliderEdges.meat.bad}
              goodLabel={sliderEdges.meat.good}
              onChange={(v) => setScores((s) => ({ ...s, meat: v }))}
            />
          ) : null}

          {step === 4 ? (
            <SliderRowPretty
              label="Overall Experience"
              value={scores.overall}
              description={sliderDescriptions.overall}
              badLabel={sliderEdges.overall.bad}
              goodLabel={sliderEdges.overall.good}
              onChange={(v) => setScores((s) => ({ ...s, overall: v }))}
            />
          ) : null}

          {step === 5 ? (
            <View>
              <Text style={styles.stepTitle}>Flavor Vibe</Text>
              <Text style={styles.stepDescription}>Choose up to 2 vibes that best describe the wing.</Text>

              <View style={styles.vibeGrid}>
                {[
                  { i: 0, label: '🔥 Spicy' },
                  { i: 1, label: '🍯 Sweet' },
                  { i: 2, label: '🧄 Savory / Garlic' },
                  { i: 3, label: '🍋 Tangy' },
                  { i: 4, label: '🧈 Buttery' },
                  { i: 5, label: '🌿 Herb-forward' },
                ].map((v) => {
                  const vibeVal = v.i + 1; // store 1..6
                  const on = Array.isArray(flavorVibe) && flavorVibe.includes(vibeVal);
                  return (
                    <Button
                      key={v.i}
                      mode={on ? 'contained' : 'outlined'}
                      compact
                      style={styles.vibeBtn}
                      onPress={() => setFlavorVibe((arr) => toggleInArray(arr, vibeVal, 2))}
                    >
                      {v.label}
                    </Button>
                  );
                })}
              </View>
            </View>
          ) : null}

          {step === 6 ? (
            <SliderRowPretty
              label="Spice Level"
              value={spiceLevel}
              badLabel="Mild"
              goodLabel="Face Melting"
              onChange={setSpiceLevel}
            />
          ) : null}

          {step === 7 ? (
            <View style={{ alignItems: 'center' }}>
              <Text style={styles.stepTitle}>Wings Eaten</Text>
              <NumberWheel value={wingsEaten ?? 1} onChange={setWingsEaten} min={1} max={50} />
              <Button mode="text" compact onPress={() => setWingsEaten(null)} style={{ marginTop: 8 }}>
                Skip wings
              </Button>
              <Text style={styles.stepDescription}>Rough count is fine, this just adds a fun stat.</Text>
            </View>
          ) : null}

          {step === 8 ? (
            <View style={{ marginTop: 4 }}>
              <Text style={styles.stepTitle}>Tag</Text>
              <Text style={styles.stepDescription}>
                Add a quick tag to describe this stop, or leave it as No tag.
              </Text>
              <View style={{ marginTop: 8 }}>
                <SelectableTagChips options={tagOptions} selectedId={selectedTagId} onSelect={setSelectedTagId} />
              </View>
            </View>
          ) : null}

          {step === 9 ? (
            <View>
              <Text style={styles.stepTitle}>Go back again?</Text>
              <View style={styles.thumbRow}>
                <Pressable
                  onPress={() => setWouldOrderAgain(true)}
                  style={[styles.thumbChoice, wouldOrderAgain === true && styles.thumbChoiceOn]}
                >
                  <Text style={styles.thumbIcon}>👍</Text>
                  <Text style={styles.thumbText}>Yes</Text>
                </Pressable>

                <Pressable
                  onPress={() => setWouldOrderAgain(false)}
                  style={[styles.thumbChoice, wouldOrderAgain === false && styles.thumbChoiceOn]}
                >
                  <Text style={styles.thumbIcon}>👎</Text>
                  <Text style={styles.thumbText}>No</Text>
                </Pressable>
              </View>
              <Text style={styles.stepDescription}>
                Quick gut-check, would you come back for these wings?
              </Text>
            </View>
          ) : null}
        </View>
      </Dialog.Content>

      <Dialog.Actions style={{ justifyContent: 'space-between', paddingHorizontal: 8 }}>
        <Button mode="text" disabled={saving} onPress={goBack}>
          {step === 0 ? 'Cancel' : 'Back'}
        </Button>

        <Button mode="contained" loading={saving} disabled={saving} onPress={goNext}>
          {step < totalSteps - 1 ? 'Next' : 'Finalize'}
        </Button>
      </Dialog.Actions>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  dialog: {
    alignSelf: 'center',
    width: '92%',
    maxWidth: 520,
    borderRadius: 16,
  },
  dialogHeader: {
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dialogBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogTitleText: {
    fontWeight: '900',
    fontSize: 18,
    textAlign: 'center',
  },
  ratingProgress: {
    height: 6,
    borderRadius: 999,
    marginBottom: 4,
  },
  stepTitle: {
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
  },
  stepDescription: {
    textAlign: 'center',
    fontSize: 12,
    marginTop: 6,
    opacity: 0.75,
  },

  pepperLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  pepperEdgeLabel: {
    fontSize: 11,
    opacity: 0.85,
  },
  pepperOuter: {
    marginTop: 2,
    marginBottom: 6,
    height: 44,
    justifyContent: 'center',
  },
  pepperVisualWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  pepperBodyBase: {
    height: 26,
    backgroundColor: '#050505',
    borderTopLeftRadius: 24,
    borderBottomLeftRadius: 30,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 6,
    overflow: 'hidden',
    transform: [{ skewX: '-10deg' }, { scaleY: 1.05 }],
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  pepperFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderBottomLeftRadius: 30,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 6,
  },
  pepperArrowContainer: {
    position: 'absolute',
    top: -4,
    transform: [{ translateX: -6 }],
  },
  pepperArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#ffffff',
  },
  pepperSliderGesture: {
    ...StyleSheet.absoluteFillObject,
  },
  sliderDescription: {
    textAlign: 'center',
    fontSize: 12,
    marginTop: 4,
    opacity: 0.8,
  },

  vibeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  vibeBtn: {
    width: '48%',
    borderRadius: 12,
  },

  thumbRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  thumbChoice: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  thumbChoiceOn: {
    borderColor: '#FF6F00',
    backgroundColor: 'rgba(255,111,0,0.18)',
  },
  thumbIcon: { fontSize: 26 },
  thumbText: { marginTop: 6, fontWeight: '800' },

  choiceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 10,
  },
  choiceBtn: { flex: 1, borderRadius: 12 },

  tagChip: { marginRight: 8, borderRadius: 999 },
});