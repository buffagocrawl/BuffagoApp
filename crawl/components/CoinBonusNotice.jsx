import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button, Dialog, Portal, Text } from 'react-native-paper';
import { useAuth } from '../providers/AuthProvider';
import { supabase } from '../lib/supabase';

const BONUS_REASONS = ['Welcome Bonus — 100 BuffaCoins', 'Early Bird Bonus — 250 BuffaCoins'];

// Informational only. Never awards coins; only displays committed server ledger rows.
export default function CoinBonusNotice() {
  const { user } = useAuth();
  const [notice, setNotice] = useState(null);
  useEffect(() => {
    let active = true;
    setNotice(null);
    if (!user?.id) return;
    (async () => {
      const { data, error } = await supabase.from('buffacoin_ledger')
        .select('id, reason, delta').eq('user_id', user.id).in('reason', BONUS_REASONS);
      if (error) return;
      const { data: acknowledged, error: ackError } = await supabase.from('buffacoin_bonus_notice_ack')
        .select('ledger_id').eq('user_id', user.id);
      if (ackError) return;
      for (const row of data || []) {
        if (acknowledged?.some(ack => ack.ledger_id === row.id)) continue;
        if (await AsyncStorage.getItem(`buffago:bonus-notice:${user.id}:${row.id}`)) continue;
        const { data: wallet, error: walletError } = await supabase.from('buffacoin_wallets')
          .select('balance').eq('user_id', user.id).maybeSingle();
        if (active && !walletError) setNotice({ ...row, userId: user.id, balance: wallet?.balance ?? 0 });
        break;
      }
    })().catch(() => {});
    return () => { active = false; };
  }, [user?.id]);
  const dismiss = async () => {
    const current = notice;
    setNotice(null);
    if (current) {
      try {
        // RLS only accepts acknowledgement of this user's committed bonus.
        const { error } = await supabase.from('buffacoin_bonus_notice_ack').insert({ ledger_id: current.id, user_id: current.userId });
        if (!error || error.code === '23505') await AsyncStorage.setItem(`buffago:bonus-notice:${current.userId}:${current.id}`, '1');
      } catch { /* a later sign-in can retry if offline */ }
    }
  };
  return <Portal><Dialog visible={Boolean(notice && notice.userId === user?.id)} onDismiss={dismiss}>
    <Dialog.Title>{notice?.reason}</Dialog.Title>
    <Dialog.Content><Text>Your {notice?.delta} free BuffaCoins have been added. Balance: {notice?.balance} BuffaCoins. Use them to rate wings in Wingdex.</Text></Dialog.Content>
    <Dialog.Actions><Button onPress={dismiss}>Got it</Button></Dialog.Actions>
  </Dialog></Portal>;
}
