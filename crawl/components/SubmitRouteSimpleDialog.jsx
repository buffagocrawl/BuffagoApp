import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Dialog, Portal, Text, TextInput, HelperText, useTheme } from 'react-native-paper';
import { supabase } from '../lib/supabase';

export default function SubmitRouteSimpleDialog({ visible, onClose, session }) {
  const { colors } = useTheme();
  const [stop1, setStop1] = useState('');
  const [stop2, setStop2] = useState('');
  const [stop3, setStop3] = useState('');
  const [stop4, setStop4] = useState('');
  const [stop5, setStop5] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const hasAny = !!(stop1.trim() || stop2.trim() || stop3.trim() || stop4.trim() || stop5.trim());

  useEffect(() => {
    if (!visible) {
      setStop1(''); setStop2(''); setStop3(''); setStop4(''); setStop5('');
      setSaving(false); setError('');
    }
  }, [visible]);

  const handleSubmit = async () => {
    setError('');
    if (!session?.user?.id) {
      onClose?.();
      return;
    }
    if (!hasAny) {
      setError('Please enter at least one restaurant.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        user_id: session.user.id,
        stop1: stop1.trim() || null,
        stop2: stop2.trim() || null,
        stop3: stop3.trim() || null,
        stop4: stop4.trim() || null,
        stop5: stop5.trim() || null,
      };
      const { error } = await supabase.from('route_submissions').insert(payload);
      if (error) throw error;
      onClose?.({ ok: true });
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={() => onClose?.()}>
        <Dialog.Title style={{ textAlign: 'center' }}>Submit a Route</Dialog.Title>
        <Dialog.Content>
          <Text style={{ marginBottom: 8 }}>
            Add up to five restaurants you think should be a wing crawl.
          </Text>

          <TextInput label="Stop 1" value={stop1} onChangeText={setStop1} style={{ marginBottom: 8 }} />
          <TextInput label="Stop 2" value={stop2} onChangeText={setStop2} style={{ marginBottom: 8 }} />
          <TextInput label="Stop 3" value={stop3} onChangeText={setStop3} style={{ marginBottom: 8 }} />
          <TextInput label="Stop 4" value={stop4} onChangeText={setStop4} style={{ marginBottom: 8 }} />
          <TextInput label="Stop 5" value={stop5} onChangeText={setStop5} style={{ marginBottom: 8 }} />

          <HelperText type={hasAny ? 'info' : 'error'} visible>
            {hasAny ? 'Optional: you don’t need all five.' : 'At least one stop is required.'}
          </HelperText>

          {error ? <Text style={{ color: colors.error }}>{error}</Text> : null}
        </Dialog.Content>
        <Dialog.Actions style={{ justifyContent: 'space-between' }}>
          <Button onPress={() => onClose?.()}>Cancel</Button>
          <Button mode="contained" onPress={handleSubmit} disabled={!hasAny || saving} loading={saving}>
            Submit
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
