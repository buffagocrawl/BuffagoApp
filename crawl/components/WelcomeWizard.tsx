// components/WelcomeWizard.tsx
import React, { useMemo, useState, useCallback } from 'react';
import { View } from 'react-native';
import { Portal, Dialog, Text, Button, Chip, ProgressBar } from 'react-native-paper';

type Step = {
  title: string;
  body?: React.ReactNode;
  bullets?: string[];
  chips?: string[]; // example "tags"
  footer?: React.ReactNode;
};

export default function WelcomeWizard({
  onDone,
  onSkip,
  visible = true,
}: {
  onDone: () => void;
  onSkip?: () => void;
  visible?: boolean;
}) {
  const [i, setI] = useState(0);

  // Eat taps so example chips never trigger anything behind the dialog.
  const eatTap = useCallback(() => {}, []);

  const steps: Step[] = useMemo(
    () => [
      {
        title: '🍗 Welcome to BuffaGo!',
        body: (
          <Text style={{ textAlign: 'center', fontSize: 16, lineHeight: 22 }}>
            BuffaGo is about connecting over great wings. Socialize with friends or family as you
            explore new restaurants — whether you dash through a crawl in one night or stretch it
            out at your own pace.
          </Text>
        ),
      },
      {
        title: '🧭 What is BuffaGo?',
        body: (
          <Text style={{ textAlign: 'center', fontSize: 16, lineHeight: 22 }}>
            Find nearby wing crawls, rate each stop, and see how you stack up.
          </Text>
        ),
        bullets: [
          'Pick a crawl and get started',
          'Rate wings on crispiness, sauce, and overall',
          'Save progress and resume anytime',
          'Not locked to just one crawl at a time',
          'You pick the speed, take 1 day or 1 month',
        ],
      },
      {
        title: '📍 Browse & Start',
        body: (
          <Text style={{ textAlign: 'center', fontSize: 16, lineHeight: 22 }}>
            Use the <Text style={{ fontWeight: '700' }}>Crawls</Text> tab to browse and choose the crawl for you!
            Once you’re ready, tap the{' '}
            <Text style={{ fontWeight: '700' }}>big orange button</Text> on the Home tab to begin.
          </Text>
        ),
      },
      {
        title: '🧑‍🍳 Restaurant Info',
        body: (
          <Text style={{ textAlign: 'center', fontSize: 16, lineHeight: 22 }}>
            Use the <Text style={{ fontWeight: '700' }}>Wingdex</Text> tab to see how others ranked
            their wings. Browse scores, tags, and top spots to plan your next stop.
          </Text>
        ),
        chips: ['Community ratings', 'Top spots', 'Filters & distance'],
        footer: (
          <Text style={{ textAlign: 'center', fontSize: 13, opacity: 0.8, marginTop: 8 }}>
            Tags are quick descriptors — they’re just shown here as examples.
          </Text>
        ),
      },
      {
        title: '👤 Personal Profile',
        body: (
          <Text style={{ textAlign: 'center', fontSize: 16, lineHeight: 22 }}>
            Your saved crawls and rating history live in the{' '}
            <Text style={{ fontWeight: '700' }}>Journey</Text> tab. Come back anytime to resume where
            you left off and review your Crawl Reports.
          </Text>
        ),
        footer: (
          <Text style={{ textAlign: 'center', fontSize: 13, opacity: 0.8, marginTop: 8 }}>
            Tip: You can complete crawls over days or weeks — progress is saved.
          </Text>
        ),
        chips: ['Stats & history', 'Saved crawls', 'Resume later'],
      },
      {
        title: '📸 Share Your Wing Shot',
        body: (
          <Text style={{ textAlign: 'center', fontSize: 16, lineHeight: 22 }}>
            After you rate a restaurant, you may be invited to add a photo or video of your wings.
            Follow BuffaGo on <Text style={{ fontWeight: '700' }}>Instagram</Text> and{' '}
            <Text style={{ fontWeight: '700' }}>Facebook</Text> to see whether your rating or video
            gets featured.
          </Text>
        ),
        chips: ['Photos & videos', 'Community features', 'Follow BuffaGo'],
        footer: (
          <Text style={{ textAlign: 'center', fontSize: 13, opacity: 0.8, marginTop: 8 }}>
            Features are reviewed before they are shared publicly.
          </Text>
        ),
      },
      {
        title: '🏁 Ready to Crawl?',
        body: (
          <Text style={{ textAlign: 'center', fontSize: 16, lineHeight: 22 }}>
            Grab your crew and have fun discovering your new favorite wing spots.
          </Text>
        ),
        chips: ['Have fun!', 'Be fair & honest', 'Share your favorites'],
      },
    ],
    []
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
        style={{
          borderRadius: 22,
          alignSelf: 'center',
          width: '94%',
          maxWidth: 480,
        }}
      >
        <Dialog.Title style={{ textAlign: 'center' }}>{step.title}</Dialog.Title>

        <Dialog.Content style={{ paddingTop: 0 }}>
          {/* Progress */}
          <ProgressBar progress={(i + 1) / total} style={{ height: 6, borderRadius: 6, marginBottom: 12 }} />

          {/* Body */}
          {step.body ? <View style={{ marginBottom: 12 }}>{step.body}</View> : null}

          {/* Bullets */}
          {step.bullets?.length ? (
            <View style={{ gap: 8, marginBottom: 12 }}>
              {step.bullets.map((b, idx) => (
                <Text key={idx} style={{ textAlign: 'center' }}>
                  • {b}
                </Text>
              ))}
            </View>
          ) : null}

          {/* Chips (example tags) */}
          {step.chips?.length ? (
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: 6,
                marginBottom: 12,
              }}
            >
              {step.chips.map((c, idx) => (
                <Chip key={idx} compact onPress={eatTap}>
                  {c}
                </Chip>
              ))}
            </View>
          ) : null}

          {/* Footer note */}
          {step.footer ?? null}
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
              <Button
                mode="contained"
                onPress={() => {
                  onDone?.();
                }}
                style={{ borderRadius: 14 }}
              >
                Done
              </Button>
            ) : (
              <Button
                mode="contained"
                onPress={() => setI((n) => Math.min(total - 1, n + 1))}
                style={{ borderRadius: 14 }}
              >
                Next
              </Button>
            )}
          </View>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
