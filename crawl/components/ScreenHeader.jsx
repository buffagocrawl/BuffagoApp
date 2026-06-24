import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

export default function ScreenHeader({
  title,
  subtitle = null,
  rightContent = null,
  contentStyle = null,
  titleStyle = null,
  subtitleStyle = null,
}) {
  const theme = useTheme();

  return (
    <View style={[styles.header, { borderBottomColor: theme.colors.outlineVariant ?? theme.colors.outline }, contentStyle]}>
      <View style={styles.headerTopRow}>
        <View style={styles.textBlock}>
          <Text variant="headlineSmall" style={[styles.title, titleStyle]}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="bodySmall" style={[styles.subtitle, { color: theme.colors.onSurface }, subtitleStyle]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {rightContent ? <View style={styles.rightContent}>{rightContent}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  textBlock: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontWeight: '800',
  },
  subtitle: {
    opacity: 0.7,
    marginTop: 2,
  },
  rightContent: {
    flexShrink: 0,
    alignSelf: 'flex-start',
  },
});
