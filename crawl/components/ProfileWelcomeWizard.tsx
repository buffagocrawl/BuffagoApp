import React, { useMemo, useState, useCallback } from 'react';
import { View } from 'react-native';
import { Portal, Dialog, Text, Button, Chip, ProgressBar, useTheme } from 'react-native-paper';
import { useXpToast } from '../providers/XpToastProvider';
import { grantXp } from '../utils/xp';

type Step = {
  title: string;
  body?: React.ReactNode;
  bullets?: string[];
  chips?: string[];
  footer?: React.ReactNode;
  primaryCta?: { label: string; onPress?: () => void };
};

export default function ProfileWelcomeWizard({
  visible = true,
  onDone,
  onSkip,
  onAfterXpAward, // ⬅ NEW
}: {
  visible?: boolean;
  onDone: () => void;
  onSkip?: () => void;
  onAfterXpAward?: (amount: number) => void | Promise<void>; // ⬅ NEW
}) {
  const { colors } = useTheme();
  const xpToast = useXpToast();
  const [i, setI] = useState(0);

  const awardWelcomeXp = useCallback(async () => {
    try {
      const amount = 5;
      const reason = 'Welcome bonus';
      const nx = await grantXp(amount, reason);
      if (nx != null) {
        xpToast.show(amount, reason);
        await onAfterXpAward?.(amount); // ⬅ trigger parent refresh immediately
      }
    } catch (e: any) {
      console.warn('[XP] welcome grant failed', e?.message || e);
    }
  }, [xpToast, onAfterXpAward]);

  const steps: Step[] = useMemo(
    () => [
      {
        title: '🏅 XP & Levels',
        body: (
          <Text style={{ textAlign: 'center', fontSize: 16, lineHeight: 22 }}>
            Earn <Text style={{ fontWeight: '700' }}>XP</Text> by doing crawls and rating wings.{' '}
            <Text style={{ fontWeight: '700' }}>XP pops up as toasts</Text> when you earn it. This XP
            levels up your wing status!
          </Text>
        ),
        bullets: [
          '+25 Rate a destination',
          '+5 Add a tag',
          '+15 First rating of the day',
          '+100 Complete a crawl',
          '+50 First time doing a route',
          '+500 Linking to FB',
        ],
        chips: ['XP', 'Levels', 'Toasts'],
        footer: (
          <Text style={{ textAlign: 'center', opacity: 0.7, marginTop: 8 }}>
            More bonuses coming (streaks, cities, sharing)!
          </Text>
        ),
      },
      {
        title: '👤 Your Wing Journey',
        body: (
          <Text style={{ textAlign: 'center', fontSize: 16, lineHeight: 22 }}>
            Track your <Text style={{ fontWeight: '700' }}>level, total XP, and history</Text>. See
            past crawls with progress and drill-downs comparing you vs. the crowd.
          </Text>
        ),
        bullets: ['Level & XP total', 'Past crawls', 'Detailed reports'],
        chips: ['History', 'Reports'],
      },
       {
         title: '🏆 Your Badges',
         body: (
           <Text style={{ textAlign: 'center', fontSize: 16, lineHeight: 22 }}>
             Collect shiny badges for your milestones and track them anytime using the <Text style={{ fontWeight: '700' }}>Badges</Text> button below.
           </Text>
         ),
         bullets: ['Earn XP for every badge', 'View history & reports', 'Level up as you crawl!'],
         chips: ['Badges', 'History', 'Reports'],
       },
      {
        title: '🎯 Resume Your Crawl',
        body: (
          <Text style={{ textAlign: 'center', fontSize: 16, lineHeight: 22 }}>
            Tap <Text style={{ fontWeight: '700' }}>Open routes</Text> at the bottom of your Profile
            to quickly resume an in-progress crawl.
          </Text>
        ),
        chips: ['Open routes', 'Resume fast'],
        footer: (
          <Text style={{ textAlign: 'center', opacity: 0.7, marginTop: 8 }}>
            You’ll see “in progress” crawls highlighted.
          </Text>
        ),
      },
      {
        title: '📣 Coming Soon',
        body: (
          <Text style={{ textAlign: 'center', fontSize: 16, lineHeight: 22 }}>
            <Text style={{ fontWeight: '700' }}>Facebook linking</Text> to share crawls, invite
            friends, and earn bonus XP for social wins.
          </Text>
        ),
        bullets: ['Share your crawl', 'Invite friends', 'Bonus XP'],
        chips: ['FB', 'Sharing', 'Bonuses'],
        footer: (
          <Text style={{ textAlign: 'center', opacity: 0.7, marginTop: 8 }}>
            Keep an eye on updates!
          </Text>
        ),
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
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: 6,
                marginBottom: 12,
              }}
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

        <Dialog.Actions
          style={{ justifyContent: 'space-between', paddingBottom: 14, paddingHorizontal: 12 }}
        >
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
                onPress={async () => {
                  await awardWelcomeXp(); // +5 XP and parent refresh
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
