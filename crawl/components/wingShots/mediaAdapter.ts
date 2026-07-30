import { File as ExpoFile } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { WING_SHOT_VIDEO_MAX_SECONDS } from '../../lib/wingShots';

export type WingShotMediaKind = 'photo' | 'video';

export type WingShotSelectedMedia = {
  uri: string;
  fileName?: string;
  kind: WingShotMediaKind;
  mimeType: string;
  sizeBytes: number;
  durationSeconds?: number;
  width?: number;
  height?: number;
  thumbnailUri?: string;
  getUploadBody: (signal?: AbortSignal) => Promise<ArrayBuffer | Uint8Array | Blob>;
};

export type WingShotMediaAdapter = {
  takePhoto: () => Promise<WingShotSelectedMedia | null>;
  recordVideo: (options: {
    targetDurationSeconds: number;
    maximumDurationSeconds: number;
  }) => Promise<WingShotSelectedMedia | null>;
  chooseFromLibrary: (options: {
    maximumVideoDurationSeconds: number;
    allowedMediaKinds: WingShotMediaKind[];
  }) => Promise<WingShotSelectedMedia | null>;
};

export class WingShotMediaAdapterError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'WingShotMediaAdapterError';
    this.code = code;
  }
}

function assertPermission(permission: ImagePicker.PermissionResponse) {
  if (!permission.granted) {
    throw new WingShotMediaAdapterError(
      'permission_denied',
      'Media permission was not granted.',
    );
  }
}

function abortIfNeeded(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new WingShotMediaAdapterError('upload_cancelled', 'Upload cancelled.');
  }
}

function selectedMediaFromAsset(
  asset: ImagePicker.ImagePickerAsset,
): WingShotSelectedMedia {
  const kind =
    asset.type === 'image' ? 'photo' : asset.type === 'video' ? 'video' : null;
  if (!kind) {
    throw new WingShotMediaAdapterError(
      'unsupported_media_type',
      'Choose a standard photo or video.',
    );
  }
  const nativeFile = new ExpoFile(asset.uri);
  const sizeBytes = asset.fileSize ?? nativeFile.size;
  const mimeType = asset.mimeType || nativeFile.type;
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1) {
    throw new WingShotMediaAdapterError(
      'invalid_media_size',
      'The selected media size could not be verified.',
    );
  }
  if (!mimeType) {
    throw new WingShotMediaAdapterError(
      'unsupported_media_type',
      'The selected media type could not be verified.',
    );
  }
  return {
    uri: asset.uri,
    fileName: asset.fileName || undefined,
    kind,
    mimeType: mimeType.toLowerCase(),
    sizeBytes,
    durationSeconds:
      kind === 'video' && Number.isFinite(asset.duration)
        ? Number(asset.duration) / 1_000
        : undefined,
    width: asset.width || undefined,
    height: asset.height || undefined,
    getUploadBody: async (signal) => {
      abortIfNeeded(signal);
      const body = asset.file
        ? await asset.file.arrayBuffer()
        : await nativeFile.arrayBuffer();
      abortIfNeeded(signal);
      return body;
    },
  };
}

function firstSelection(
  result: ImagePicker.ImagePickerResult,
  allowedKinds: WingShotMediaKind[],
) {
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) {
    throw new WingShotMediaAdapterError(
      'picker_failed',
      'The media picker did not return a file.',
    );
  }
  const selected = selectedMediaFromAsset(asset);
  if (!allowedKinds.includes(selected.kind)) {
    throw new WingShotMediaAdapterError(
      'media_kind_disabled',
      'That media type is not enabled for Wing Shots.',
    );
  }
  return selected;
}

function safePickerFailure(error: unknown): never {
  if (error instanceof WingShotMediaAdapterError) throw error;
  throw new WingShotMediaAdapterError(
    'picker_failed',
    'The media picker could not be opened.',
  );
}

function enforceVideoDuration(
  media: WingShotSelectedMedia | null,
  maximumDurationSeconds: number,
) {
  if (
    media?.kind === 'video' &&
    Number.isFinite(media.durationSeconds) &&
    Number(media.durationSeconds) > Math.min(WING_SHOT_VIDEO_MAX_SECONDS, maximumDurationSeconds)
  ) {
    throw new WingShotMediaAdapterError(
      'video_too_long',
      'Keep your Wing Shot video to 10 seconds or less.',
    );
  }
  return media;
}

/**
 * Production adapter backed by the operating-system camera and photo picker.
 * Permission requests only occur inside these user-triggered methods.
 */
export const expoWingShotMediaAdapter: WingShotMediaAdapter = {
  async takePhoto() {
    try {
      assertPermission(await ImagePicker.requestCameraPermissionsAsync());
      return firstSelection(
        await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          cameraType: ImagePicker.CameraType.back,
          allowsEditing: false,
          quality: 0.9,
          exif: false,
          base64: false,
        }),
        ['photo'],
      );
    } catch (error) {
      return safePickerFailure(error);
    }
  },

  async recordVideo({ maximumDurationSeconds }) {
    try {
      assertPermission(await ImagePicker.requestCameraPermissionsAsync());
      return enforceVideoDuration(
        firstSelection(
          await ImagePicker.launchCameraAsync({
            mediaTypes: ['videos'],
            cameraType: ImagePicker.CameraType.back,
            allowsEditing: false,
            videoMaxDuration: Math.min(10, maximumDurationSeconds),
            videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
            exif: false,
            base64: false,
          }),
          ['video'],
        ),
        maximumDurationSeconds,
      );
    } catch (error) {
      return safePickerFailure(error);
    }
  },

  async chooseFromLibrary({
    allowedMediaKinds,
    maximumVideoDurationSeconds,
  }) {
    try {
      if (allowedMediaKinds.length === 0) {
        throw new WingShotMediaAdapterError(
          'media_kind_disabled',
          'Wing Shot uploads are not enabled.',
        );
      }
      assertPermission(await ImagePicker.requestMediaLibraryPermissionsAsync(false));
      const mediaTypes: ImagePicker.MediaType[] = [];
      if (allowedMediaKinds.includes('photo')) mediaTypes.push('images');
      if (allowedMediaKinds.includes('video')) mediaTypes.push('videos');
      return enforceVideoDuration(
        firstSelection(
          await ImagePicker.launchImageLibraryAsync({
            mediaTypes,
            allowsMultipleSelection: false,
            selectionLimit: 1,
            allowsEditing: false,
            quality: 0.9,
            exif: false,
            base64: false,
          }),
          allowedMediaKinds,
        ),
        maximumVideoDurationSeconds,
      );
    } catch (error) {
      return safePickerFailure(error);
    }
  },
};

const unavailable = async (): Promise<never> => {
  throw new WingShotMediaAdapterError(
    'media_dependency_unavailable',
    'Camera and library access need the app media adapter.',
  );
};

/**
 * Safe fallback while the native picker dependency is absent. It never asks
 * for permissions during import or render and never invents a selected file.
 */
export const unavailableWingShotMediaAdapter: WingShotMediaAdapter = {
  takePhoto: unavailable,
  recordVideo: unavailable,
  chooseFromLibrary: unavailable,
};
