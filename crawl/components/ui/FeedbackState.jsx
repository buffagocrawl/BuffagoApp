import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button, Text, useTheme } from 'react-native-paper';

export default function FeedbackState({
  icon = 'information-outline',
  title,
  body,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  compact = false,
  style,
}) {
  const theme = useTheme();
  const palette = useMemo(
    () => ({
      bg: theme.dark ? 'rgba(255,255,255,0.055)' : 'rgba(255,255,255,0.78)',
      border: theme.dark ? 'rgba(255,255,255,0.12)' : 'rgba(31,31,31,0.08)',
      iconBg: theme.dark ? 'rgba(255,126,71,0.16)' : '#FFE8D8',
      text: theme.colors.onSurface,
    }),
    [theme]
  );

  return (
    <View
      style={[
        styles.wrap,
        compact && styles.wrapCompact,
        { backgroundColor: palette.bg, borderColor: palette.border },
        style,
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: palette.iconBg }]}>
        <MaterialCommunityIcons name={icon} size={compact ? 24 : 30} color={theme.colors.primary} />
      </View>

      {!!title && (
        <Text style={[styles.title, { color: palette.text }]} numberOfLines={compact ? 2 : undefined}>
          {title}
        </Text>
      )}

      {!!body && (
        <Text style={[styles.body, { color: palette.text }]} numberOfLines={compact ? 3 : undefined}>
          {body}
        </Text>
      )}

      {(actionLabel || secondaryLabel) && (
        <View style={styles.actions}>
          {secondaryLabel ? (
            <Button mode="outlined" onPress={onSecondary} style={styles.button}>
              {secondaryLabel}
            </Button>
          ) : null}
          {actionLabel ? (
            <Button mode="contained" onPress={onAction} style={styles.button}>
              {actionLabel}
            </Button>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 22,
    paddingHorizontal: 18,
  },
  wrapCompact: {
    paddingVertical: 16,
    paddingHorizontal: 14,
  },
  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    fontWeight: '900',
    fontSize: 17,
    textAlign: 'center',
  },
  body: {
    opacity: 0.74,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 7,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginTop: 16,
  },
  button: {
    borderRadius: 14,
  },
});
