import { File as ExpoFile } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

export type WingShotMediaKind = 'photo';

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
  chooseFromLibrary: (options: {
    allowedMediaKinds?: WingShotMediaKind[];
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

function assertPermission(permission: ImagePicker.PermissionResponse, code: 'camera_permission_denied' | 'library_permission_denied') {
  if (!permission.granted) {
    throw new WingShotMediaAdapterError(
      code,
      'Media permission was not granted.',
    );
  }
}

function abortIfNeeded(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new WingShotMediaAdapterError('upload_cancelled', 'Upload cancelled.');
  }
}

async function selectedMediaFromAsset(
  asset: ImagePicker.ImagePickerAsset,
): Promise<WingShotSelectedMedia> {
  if (asset.type !== 'image') {
    throw new WingShotMediaAdapterError(
      'unsupported_media_type',
      'Choose a standard photo (JPEG, PNG, WebP, or HEIC).',
    );
  }
  const kind: WingShotMediaKind = 'photo';
  // Decode and normalize camera/library photos before preview and upload.
  // Native photos commonly exceed the server's 2048px edge limit.
  const context = ImageManipulator.manipulate(asset.uri);
  if (Math.max(asset.width, asset.height) > 2048) {
    context.resize(asset.width >= asset.height ? { width: 2048 } : { height: 2048 });
  }
  const rendered = await context.renderAsync();
  const prepared = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
  const nativeFile = Platform.OS === 'web' ? null : new ExpoFile(prepared.uri);
  const webFile = Platform.OS === 'web' ? await (await fetch(prepared.uri)).blob() : null;
  const sizeBytes = nativeFile?.size ?? webFile?.size ?? 0;
  const mimeType = 'image/jpeg';
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
    uri: prepared.uri,
    fileName: 'wing-shot.jpg',
    kind,
    mimeType: mimeType.toLowerCase(),
    sizeBytes,
    width: prepared.width || undefined,
    height: prepared.height || undefined,
    getUploadBody: async (signal) => {
      abortIfNeeded(signal);
      if (Platform.OS !== 'web') {
        throw new WingShotMediaAdapterError(
          'media_reader_unavailable',
          'Native media is uploaded directly from its local URI.',
        );
      }
      if (!webFile) {
        throw new WingShotMediaAdapterError(
          'media_reader_unavailable',
          'Browser media bytes are unavailable.',
        );
      }
      const body = await webFile.arrayBuffer();
      abortIfNeeded(signal);
      return body;
    },
  };
}

function firstSelection(result: ImagePicker.ImagePickerResult) {
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) {
    throw new WingShotMediaAdapterError(
      'picker_failed',
      'The media picker did not return a file.',
    );
  }
  const selected = selectedMediaFromAsset(asset);
  return selected;
}

function safePickerFailure(error: unknown): never {
  if (error instanceof WingShotMediaAdapterError) throw error;
  throw new WingShotMediaAdapterError(
    'picker_failed',
    'The media picker could not be opened.',
  );
}

/**
 * Production adapter backed by the operating-system camera and photo picker.
 * Permission requests only occur inside these user-triggered methods.
 */
export const expoWingShotMediaAdapter: WingShotMediaAdapter = {
  async takePhoto() {
    try {
      assertPermission(await ImagePicker.requestCameraPermissionsAsync(), 'camera_permission_denied');
      return await firstSelection(
        await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          cameraType: ImagePicker.CameraType.back,
          allowsEditing: false,
          quality: 0.9,
          exif: false,
          base64: false,
        }),
      );
    } catch (error) {
      return safePickerFailure(error);
    }
  },

  async chooseFromLibrary() {
    try {
      assertPermission(await ImagePicker.requestMediaLibraryPermissionsAsync(false), 'library_permission_denied');
      return await firstSelection(
        await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsMultipleSelection: false,
          selectionLimit: 1,
          allowsEditing: false,
          quality: 0.9,
          exif: false,
          base64: false,
        }),
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
  chooseFromLibrary: unavailable,
};
