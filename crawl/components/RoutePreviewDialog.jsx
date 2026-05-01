// components/RoutePreviewDialog.jsx
import React from 'react';
import { View, Dimensions } from 'react-native';
import { Dialog, Portal, Button, Text, Divider } from 'react-native-paper';

const ITEM_H = 56;
const HEADER_H = 56;
const ACTIONS_H = 64;
const PADDING_H = 24;
const MAX_VISIBLE = 5;

export function RoutePreviewDialog({ visible, onDismiss, routeTitle, stops = [], onStart }) {
  const screenH = Dimensions.get('window').height;
  const desiredHeight =
    HEADER_H + Math.min(stops.length, MAX_VISIBLE) * ITEM_H + ACTIONS_H + PADDING_H;
  const maxHeight = Math.min(desiredHeight, screenH * 0.9);
  const needsScroll = stops.length > MAX_VISIBLE;

  return (
    <Portal>
      <Dialog
        visible={visible}
        onDismiss={onDismiss}
        style={{ alignSelf: 'center', width: '94%', maxWidth: 480, borderRadius: 16, maxHeight }}
      >
        <Dialog.Title style={{ textAlign: 'center' }}>{routeTitle}</Dialog.Title>

        {needsScroll ? (
          <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}>
            <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
              {stops.map((s, i) => (
                <View key={s?.destination?.id ?? i} style={{ height: ITEM_H, justifyContent: 'center' }}>
                  <Text variant="titleSmall">{`${i + 1}. ${s?.destination?.name ?? 'Stop'}`}</Text>
                  {!!s?.destination?.address && (
                    <Text variant="bodySmall" style={{ opacity: 0.8 }}>{s.destination.address}</Text>
                  )}
                  {i < stops.length - 1 && <Divider style={{ marginTop: 12 }} />}
                </View>
              ))}
            </View>
          </Dialog.ScrollArea>
        ) : (
          <Dialog.Content style={{ paddingTop: 8 }}>
            <View style={{ paddingBottom: 8 }}>
              {stops.map((s, i) => (
                <View key={s?.destination?.id ?? i} style={{ height: ITEM_H, justifyContent: 'center' }}>
                  <Text variant="titleSmall">{`${i + 1}. ${s?.destination?.name ?? 'Stop'}`}</Text>
                  {!!s?.destination?.address && (
                    <Text variant="bodySmall" style={{ opacity: 0.8 }}>{s.destination.address}</Text>
                  )}
                  {i < stops.length - 1 && <Divider style={{ marginTop: 12 }} />}
                </View>
              ))}
            </View>
          </Dialog.Content>
        )}

        <Dialog.Actions style={{ justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 }}>
          <Button onPress={onDismiss} mode="text" style={{ borderRadius: 10 }}>Close</Button>
          {!!onStart && (
            <Button onPress={onStart} mode="contained" style={{ borderRadius: 12 }}>
              Start Crawl
            </Button>
          )}
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
