// components/RoutesWelcomeWizard.tsx
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Portal, Dialog, Text, Button, Chip, ProgressBar } from 'react-native-paper';
import { useRouter } from 'expo-router';

type Step = {
  title: string;
  body?: React.ReactNode;
  bullets?: string[];
  chips?: string[];
  footer?: React.ReactNode;
  primaryCta?: { label: string; onPress?: () => void };
};

export default function RoutesWelcomeWizard({
  visible = true,
  onDone,
  onSkip,
}: {
  visible?: boolean;
  onDone: () => void;
  onSkip?: () => void;
}) {
  const router = useRouter();
  const [i, setI] = useState(0);

  const steps: Step[] = useMemo(
    () => [
      {
        title: '🗺️ Welcome to Routes',
        body: (
          <Text style={{ textAlign: 'center', fontSize: 16, lineHeight: 22 }}>
            Browse all available crawls near you. Use the{' '}
            <Text style={{ fontWeight: '700' }}>tags at the top</Text> (like walking or drivable)
            to make the list more manageable.
          </Text>
        ),
        chips: ['Walking', 'Drivable'],
      },
      {
        title: '🔍 Explore a Route',
        body: (
          <Text style={{ textAlign: 'center', fontSize: 16, lineHeight: 22 }}>
            Tap any route to open its description and review the stops before you pick it. Yellow
            highlighted routes are ones you started. Green highlighted routes are ones you completed,
            but you can do these again!
          </Text>
        ),
        bullets: ['Open details', 'Review stops'],
      },
      {
        title: '✅ Set Your Home Start',
        body: (
          <Text style={{ textAlign: 'center', fontSize: 16, lineHeight: 22 }}>
            Like what you see? Tap <Text style={{ fontWeight: '700' }}>Select this route</Text> and
            it will update the Big Orange Button on Home to start at the first stop.
          </Text>
        ),
        chips: ['Updates Home', 'Start at Stop #1'],
      },
      {
        title: '💡 Suggest a Route',
        body: (
          <Text style={{ textAlign: 'center', fontSize: 16, lineHeight: 22 }}>
            Couldn’t find your route? At the bottom,{' '}
            <Text style={{ fontWeight: '700' }}>Submit a Route</Text> with up to five restaurants
            for review. It might make the list!
          </Text>
        ),
        primaryCta: { label: 'Jump to Submit', onPress: () => router.push('/routes') },
        footer: (
          <Text style={{ textAlign: 'center', fontSize: 13, opacity: 0.8, marginTop: 8 }}>
            Happy crawling!
          </Text>
        ),
      },
    ],
    [router]
  );

  const total = steps.length;
  const step = steps[i];
  const isFirst = i === 0;
  const isLast = i === total - 1;

  return (
    <Portal>
      <Dialog
        visible={visible}
        dismissable={false}
        style={{ borderRadius: 22, alignSelf: 'center', width: '94%', maxWidth: 480 }}
      >
        <Dialog.Title style={{ textAlign: 'center' }}>{step.title}</Dialog.Title>

        <Dialog.Content style={{ paddingTop: 0 }}>
          <ProgressBar progress={(i + 1) / total} style={{ height: 6, borderRadius: 6, marginBottom: 12 }} />

          {step.body ? <View style={{ marginBottom: 12 }}>{step.body}</View> : null}

          {step.bullets?.length ? (
            <View style={{ gap: 8, marginBottom: 12 }}>
              {step.bullets.map((b, idx) => (
                <Text key={idx} style={{ textAlign: 'center' }}>
                  • {b}
                </Text>
              ))}
            </View>
          ) : null}

          {step.chips?.length ? (
            <View
              style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginBottom: 12 }}
            >
              {step.chips.map((c, idx) => (
                <Chip key={idx} compact>
                  {c}
                </Chip>
              ))}
            </View>
          ) : null}

          {step.footer ?? null}

          {step.primaryCta ? (
            <View style={{ alignItems: 'center', marginTop: 10 }}>
              <Button mode="outlined" style={{ borderRadius: 14 }} onPress={step.primaryCta.onPress}>
                {step.primaryCta.label}
              </Button>
            </View>
          ) : null}
        </Dialog.Content>

        <Dialog.Actions style={{ justifyContent: 'space-between', paddingBottom: 14, paddingHorizontal: 12 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {!isFirst ? (
              <Button mode="text" onPress={() => setI((n) => Math.max(0, n - 1))}>
                Back
              </Button>
            ) : (
              <View />
            )}
          </View>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            {!!onSkip && (
              <Button
                mode="text"
                onPress={() => {
                  onSkip?.();
                  onDone?.();
                }}
              >
                Skip
              </Button>
            )}
            {isLast ? (
              <Button mode="contained" onPress={onDone} style={{ borderRadius: 14 }}>
                Done
              </Button>
            ) : (
              <Button mode="contained" onPress={() => setI((n) => Math.min(total - 1, n + 1))} style={{ borderRadius: 14 }}>
                Next
              </Button>
            )}
          </View>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
