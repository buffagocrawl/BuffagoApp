import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import type { WingShotSelectedMedia } from '../components/wingShots/mediaAdapter';
import { WingShotClientError } from './wingShots.js';
import { wingShotLog, sanitizedObjectPath } from './wingShotDiagnostics.js';
import { invokeWithOneAuthRefresh } from './wingShotFunctionAuth.js';

export const WING_SHOT_STAGING_BUCKET = 'wing-shot-staging';

export type WingShotStagedMedia = {
  bucket: string;
  objectPath: string;
  correlationId: string;
  uploadCompleted: boolean;
};

function safeStatus(error: unknown) {
  return Number((error as { status?: number; statusCode?: number })?.status ?? (error as { statusCode?: number })?.statusCode) || null;
}

export async function stageWingShotMedia({
  client,
  media,
  correlationId,
  destinationId,
  signal,
  onProgress = (_value: number) => {},
}: {
  client: any;
  media: WingShotSelectedMedia;
  correlationId: string;
  destinationId?: string | number | null;
  signal?: AbortSignal;
  onProgress?: (value: number) => void;
}): Promise<WingShotStagedMedia> {
  if (signal?.aborted) throw new WingShotClientError('stale_validation_cancelled', 'Validation cancelled.', { stage: 'staging_upload' });
  const hasSession = Boolean((await client.auth.getSession()).data?.session);
  wingShotLog(correlationId, 'staging_authorization_started', { stage: 'staging_authorization', mediaType: media.kind, fileSizeBytes: media.sizeBytes, authenticatedSession: hasSession }, 'debug');
  const authorization = await invokeWithOneAuthRefresh(client, 'wing-media-stage-authorize', { correlationId, destinationId: destinationId ?? null, mediaType: media.kind, mimeType: media.mimeType, fileName: media.fileName ?? 'wing-shot', fileSizeBytes: media.sizeBytes }, correlationId);
  if (authorization.error || !authorization.data?.signedUploadUrl || !authorization.data?.objectPath) {
    const failure = authorization.__wingFailure || {};
    const reasonCode = failure.reasonCode || authorization.data?.reason_code || 'upload_authorization_failed';
    const error = new WingShotClientError(reasonCode, authorization.data?.message || failure.body?.message || 'Please sign in again to upload your Wing Shot.', { stage: failure.body?.stage || 'staging_authorization', cause: authorization.error, retryable: Boolean(authorization.data?.retryable || failure.body?.retryable), retryAfterSeconds: authorization.data?.retryAfterSeconds || failure.body?.retryAfterSeconds || failure.retryAfterSeconds, httpStatus: failure.status, serverCode: failure.body?.code || failure.body?.reason_code || reasonCode, serverMessage: failure.body?.message || null, correlationId: failure.body?.correlationId || correlationId });
    wingShotLog(correlationId, 'staging_upload_failed', { stage: 'staging_authorization', reasonCode: error.code, httpStatus: failure.status || safeStatus(authorization.error), serverCode: error.serverCode, serverStage: error.stage, authenticatedSession: hasSession, refreshAttempted: Boolean(failure.refreshAttempted), requestDispatched: true }, 'warn');
    throw error;
  }
  const { signedUploadUrl, objectPath, bucket = WING_SHOT_STAGING_BUCKET } = authorization.data;
  wingShotLog(correlationId, 'staging_authorization_received', { stage: 'staging_authorization', bucket, objectPath: sanitizedObjectPath(objectPath), mediaType: media.kind, fileSizeBytes: media.sizeBytes }, 'debug');
  if (signal?.aborted) throw new WingShotClientError('stale_validation_cancelled', 'Validation cancelled.', { stage: 'staging_upload' });

  wingShotLog(correlationId, 'staging_upload_started', { stage: 'staging_upload', bucket, objectPath: sanitizedObjectPath(objectPath), mediaType: media.kind, fileSizeBytes: media.sizeBytes }, 'debug');
  let lastLoggedProgress = -1;
  const reportProgress = (progress: number) => {
    const integerProgress = Math.max(0, Math.min(100, Math.round(progress)));
    onProgress(integerProgress);
    if (integerProgress !== lastLoggedProgress) {
      lastLoggedProgress = integerProgress;
      wingShotLog(correlationId, 'staging_upload_progress', { stage: 'staging_upload', bucket, objectPath: sanitizedObjectPath(objectPath), fileSizeBytes: media.sizeBytes, progressPercent: integerProgress }, 'debug');
    }
  };
  try {
    if (Platform.OS === 'web') {
      const body = await media.getUploadBody(signal);
      const response = await fetch(signedUploadUrl, { method: 'PUT', headers: { 'content-type': media.mimeType, 'cache-control': '3600' }, body: body as BodyInit, signal });
      if (!response.ok) throw Object.assign(new Error('staging upload failed'), { status: response.status });
      reportProgress(100);
    } else {
      const task = FileSystem.createUploadTask(
        signedUploadUrl,
        media.uri,
        { httpMethod: 'PUT', uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT, headers: { 'content-type': media.mimeType, 'cache-control': '3600' }, sessionType: FileSystem.FileSystemSessionType.BACKGROUND },
        ({ totalBytesSent, totalBytesExpectedToSend }) => {
          const progress = totalBytesExpectedToSend > 0 ? Math.round((totalBytesSent / totalBytesExpectedToSend) * 100) : 0;
          reportProgress(progress);
        },
      );
      const abort = () => { void task.cancelAsync(); };
      signal?.addEventListener('abort', abort, { once: true });
      const result = await task.uploadAsync();
      signal?.removeEventListener('abort', abort);
      if (!result || result.status < 200 || result.status >= 300) throw Object.assign(new Error('staging upload failed'), { status: result?.status });
      reportProgress(100);
    }
  } catch (cause) {
    if (signal?.aborted) throw new WingShotClientError('stale_validation_cancelled', 'Validation cancelled.', { stage: 'staging_upload', cause });
    const error = new WingShotClientError('staging_upload_failed', 'The Wing Shot upload could not finish.', { stage: 'staging_upload', cause });
    wingShotLog(correlationId, 'staging_upload_failed', { stage: 'staging_upload', bucket, objectPath: sanitizedObjectPath(objectPath), fileSizeBytes: media.sizeBytes, httpStatus: safeStatus(cause), reasonCode: error.code }, 'warn');
    throw error;
  }
  wingShotLog(correlationId, 'staging_upload_completed', { stage: 'staging_upload', bucket, objectPath: sanitizedObjectPath(objectPath), mediaType: media.kind, fileSizeBytes: media.sizeBytes }, 'debug');
  return { bucket, objectPath, correlationId, uploadCompleted: true };
}

export async function cleanupWingShotStaging({ client, staging, correlationId }: { client: any; staging: WingShotStagedMedia; correlationId: string }) {
  wingShotLog(correlationId, 'staging_cleanup_started', { stage: 'staging_cleanup', bucket: staging.bucket, objectPath: sanitizedObjectPath(staging.objectPath) }, 'debug');
  try {
    const result = await invokeWithOneAuthRefresh(client, 'wing-media-staging-cleanup', { bucket: staging.bucket, objectPath: staging.objectPath, correlationId }, correlationId);
    if (result.error) wingShotLog(correlationId, 'staging_cleanup_failed', { stage: 'staging_cleanup', reasonCode: 'staging_cleanup_failed' }, 'warn');
    else wingShotLog(correlationId, 'staging_cleanup_completed', { stage: 'staging_cleanup', reasonCode: 'staging_cleanup_completed' }, 'debug');
  } catch (error) {
    wingShotLog(correlationId, 'staging_cleanup_failed', { stage: 'staging_cleanup', reasonCode: 'staging_cleanup_failed', httpStatus: safeStatus(error) }, 'warn');
  }
}
