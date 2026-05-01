import React, { useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, Pressable, Animated, Easing, Image } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';

export default function CoinRewardModal({
  visible,
  coins,
  onClose,
  onClaim,
}) {
  const { colors, dark } = useTheme();

  const scale = useRef(new Animated.Value(0.1)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;

    scale.setValue(0.1);
    opacity.setValue(0);

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.25,
          duration: 180,
          easing: Easing.out(Easing.back(1.6)),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1.05,
          duration: 120,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [visible, opacity, scale]);

  if (!visible) return null;

  const bg = dark ? 'rgba(0,0,0,0.72)' : 'rgba(0,0,0,0.55)';
  const cardBg = dark ? 'rgba(25,25,30,0.95)' : 'rgba(255,255,255,0.95)';

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Dim background - tap to close */}
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: bg }]} onPress={onClose} />

      {/* Center pop */}
      <View style={styles.centerWrap} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: cardBg,
              borderColor: dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
              opacity,
              transform: [{ scale }],
            },
          ]}
        >
          <View style={styles.coinRow}>
            <Image
              source={require('../assets/Buffago-token.png')}
              style={styles.coinImg}
              resizeMode="contain"
            />
            <Text style={[styles.plusText, { color: colors.primary }]}>+{coins}</Text>
          </View>

          <Text style={styles.title}>Coins Earned!</Text>

          <View style={styles.actions}>
            {onClaim ? (
              <Button mode="contained" onPress={onClaim} style={styles.btn} contentStyle={{ paddingVertical: 10 }}>
                Claim
              </Button>
            ) : null}

            <Button mode={onClaim ? 'outlined' : 'contained'} onPress={onClose} style={styles.btn} contentStyle={{ paddingVertical: 10 }}>
              Exit
            </Button>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centerWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  card: {
    width: '92%',
    maxWidth: 420,
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    alignItems: 'center',
  },
  coinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  coinImg: { width: 64, height: 64 },
  plusText: { fontSize: 34, fontWeight: '900' },
  title: { fontSize: 18, fontWeight: '900', marginTop: 2 },
  sub: { marginTop: 6, opacity: 0.75, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14, width: '100%' },
  btn: { flex: 1, borderRadius: 14 },
});
