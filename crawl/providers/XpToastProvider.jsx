import React, { createContext, useContext, useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { Snackbar, Text, Portal, useTheme } from 'react-native-paper';

const XpCtx = createContext({
  show: (_amount, _reason) => {},
  showMany: (_awards) => {},
  showText: (_text) => {},
});
export const useXpToast = () => useContext(XpCtx);

export default function XpToastProvider({ children }) {
  const theme = useTheme();

  const q = useRef([]); 
  const [visible, setVisible] = useState(false);
  const [msg, setMsg] = useState('');

  const processNext = useCallback(() => {
    if (visible) return;
    const next = q.current.shift();
    if (!next) return;
    setMsg(next);
    setVisible(true);
  }, [visible]);

  const show = useCallback((amount, reason) => {
    const r = reason ? ` • ${reason}` : '';
    q.current.push(`+${amount} XP${r}`);
    processNext();
  }, [processNext]);

  const showText = useCallback((text) => {
    q.current.push(text);
    processNext();
  }, [processNext]);

  const showMany = useCallback((awards) => {
    if (!awards?.length) return;
    // Combine into one multi-line high-contrast toast
    const lines = awards.map(a => `+${a.amount} XP${a.reason ? ` • ${a.reason}` : ''}`);
    showText(lines.join('\n'));
  }, [showText]);

  useEffect(() => {
    if (!visible) {
      const t = setTimeout(processNext, 120);
      return () => clearTimeout(t);
    }
  }, [visible, processNext]);

  // high-contrast, theme-safe colors
  const bg = useMemo(() => theme?.colors?.inverseSurface ?? (theme.dark ? '#2C2C2C' : '#121212'), [theme]);
  const fg = useMemo(() => theme?.colors?.inverseOnSurface ?? '#FFFFFF', [theme]);

  return (
    <XpCtx.Provider value={{ show, showMany, showText }}>
      {children}
      <Portal>
        <Snackbar
          visible={visible}
          onDismiss={() => setVisible(false)}
          duration={2600}
          style={{
            marginBottom: 24,
            marginHorizontal: 12,
            borderRadius: 12,
            backgroundColor: bg,
          }}
        >
          <Text style={{ color: fg, fontWeight: '800', lineHeight: 20 }}>
            {msg || '+XP earned!'}
          </Text>
        </Snackbar>
      </Portal>
    </XpCtx.Provider>
  );
}
