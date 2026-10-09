import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

export default function ScreenHeader({
  title,
  subtitle = null,
  leftContent = null,
  rightContent = null,
  contentStyle = null,
  titleStyle = null,
  subtitleStyle = null,
}) {
  const theme = useTheme();

  return (
    <View style={[styles.header, { borderBottomColor: theme.colors.outlineVariant ?? theme.colors.outline }, contentStyle]}>
      <View style={styles.headerTopRow}>
        {leftContent ? <View style={styles.leftContent}>{leftContent}</View> : null}
        <View style={styles.textBlock}>
          <Text variant="titleLarge" style={[styles.title, titleStyle]}>
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
    paddingBottom: 8,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  textBlock: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontWeight: '800',
  },
  subtitle: {
    opacity: 0.8,
    marginTop: 2,
  },
  rightContent: {
    flexShrink: 0,
    alignSelf: 'center',
  },
  leftContent: {
    flexShrink: 0,
    alignSelf: 'center',
    marginLeft: -8,
  },
});
