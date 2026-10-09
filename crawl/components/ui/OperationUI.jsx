import React, { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, ProgressBar as PaperProgressBar, Text, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { operationTokens as tokens } from '../../src/theme/operationTokens';

export function SurfaceCard({ children, style, ...props }) {
  const theme = useTheme();
  return <View {...props} style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }, style]}>{children}</View>;
}
export function SectionHeader({ title, subtitle, action, style }) {
  const theme = useTheme();
  return <View style={[styles.section, style]}><View style={styles.flex}><Text variant="titleMedium" style={styles.bold}>{title}</Text>{subtitle ? <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{subtitle}</Text> : null}</View>{action}</View>;
}
export function StatCard({ label, value, icon, onPress, progress, children, style, ...props }) {
  const theme = useTheme();
  const content = <><View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>{icon ? <MaterialCommunityIcons name={icon} size={18} color={theme.colors.primary} /> : null}<Text style={styles.value}>{value ?? '—'}</Text></View><Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{label}</Text>{progress != null ? <ProgressBar progress={progress} /> : null}{children}</>;
  return onPress ? <Pressable {...props} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={[styles.card, styles.stat, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant, minHeight: tokens.touchTarget }, style]}>{content}</Pressable> : <SurfaceCard {...props} style={[styles.stat, style]}>{content}</SurfaceCard>;
}
export function ProgressBar({ progress = 0, style, ...props }) {
  const bounded = Number.isFinite(Number(progress)) ? Math.max(0, Math.min(1, Number(progress))) : 0;
  // Paper's web wrapper uses height:100%; a bounded parent prevents the bar
  // from occupying the whole card and pushing XP copy over the next section.
  return <View style={[styles.progress, style]}><PaperProgressBar {...props} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(bounded * 100) }} progress={bounded} style={styles.progress} /></View>;
}
export function StatusBadge({ label, status = 'neutral', tone, style }) {
  const theme = useTheme();
  status = tone || status;
  const color = status === 'completed' || status === 'success' ? (theme.dark ? tokens.colors.success : '#246838') : status === 'active' || status === 'in_progress' ? (theme.dark ? tokens.colors.orange : '#934000') : theme.colors.onSurfaceVariant;
  return <View style={[styles.badge, { borderColor: color }, style]}><Text variant="labelSmall" style={{ color }}>{label || status.replace(/_/g, ' ')}</Text></View>;
}
export function PrimaryButton({ style, contentStyle, ...props }) { return <Button {...props} mode="contained" style={[styles.button, style]} contentStyle={[styles.buttonContent, contentStyle]} />; }
export function SecondaryButton({ style, contentStyle, ...props }) { return <Button {...props} mode="outlined" style={[styles.button, style]} contentStyle={[styles.buttonContent, contentStyle]} />; }
export function SelectionChip({ selected, style, textStyle, children, icon, disabled, onPress, accessibilityLabel }) {
  const theme = useTheme();
  const color = selected ? theme.colors.onPrimary : theme.colors.onSurface;
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ selected: !!selected, disabled: !!disabled }} style={[{ flexShrink: 0, minHeight: 44, minWidth: 44, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: theme.colors.surfaceVariant, opacity: disabled ? 0.5 : 1 }, style, selected && { backgroundColor: theme.colors.primary }]}>{icon ? <MaterialCommunityIcons name={icon} size={18} color={color} /> : null}<Text style={[{ flexShrink: 0 }, textStyle, { color }]}>{children}</Text></Pressable>;
}
export function FilterChips({ options = [], value, onChange, style }) {
  const theme = useTheme();
  return <View style={{ minWidth: 0 }}><ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={[styles.filters, style]}>{options.map((option) => <SelectionChip key={option.value} selected={value === option.value} disabled={option.disabled} onPress={() => onChange?.(option.value)} accessibilityLabel={option.label} style={styles.chip}>{option.label}</SelectionChip>)}</ScrollView><Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Swipe for more options</Text></View>;
}
export function EmptyState({ title, body, icon = 'food-drumstick-outline', action, style }) {
  const theme = useTheme();
  return <SurfaceCard style={[styles.empty, style]}><MaterialCommunityIcons name={icon} size={28} color={theme.colors.primary} /><Text variant="titleMedium" style={styles.bold}>{title}</Text>{body ? <Text style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>{body}</Text> : null}{action}</SurfaceCard>;
}
export function LoadingSkeleton({ rows = 3, height, style }) {
  const theme = useTheme();
  return <View accessibilityLabel="Loading content" accessibilityState={{ busy: true }} style={[{ gap: 8 }, style]}>{Array.from({ length: rows }, (_, i) => <View key={i} style={{ height: height ?? (i === 0 ? 20 : 12), width: i === 0 ? '65%' : '90%', borderRadius: 6, backgroundColor: theme.colors.surfaceVariant }} />)}</View>;
}
// Callers supply media from approved-only gallery/feed loaders. Never resolve
// storage paths or private/pending submissions from a public discovery card.
export function WingShotImage({ uri, approved = false, style, accessibilityLabel = 'Approved Wing Shot' }) {
  const theme = useTheme();
  const [failedUri, setFailedUri] = useState(null);
  const visible = approved && typeof uri === 'string' && /^https:\/\//i.test(uri) && failedUri !== uri;
  return visible ? <Image source={{ uri }} accessibilityLabel={accessibilityLabel} resizeMode="cover" onError={() => setFailedUri(uri)} style={[styles.photo, { backgroundColor: theme.colors.surfaceVariant }, style]} /> : <View accessibilityLabel="Wing Shot unavailable" style={[styles.placeholder, { backgroundColor: theme.colors.surfaceVariant }, style, { height: undefined, aspectRatio: undefined, minHeight: 44, padding: 8 }]}><Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Wing Shot unavailable</Text></View>;
}
export function RestaurantCard({ title, subtitle, image, children, action, style, ...props }) { return <SurfaceCard {...props} style={style}><View style={styles.row}>{image}<View style={styles.flex}><Text variant="titleMedium" style={styles.bold}>{title}</Text>{subtitle ? <Text variant="bodySmall">{subtitle}</Text> : null}{children}</View></View>{action}</SurfaceCard>; }
export function CrawlCard({ title, subtitle, status, statusLabel, progress, children, action, style, ...props }) { return <SurfaceCard {...props} style={style}><View style={styles.row}><View style={styles.flex}><Text variant="titleMedium" style={styles.bold}>{title}</Text>{subtitle ? <Text variant="bodySmall">{subtitle}</Text> : null}</View>{status ? <StatusBadge status={status} label={statusLabel} /> : null}</View>{progress != null ? <ProgressBar progress={progress} /> : null}{children}{action}</SurfaceCard>; }
export function PlayerProgressCard({ level, title, xp, target, progress, action, onTitlePress, children, style }) {
  const theme = useTheme();
  return <SurfaceCard style={[{ gap: 6 }, style]}><View style={styles.row}><Pressable disabled={!onTitlePress} onPress={onTitlePress} accessibilityRole={onTitlePress ? 'button' : undefined} style={[styles.flex, { minWidth: 120, minHeight: 44, justifyContent: 'center' }]}><Text style={{ fontWeight: '700', fontSize: 16 }}>Level {level ?? '—'}{title ? ` · ${title}` : ''}</Text><ProgressBar progress={progress} /><Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{xp ?? '—'}{target != null ? ` / ${target}` : ''} XP</Text></Pressable>{action}</View>{children}</SurfaceCard>;
}
const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: tokens.radius.card, padding: 12, gap: 10 },
  section: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  flex: { flex: 1, minWidth: 0, gap: 3 }, row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  bold: { fontWeight: '800' }, stat: { flex: 1, flexBasis: '30%', minWidth: 96, gap: 4 }, value: { fontSize: 22, fontWeight: '800' },
  progress: { height: 6, borderRadius: 999 }, badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  button: { borderRadius: 12 }, buttonContent: { minHeight: tokens.touchTarget }, filters: { gap: 8, paddingVertical: 4 }, chip: { minHeight: tokens.touchTarget, justifyContent: 'center' },
  empty: { alignItems: 'center', paddingVertical: 24 }, photo: { width: 72, height: 72, borderRadius: 12 }, placeholder: { alignItems: 'center', justifyContent: 'center', gap: 4 },
});
