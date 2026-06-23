// app/profile/history/BadgesScreen.tsx
import React, { useEffect, useState } from 'react';
import { View, Image, Pressable, FlatList } from 'react-native';
import {
  ActivityIndicator,
  Text,
  Dialog,
  Portal,
  Button,
  Divider,
  useTheme,
} from 'react-native-paper';
import { supabase } from '../../../lib/supabase.js';
import { trackEvent } from '../../../lib/analytics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

type Badge = {
  badge_id: number;
  code: string;
  name: string;
  description: string | null;
  icon: string | null;       // filename or old path (we'll normalize)
  xp_reward: number;
  earned: boolean;
  earned_at: string | null;
  icon_url?: string | null;  // computed public URL for rendering
};

// ---------- ordering ----------
const BADGE_ORDER: number[] = [8, 31, 5, 6, 7, 27, 12, 24, 25];
const orderWeight = (b: Badge) => {
  const idx = BADGE_ORDER.indexOf(Number(b.badge_id));
  return idx >= 0 ? idx : 1000 + Number(b.badge_id);
};
const sortBadges = (arr: Badge[]) =>
  [...(arr || [])].sort((a, b) => {
    const wa = orderWeight(a);
    const wb = orderWeight(b);
    if (wa !== wb) return wa - wb;
    // stable tiebreakers
    if (a.earned !== b.earned) return a.earned ? -1 : 1; // earned first within same weight
    return Number(a.badge_id) - Number(b.badge_id);
  });

// ---------- icon helpers ----------
function normalizeIconKey(icon?: string | null): string | null {
  if (!icon) return null;
  const seg = icon.split('/').pop();
  return seg ? seg.toLowerCase() : null;
}

function iconToPublicUrl(icon?: string | null): string | null {
  const key = normalizeIconKey(icon);
  if (!key) return null;
  const { data } = supabase.storage.from('badge_icons').getPublicUrl(key);
  return data?.publicUrl ?? null;
}

// ---------- Shield component ----------
type ShieldProps = {
  size: number;              // outer size (width & height)
  fill: string;
  stroke: string;
  iconUrl?: string | null;
  iconSize?: number;
  iconOpacity?: number;
  iconBlur?: number;
};

function Shield({
  size,
  fill,
  stroke,
  iconUrl,
  iconSize = 44,
  iconOpacity = 1,
  iconBlur = 0,
}: ShieldProps) {
  // Path draws a classic shield; viewBox is 100x100 for easy scaling
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Path
          d="M50 5 L90 25 V55 C90 75 70 95 50 95 C30 95 10 75 10 55 V25 Z"
          fill={fill}
          stroke={stroke}
          strokeWidth={3}
        />
      </Svg>
      {iconUrl ? (
        <Image
          source={{ uri: iconUrl }}
          style={{
            position: 'absolute',
            width: iconSize,
            height: iconSize,
            opacity: iconOpacity,
          }}
          blurRadius={iconBlur}
        />
      ) : null}
    </View>
  );
}

export default function BadgesScreen() {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [active, setActive] = useState<Badge | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [activeCount, setActiveCount] = useState<number>(0);
  const [claimedActiveCount, setClaimedActiveCount] = useState<number>(0);
  const insets = useSafeAreaInsets();

  const theme = useTheme();
  const dark = !!theme.dark;

  // Earned greens (match destinations)
  const earnedCardBg   = dark ? '#133D2B' : '#E8F5E9';
  const earnedBorder   = dark ? '#2B7A59' : '#9AD8A5';
  const earnedName     = dark ? '#CFF3DD' : '#1B5E20';
  const earnedBadgeBg  = dark ? '#174F39' : '#D1FADF';
  const earnedBadgeTxt = dark ? '#CFF3DD' : '#0F6B3E';

  // Locked reds (match red accents from map/report)
  const lockedCardBg   = dark ? '#3A1212' : '#FFF5F5';
  const lockedBorder   = '#D32F2F';
  const lockedName     = dark ? '#F9DADA' : '#8A1C1C';
  const lockedBadgeBg  = dark ? '#3A1616' : '#FDE7E7';
  const lockedBadgeTxt = dark ? '#FFC1C1' : '#B71C1C';

  const lockedOpacity  = 0.22;

  async function loadAll() {
    setLoading(true);
    setErr(null);

    // Try unified view first (order in SQL doesn’t matter; we sort client-side)
    const { data, error } = await supabase
      .from('v_badges_for_user')
      .select('badge_id, code, name, description, icon, xp_reward, earned_at, earned');

    if (!error && Array.isArray(data)) {
      const withUrls = (data || []).map((b: any) => ({
        ...b,
        icon_url: iconToPublicUrl(b.icon),
      })) as Badge[];

      setBadges(sortBadges(withUrls));

      // Counts based on catalog + user_badges
      const { data: actRows, error: actErr } = await supabase
        .from('badge_catalog')
        .select('id')
        .eq('is_active', true);
      if (actErr) throw actErr;

      const actCount = Array.isArray(actRows) ? actRows.length : 0;
      let earnedActive = 0;

      const { data: s } = await supabase.auth.getUser();
      const uid = s?.user?.id ?? null;

      if (uid && actCount > 0) {
        const { data: eaRows, error: eaErr } = await supabase
          .from('user_badges')
          .select('badge_id')
          .in('badge_id', (actRows || []).map((r: any) => r.id))
          .eq('user_id', uid);
        if (eaErr) throw eaErr;
        earnedActive = Array.isArray(eaRows) ? eaRows.length : 0;
      }

      setActiveCount(actCount);
      setClaimedActiveCount(earnedActive);
      setLoading(false);
      return;
    }

    // Fallback: manual join if view is missing
    try {
      const { data: s } = await supabase.auth.getUser();
      const uid = s?.user?.id ?? null;

      const { data: catalog, error: cErr } = await supabase
        .from('badge_catalog')
        .select('id, code, name, description, icon, xp_reward, is_active');
      if (cErr) throw cErr;

      const earnedMap: Record<number, string> = {};
      if (uid) {
        const { data: ub, error: uErr } = await supabase
          .from('user_badges')
          .select('badge_id, earned_at')
          .eq('user_id', uid);
        if (uErr) throw uErr;
        for (const row of ub || []) earnedMap[row.badge_id] = row.earned_at;
      }

      const merged: Badge[] = (catalog || []).map((b: any) => ({
        badge_id: b.id,
        code: b.code,
        name: b.name,
        description: b.description,
        icon: b.icon,
        xp_reward: b.xp_reward ?? 0,
        earned: earnedMap[b.id] != null,
        earned_at: earnedMap[b.id] ?? null,
        icon_url: iconToPublicUrl(b.icon),
      }));

      setBadges(sortBadges(merged));

      const actRows = (catalog || []).filter((b: any) => b.is_active);
      setActiveCount(actRows.length);
      setClaimedActiveCount(actRows.filter((b: any) => earnedMap[b.id]).length);
    } catch (f: any) {
      setErr(String(f?.message || f));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!alive) return;
      await trackEvent({
        eventName: 'badge_viewed',
        screen: 'badges',
        metadata: { source_screen: 'profile_history', badge_id: null },
      });
      await loadAll();
    })();
    return () => { alive = false; };
  }, []);

  // === TILE LAYOUT ===
  const SHIELD_SIZE = 96;     // size of the shield shape
  const ICON_SIZE   = 44;     // icon centered inside shield
  const NAME_BOX_H  = 40;     // 2 lines of text
  const FOOTER_H    = 18;     // footer chip / label
  const CELL_PAD    = 8;

  const renderItem = ({ item }: { item: Badge }) => {
    const isEarned = !!item.earned;
    const earnedOn =
      isEarned && item.earned_at
        ? `${new Date(item.earned_at).toLocaleDateString()}`
        : null;

    const fill   = isEarned ? earnedCardBg  : lockedCardBg;
    const stroke = isEarned ? earnedBorder  : lockedBorder;
    const nameCl = isEarned ? earnedName    : lockedName;
    const chipBg = isEarned ? earnedBadgeBg : lockedBadgeBg;
    const chipTx = isEarned ? earnedBadgeTxt: lockedBadgeTxt;

    return (
      <Pressable
        onPress={() => {
          trackEvent({
            eventName: 'badge_viewed',
            screen: 'badges',
            metadata: {
              badge_id: item.badge_id,
              badge_code: item.code,
              earned: isEarned,
            },
          });
          setActive(item);
        }}
        style={{ flex: 1 / 3, padding: CELL_PAD }}
      >
        <View style={{ alignItems: 'center' }}>
          {/* Shield + icon */}
          <Shield
            size={SHIELD_SIZE}
            fill={fill}
            stroke={stroke}
            iconUrl={item.icon_url || undefined}
            iconSize={ICON_SIZE}
            iconOpacity={isEarned ? 1 : lockedOpacity}
            iconBlur={isEarned ? 0 : 2}
          />

          {/* Title */}
          <View style={{ height: NAME_BOX_H, width: '100%', paddingHorizontal: 6, justifyContent: 'center' }}>
            <Text
              variant="labelMedium"
              numberOfLines={2}
              style={{
                fontWeight: '700',
                textAlign: 'center',
                lineHeight: 16,
                color: nameCl,
              }}
            >
              {item.name}
            </Text>
          </View>

          {/* Footer chip */}
          <View style={{ height: FOOTER_H, justifyContent: 'center' }}>
            <View
              style={{
                alignSelf: 'center',
                paddingHorizontal: 10,
                paddingVertical: 2,
                borderRadius: 999,
                backgroundColor: chipBg,
              }}
            >
              <Text variant="labelSmall" style={{ color: chipTx }}>
                {isEarned ? earnedOn : 'Locked'}
              </Text>
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8 }}>Loading badges…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 8, paddingTop: insets.top + 8 }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 8, paddingBottom: 8 }}>
        <Text variant="titleSmall" style={{ fontWeight: '800' }}>
          {claimedActiveCount} / {activeCount} Active Badges Claimed
        </Text>
        <Text variant="bodySmall" style={{ opacity: 0.7, marginTop: 2 }}>
          Keep crawling—new shiny badges are just a wing away 🐔✨
        </Text>
      </View>
      <Divider style={{ marginBottom: 8, opacity: 0.5 }} />

      {err ? (
        <View style={{ alignItems: 'center', marginTop: 24 }}>
          <Text>Couldn’t load badges: {err}</Text>
          <Button style={{ marginTop: 8 }} mode="contained-tonal" onPress={loadAll}>
            Retry
          </Button>
        </View>
      ) : (
        <FlatList
          data={badges}
          numColumns={3}
          keyExtractor={(b) => String(b.badge_id)}
          renderItem={renderItem}
          columnWrapperStyle={{ gap: 8 }}
          contentContainerStyle={{ gap: 8, paddingBottom: 24 }}
        />
      )}

      {/* Details modal */}
      <Portal>
        <Dialog visible={!!active} onDismiss={() => setActive(null)}>
          <Dialog.Title>{active?.name}</Dialog.Title>
          <Dialog.Content>
            <Text>{active?.description ?? 'Keep exploring to unlock this badge.'}</Text>
            {active?.earned && active.earned_at && (
              <Text style={{ marginTop: 8 }}>
                Earned: {new Date(active.earned_at).toLocaleString()}
              </Text>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setActive(null)}>Close</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}
