// components/SliderRowPretty.jsx
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';
import { useTheme } from 'react-native-paper';

/* Color helper: green → yellow/orange → red */
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

/* Pepper style slider row */
export default function SliderRowPretty({ label, value, onChange, description, badLabel, goodLabel }) {
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
            <View style={[styles.pepperFill, { width: `${progress * 100}%`, backgroundColor: pepperColor }]} />
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

const styles = StyleSheet.create({
  stepTitle: { textAlign: 'center', fontSize: 20, fontWeight: '800', marginBottom: 4 },

  pepperLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  pepperEdgeLabel: { fontSize: 11, opacity: 0.85 },

  pepperOuter: { marginTop: 2, marginBottom: 6, height: 44, justifyContent: 'center' },
  pepperVisualWrapper: { position: 'absolute', left: 0, right: 0 },
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
  pepperArrowContainer: { position: 'absolute', top: -4, transform: [{ translateX: -6 }] },
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
  pepperSliderGesture: { ...StyleSheet.absoluteFillObject },
  sliderDescription: { textAlign: 'center', fontSize: 12, marginTop: 4, opacity: 0.8 },
});
