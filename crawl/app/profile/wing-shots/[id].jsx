import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Button, Card, Text, useTheme } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import ScreenHeader from '../../../components/ScreenHeader';
import SubmissionStatusChip from '../../../components/creator/SubmissionStatusChip';
import {
  canWithdrawWingShot,
  loadMyWingShotDetail,
  requestPublishedWingShotReview,
  requestWingShotPreview,
  withdrawMyWingShot,
} from '../../../lib/wingCreator';
import { trackEvent } from '../../../lib/analytics';

function single(value) {
  return Array.isArray(value) ? value[0] : value;
}

function dateTime(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : 'Unavailable';
}

function attributionLabel(value) {
  if (value === 'anonymous') return 'Anonymous';
  if (value === 'display_name') return 'Display name';
  return 'BuffaGo username';
}

function isValidExternalPost(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return (
      parsed.protocol === 'https:' &&
      (host === 'instagram.com' ||
        host.endsWith('.instagram.com') ||
        host === 'facebook.com' ||
        host.endsWith('.facebook.com') ||
        host === 'fb.com' ||
        host.endsWith('.fb.com'))
    );
  } catch {
    return false;
  }
}

export default function WingShotDetailScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const theme = useTheme();
  const submissionId = single(params.id);
  const [detail, setDetail] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [reviewRequested, setReviewRequested] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextDetail = await loadMyWingShotDetail(submissionId);
      setDetail(nextDetail);
      setPreview(null);
      if (nextDetail.preview_available) {
        requestWingShotPreview(submissionId)
          .then(setPreview)
          .catch(() => setPreview(null));
      }
    } catch (loadError) {
      setError(loadError?.message || 'Could not load this Wing Shot.');
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

  useEffect(() => {
    load();
  }, [load]);

  const withdraw = useCallback(() => {
    if (!detail || !canWithdrawWingShot(detail.internal_status)) return;
    Alert.alert(
      'Withdraw this Wing Shot?',
      'It will leave the approval and publishing queue. Your rating stays saved. This cannot be undone.',
      [
        { text: 'Keep It', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              await withdrawMyWingShot({
                submissionId,
                expectedStatus: detail.internal_status,
              });
              trackEvent({
                eventName: 'wing_shot_submission_withdrawn',
                screen: 'wing_shot_detail',
                metadata: { prior_status: detail.internal_status },
              });
              await load();
            } catch (withdrawError) {
              Alert.alert(
                'Could not withdraw',
                withdrawError?.message || 'Please try again.'
              );
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  }, [detail, load, submissionId]);

  const requestPublishedReview = useCallback(() => {
    Alert.alert(
      'Request a content review?',
      'BuffaGo will review your posted Wing Shot and contact you through your account if more information is needed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Request',
          onPress: async () => {
            setActionLoading(true);
            try {
              await requestPublishedWingShotReview({ submissionId });
              setReviewRequested(true);
            } catch (reviewError) {
              Alert.alert(
                'Could not send request',
                reviewError?.message || 'Please try again.'
              );
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  }, [submissionId]);

  const openPost = useCallback(async () => {
    if (!isValidExternalPost(detail?.external_permalink)) return;
    const supported = await Linking.canOpenURL(detail.external_permalink);
    if (!supported) {
      Alert.alert('Link unavailable', 'This social post cannot be opened on this device.');
      return;
    }
    trackEvent({
      eventName: 'social_post_opened',
      screen: 'wing_shot_detail',
      metadata: { platform: detail.featured_platform || 'unknown' },
    });
    await Linking.openURL(detail.external_permalink);
  }, [detail]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
        <View testID="creator.detail.loading" style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Loading Wing Shot…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !detail) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
        <ScreenHeader title="Wing Shot" subtitle="Submission detail" />
        <View testID="creator.detail.error" style={styles.center}>
          <Text style={{ color: theme.colors.error, textAlign: 'center' }}>
            {error || 'This Wing Shot is not available.'}
          </Text>
          <Button onPress={load}>Retry</Button>
          <Button onPress={() => router.back()}>Back</Button>
        </View>
      </SafeAreaView>
    );
  }

  const externalPostAvailable = isValidExternalPost(detail.external_permalink);

  return (
    <SafeAreaView
      testID="creator.detail"
      style={[styles.safe, { backgroundColor: theme.colors.background }]}
      edges={['top']}
    >
      <ScreenHeader
        title={detail.destination_name || 'Wing Shot'}
        subtitle={`${detail.media_type === 'video' ? 'Video' : 'Photo'} submission`}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        {preview?.uri ? (
          <Image
            testID="creator.detail.preview"
            source={{ uri: preview.uri }}
            style={styles.preview}
            contentFit="cover"
            accessibilityLabel={`Private preview of your ${detail.media_type} Wing Shot`}
          />
        ) : detail.preview_available ? (
          <Card style={styles.previewFallback}>
            <Card.Content style={styles.previewFallbackContent}>
              <Text>Private preview is temporarily unavailable.</Text>
              <Button onPress={load}>Retry Preview</Button>
            </Card.Content>
          </Card>
        ) : null}

        <Card style={styles.card}>
          <Card.Content style={styles.content}>
            <SubmissionStatusChip status={detail.display_status} testID="creator.detail.status" />
            <Text variant="titleLarge" style={styles.title}>
              {detail.destination_name}
            </Text>
            {detail.destination_city ? (
              <Text style={styles.muted}>{detail.destination_city}</Text>
            ) : null}
            <View style={styles.detailRows}>
              <Text>Submitted: {dateTime(detail.created_at)}</Text>
              <Text>Attribution: {attributionLabel(detail.attribution_preference)}</Text>
              {detail.approved_at ? <Text>Approved: {dateTime(detail.approved_at)}</Text> : null}
              {detail.featured_at ? <Text>Featured: {dateTime(detail.featured_at)}</Text> : null}
            </View>
            {detail.user_caption ? (
              <View style={styles.caption}>
                <Text variant="labelLarge">Your caption</Text>
                <Text>{detail.user_caption}</Text>
              </View>
            ) : null}
          </Card.Content>
        </Card>

        {detail.display_status === 'Approved' ||
        detail.display_status === 'Not Selected Yet' ? (
          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                Approved for consideration
              </Text>
              <Text style={styles.body}>
                Jalapeño checks approved Wing Shots daily. Approval does not guarantee a feature.
              </Text>
            </Card.Content>
          </Card>
        ) : null}

        {detail.display_status === 'Rejected' ? (
          <Card testID="creator.detail.rejection" style={styles.card}>
            <Card.Content>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                Not selected for the approval queue
              </Text>
              <Text style={styles.body}>
                {detail.rejection_category || 'Not eligible for featuring'}
              </Text>
              <Text style={[styles.body, styles.nextStep]}>
                Your rating is still saved. You can submit a new Wing Shot after a future eligible
                in-person rating.
              </Text>
            </Card.Content>
          </Card>
        ) : null}

        {externalPostAvailable ? (
          <Button
            testID="creator.detail.open-featured-post"
            mode="contained"
            icon="open-in-new"
            onPress={openPost}
            contentStyle={styles.actionContent}
            accessibilityLabel={`Open featured post on ${detail.featured_platform || 'social media'}`}
          >
            Open Featured Post
          </Button>
        ) : null}

        {detail.can_withdraw && canWithdrawWingShot(detail.internal_status) ? (
          <Button
            testID="creator.detail.withdraw"
            mode="outlined"
            textColor={theme.colors.error}
            loading={actionLoading}
            disabled={actionLoading}
            onPress={withdraw}
            contentStyle={styles.actionContent}
            accessibilityLabel="Withdraw this unposted Wing Shot"
          >
            Withdraw Submission
          </Button>
        ) : null}

        {detail.internal_status === 'posted' ? (
          <Button
            testID="creator.detail.request-review"
            mode="outlined"
            loading={actionLoading}
            disabled={actionLoading || reviewRequested}
            onPress={requestPublishedReview}
            contentStyle={styles.actionContent}
            accessibilityLabel="Request a human review of this posted Wing Shot"
          >
            {reviewRequested ? 'Review Requested' : 'Request Content Review'}
          </Button>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center', gap: 10 },
  loadingText: { opacity: 0.72 },
  scroll: { padding: 16, paddingBottom: 44, gap: 14 },
  preview: { width: '100%', aspectRatio: 4 / 3, borderRadius: 18, backgroundColor: '#222' },
  previewFallback: { borderRadius: 18 },
  previewFallbackContent: { minHeight: 112, justifyContent: 'center', alignItems: 'center', gap: 6 },
  card: { borderRadius: 18 },
  content: { gap: 10 },
  title: { fontWeight: '850' },
  sectionTitle: { fontWeight: '800', marginBottom: 6 },
  muted: { opacity: 0.68 },
  detailRows: { gap: 6 },
  caption: { marginTop: 4, gap: 4 },
  body: { lineHeight: 21 },
  nextStep: { marginTop: 8, opacity: 0.8 },
  actionContent: { minHeight: 50 },
});
