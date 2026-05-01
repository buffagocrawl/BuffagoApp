// components/ThemeToggle.jsx
import React, { useState, useCallback } from 'react';
import { IconButton, Menu } from 'react-native-paper';
import { useThemeMode } from '../providers/ThemeProvider';

export default function ThemeToggle() {
  const { mode, setMode, toggleCycle } = useThemeMode();
  const [open, setOpen] = useState(false);

  const onOpen = useCallback(() => setOpen(true), []);
  const onClose = useCallback(() => setOpen(false), []);

  return (
    <Menu
      visible={open}
      onDismiss={onClose}
      // Use the classic anchor prop (compatible across Paper versions)
      anchor={
        <IconButton
          icon="theme-light-dark"
          accessibilityLabel="Theme menu"
          // Fast: tap cycles theme immediately (no Menu open)
          onPress={toggleCycle}
          // Long-press only when you want to choose explicitly
          onLongPress={onOpen}
        />
      }
      contentStyle={{ borderRadius: 12 }}
    >
      <Menu.Item
        onPress={() => { setMode('light'); onClose(); }}
        title={mode === 'light' ? '✓ Light' : 'Light'}
      />
      <Menu.Item
        onPress={() => { setMode('dark'); onClose(); }}
        title={mode === 'dark' ? '✓ Dark' : 'Dark'}
      />
      {/* If you support system mode, uncomment:
      <Menu.Item
        onPress={() => { setMode('system'); onClose(); }}
        title={mode === 'system' ? '✓ System' : 'System'}
      />
      */}
    </Menu>
  );
}
