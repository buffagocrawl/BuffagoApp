// app/profile/history/YearlyWingSummary.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Card,
  Text,
  Button,
  Divider,
  useTheme,
} from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../lib/supabase';

// simple param helper
const toStr = (v) => (Array.isArray(v) ? v[0] : v) ?? undefined;

export default function YearlyWingSummary() {
  const theme = useTheme();
  const isDark = !!theme.dark;
  const router = useRouter();
  const params = useLocalSearchParams();

  const [loading, setLoading] = useState(true);
  const [wings, setWings] = useState(0);

  // Start date & flag:
  // - Default: Jan 1 of current year
  // - If viewing self and account created THIS year after Jan 1: use created_at instead (first-year only)
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), 0, 1);
  });
  const [usingAccountStart, setUsingAccountStart] = useState(false);

  // Are we looking at self vs someone else?
  const [isViewingSelf, setIsViewingSelf] = useState(true);

  // --- Pull wings for target user from destination_ratings
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const paramUserId = toStr(params?.userId);

        const { data: s, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          console.log(
            '[YearlyWingSummary] getSession error:',
            sessionError.message || sessionError
          );
        }

        const sessionUser = s?.session?.user ?? null;
        const sessionUserId = sessionUser?.id ?? null;

        // Decide which user to show:
        // - If ?userId is passed, use that.
        // - Else, fall back to session user.
        const targetUserId = paramUserId || sessionUserId;

        if (!targetUserId) {
          if (alive) {
            setWings(0);
            setStartDate((prev) => prev); // Jan 1 default
            setUsingAccountStart(false);
            setIsViewingSelf(true);
            setLoading(false);
          }
          return;
        }

        const viewingSelf = !!sessionUserId && targetUserId === sessionUserId;
        if (alive) {
          setIsViewingSelf(viewingSelf);
        }

        const now = new Date();
        const year = now.getFullYear();
        const jan1 = new Date(year, 0, 1);

        let effectiveStart = jan1;
        let useAccountStart = false;

        // First-year behavior only for self (we know sessionUser.created_at)
        if (viewingSelf && sessionUser?.created_at) {
          const createdAt = new Date(sessionUser.created_at);
          const createdYear = createdAt.getFullYear();

          if (createdYear === year && createdAt > jan1) {
            effectiveStart = createdAt;
            useAccountStart = true;
          }
        }

        const startISO = effectiveStart.toISOString();
        const endISO = new Date(year + 1, 0, 1).toISOString();

        const { data, error } = await supabase
          .from('destination_ratings')
          .select('wings_eaten, created_at')
          .eq('user_id', targetUserId)
          .gte('created_at', startISO)
          .lt('created_at', endISO);

        if (error) throw error;

        const total = (data || []).reduce(
          (sum, r) => sum + (Number(r.wings_eaten) || 0),
          0
        );

        if (!alive) return;

        setStartDate(effectiveStart);
        setUsingAccountStart(useAccountStart);
        setWings(total);
      } catch (e) {
        console.warn('[YearlyWingSummary] load failed:', e?.message || e);
        if (alive) {
          setWings(0);
          setUsingAccountStart(false);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [params?.userId]);

  // --- Calculations & fun conversions
  const {
    year,
    daysElapsed,
    avgPerDay,
    calories,
    butterLbs,
    waterLiters,
    waterGallons,
    beers16ozRounded,
    moneyUSD,
    chickenLbs,
    sugarGramsRounded,
    comparisonLines,
  } = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const start = startDate || new Date(year, 0, 1);

    const daysElapsed = Math.max(
      1,
      Math.floor((now.getTime() - start.getTime()) / 86400000)
    );
    const avgPerDay = wings / daysElapsed;

    // Assumptions
    const CAL_PER_WING = 88;
    const TSP_BUTTER_PER_WING = 0.5; // tsp
    const TSP_PER_LB = 96; // ~2 cups per lb = 96 tsp
    const WATER_G_PER_WING = 64; // grams of water (~mL)
    const PRICE_PER_WING = 1.66;
    const CHICKEN_G_PER_WING = 100; // rough edible mass
    const SUGAR_G_PER_WING = 1.5; // grams sugar per wing

    const calories = wings * CAL_PER_WING;
    const butterLbs = (wings * TSP_BUTTER_PER_WING) / TSP_PER_LB;
    const waterLiters = (wings * WATER_G_PER_WING) / 1000;
    const waterGallons = waterLiters / 3.78541;
    const beers16ozRounded = Math.max(
      0,
      Math.ceil((waterLiters * 1000) / 473.176) // 16 oz ≈ 473.176 mL
    );
    const moneyUSD = wings * PRICE_PER_WING;
    const chickenLbs = (wings * CHICKEN_G_PER_WING) / 453.59237;
    const sugarGramsRounded = Math.ceil(wings * SUGAR_G_PER_WING);

    const comparisonLines = [];

    // 1) WING WEIGHT COMPARISON
    comparisonLines.push(wingWeightComparison(chickenLbs));

    // 2) WATER-as-BEER comparison
    if (beers16ozRounded >= 1) {
      comparisonLines.push(
        `🍺 If wings contained beer instead of water, you would have “drunk” about ${beers16ozRounded} can${beers16ozRounded !== 1 ? 's' : ''} of 16 oz IPA beer this year.`
      );
    }

    // 3) BUTTER: cost + churning
    const butterCost = butterLbs * 4;
    if (butterLbs >= 0.25) {
      const churnCalories = (butterLbs / 0.8) * 200; // ~200 calories per 0.8 lb
      comparisonLines.push(
        `🧈 If you hand-churned that ${butterLbs.toFixed(1)} lb of butter, you’d burn about ${Math.round(
          churnCalories
        ).toLocaleString()} calories doing it — or spend $${butterCost.toFixed(2)} buying it instead.`
      );
    }

    // 4) MONEY SPENT comparisons
    const moneyIdea = moneyComparison(moneyUSD);
    if (moneyIdea) {
      comparisonLines.push(
        `💸 You’ve spent roughly $${moneyUSD.toFixed(2)} this year — ${moneyIdea}`
      );
    }

    // 5) Boss message if >100 lb of wings
    if (chickenLbs > 100) {
      comparisonLines.push('👑 That’s a triple-digit wing haul. You are the Boss of Sauce.');
    }

    return {
      year,
      daysElapsed,
      avgPerDay,
      calories,
      butterLbs,
      waterLiters,
      waterGallons,
      beers16ozRounded,
      moneyUSD,
      chickenLbs,
      sugarGramsRounded,
      comparisonLines,
    };
  }, [wings, startDate]);

  const cardBg =
    theme.colors.elevation?.level2 ?? (isDark ? '#1f1f1f' : '#f7f7f8');
  const outline =
    theme.colors.outlineVariant ?? theme.colors.outline;

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8, opacity: 0.7 }}>
          Crunching your delicious year…
        </Text>
      </SafeAreaView>
    );
  }

  // --- Titles / subtitles depend on self vs other + whether we used account start
  const titleText = usingAccountStart
    ? isViewingSelf
      ? 'Wing Journey so far'
      : 'Wing Journey so far'
    : isViewingSelf
    ? 'Wing Journey This Year'
    : 'Wing Journey This Year';

  const subtitlePrefix = usingAccountStart
    ? isViewingSelf
      ? 'Since creating an account'
      : 'Since they created an account'
    : 'Since';

  const subtitleDateText = usingAccountStart
    ? formatDateLabelWithOrdinal(startDate)
    : formatDateLabel(startDate);

  const subtitleText = `${subtitlePrefix} ${subtitleDateText} (${daysElapsed} day${daysElapsed === 1 ? '' : 's'} ago)`;

  return (
    <SafeAreaView style={{ flex: 1 }}>
      {/* ✅ NEW: arrow + title on same line */}
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/profile');
          }}
          hitSlop={10}
          style={styles.backBtn}
        >
          <MaterialCommunityIcons
            name="arrow-left"
            size={26}
            color={theme.colors.primary}
          />
        </Pressable>

        <Text
          variant="titleLarge"
          numberOfLines={1}
          style={[
            styles.headerTitle,
            { color: theme.colors.primary },
          ]}
        >
          {titleText}
        </Text>

        {/* Spacer keeps title centered */}
        <View style={styles.headerRightSpacer} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {/* Scrollable section header (subtitle only now to avoid duplicate title) */}
        <View style={{ marginBottom: 10 }}>
          <Divider
            style={{
              marginTop: 8,
              marginBottom: 8,
              opacity: 0.6,
              width: '60%',
              alignSelf: 'center',
            }}
          />
          <Text style={{ textAlign: 'center', opacity: 0.7 }}>
            {subtitleText}
          </Text>
        </View>

        {/* Header tiles: Wings + Avg per day */}
        <View style={styles.headerTiles}>
          <View
            style={[
              styles.headerTile,
              { backgroundColor: cardBg, borderColor: outline },
            ]}
          >
            <Text style={styles.headerTileLabel} numberOfLines={1}>
              Wings Eaten
            </Text>
            <Text style={styles.headerTileNumber}>
              {formatNumber(wings)}
            </Text>
          </View>
          <View
            style={[
              styles.headerTile,
              { backgroundColor: cardBg, borderColor: outline },
            ]}
          >
            <Text style={styles.headerTileLabel} numberOfLines={1}>
              Daily Average
            </Text>
            <Text style={styles.headerTileNumber}>
              {Number.isFinite(avgPerDay) ? avgPerDay.toFixed(2) : '0.00'}
            </Text>
          </View>
        </View>

        {/* Numbers grid */}
        <View style={styles.factGrid}>
          <FactCard label="Butter" value={`${butterLbs.toFixed(2)} lb`} />
          <FactCard label="Water" value={`${waterGallons.toFixed(2)} gal`} />
          <FactCard label="Chicken Mass" value={`${chickenLbs.toFixed(1)} lb`} />
          <FactCard label="Money Spent" value={`$${moneyUSD.toFixed(2)}`} />
        </View>

        {/* Fun comparisons section */}
        <Card
          mode="elevated"
          style={[
            styles.card,
            { backgroundColor: cardBg, borderColor: outline },
          ]}
        >
          <Card.Content>
            <Text
              style={{
                fontWeight: '800',
                marginBottom: 6,
                textAlign: 'center',
              }}
            >
              BuffaGo Comparisons
            </Text>
            <Divider style={{ marginBottom: 8 }} />
            {comparisonLines.length ? (
              comparisonLines.map((c, i) => (
                <Text key={i} style={{ marginBottom: 6, textAlign: 'center' }}>
                  {c}
                </Text>
              ))
            ) : (
              <Text style={{ textAlign: 'center' }}>
                Keep munching — your epic comparisons are warming up!
              </Text>
            )}
          </Card.Content>
        </Card>

        <View style={{ height: 12 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------- helpers ---------- */

function FactCard({ label, value }) {
  const theme = useTheme();
  const isDark = !!theme.dark;
  const cardBg =
    theme.colors.elevation?.level1 ?? (isDark ? '#222' : '#fff');
  const outline =
    theme.colors.outlineVariant ?? theme.colors.outline;

  return (
    <Card
      mode="elevated"
      style={[
        styles.factCard,
        { backgroundColor: cardBg, borderColor: outline },
      ]}
    >
      <Card.Content>
        <Text style={styles.factLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.factValue}>{value}</Text>
      </Card.Content>
    </Card>
  );
}

function wingWeightComparison(chickenLbs) {
  const w = Math.max(0, Number(chickenLbs) || 0);
  const desc = weightRangeText(w);
  return `🍗 You’ve eaten ~${w.toFixed(1)} lb — ${desc}`;
}

function weightRangeText(w) {
  if (w < 10)
    return 'you’re warming up—keep going for some fun weight matchups!';
  if (w < 20) return 'about the weight of a full-grown pumpkin.';
  if (w < 30) return 'roughly a car tire’s worth of wings in weight.';
  if (w < 40)
    return 'around a small cinder block (but infinitely tastier).';
  if (w < 50)
    return 'comparable to a medium bag of dog food — wings edition.';
  if (w < 60) return 'about a golden retriever’s weight… in wings.';
  if (w < 70)
    return 'like a carry-on suitcase maxed out — wing mass achieved.';
  if (w < 80) return 'about the weight of a lightweight bicycle.';
  if (w < 90) return 'a loaded sled’s worth of wings.';
  if (w < 100)
    return 'like a big block of ice — but much more delicious.';
  return 'a cosmic amount of wings — ground control is impressed.';
}

function moneyComparison(usd) {
  if (usd > 800) return 'that’s a used gaming PC or a budget weekend getaway.';
  if (usd > 500) return 'that’s a current-gen console (or close).';
  if (usd > 300) return 'that’s AirPods Pro or a couple of fancy dinners.';
  if (usd > 200) return 'that’s a solid road-trip fuel budget.';
  if (usd > 120) return 'that’s a decent date night with dessert.';
  if (usd > 70) return 'that’s a new AAA video game.';
  if (usd > 40) return 'that’s a round of cocktails for friends.';
  if (usd > 20) return 'that’s a flight of gourmet burgers.';
  if (usd > 10) return 'that’s two ironically large wing platters.';
  return 'that’s a value-menu avalanche.';
}

function formatNumber(n) {
  return Number(n).toLocaleString();
}

// Simple "Jan 1" style
function formatDateLabel(date) {
  if (!date) return 'January 1';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

// "Oct 12th" style for the account-created variant
function formatDateLabelWithOrdinal(date) {
  if (!date) return 'January 1st';
  const d = date.getDate();
  const month = date.toLocaleString(undefined, { month: 'short' });

  let suffix = 'th';
  if (d % 10 === 1 && d !== 11) suffix = 'st';
  else if (d % 10 === 2 && d !== 12) suffix = 'nd';
  else if (d % 10 === 3 && d !== 13) suffix = 'rd';

  return `${month} ${d}${suffix}`;
}

/* ---------- styles ---------- */

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  headerTiles: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    marginBottom: 12,
  },
  headerTile: {
    flex: 1,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTileLabel: {
    fontWeight: '700',
    opacity: 0.75,
    letterSpacing: 0.2,
    fontSize: 12,
    lineHeight: 14,
    textAlign: 'center',
  },
  headerTileNumber: {
    fontSize: 32,
    fontWeight: '900',
    marginTop: 4,
    textAlign: 'center',
  },

  // ✅ NEW header row styles
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 2,
  },
  headerTitle: {
    flex: 1,
    fontWeight: '900',
    textAlign: 'center',
  },
  headerRightSpacer: {
    width: 38, // keeps title centered vs back button
  },

  backBtn: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    padding: 6,
  },

  factGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  factCard: {
    flexBasis: '48%',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  factLabel: {
    fontWeight: '700',
    opacity: 0.75,
    textAlign: 'center',
  },
  factValue: {
    fontWeight: '900',
    fontSize: 18,
    marginTop: 2,
    textAlign: 'center',
  },

  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
