// Synthetic gallery photos for opt-in native gesture QA. No production media.
import { Image } from 'react-native';

const galleryQA = typeof process !== 'undefined' && process.env.EXPO_PUBLIC_BUFFAGO_NATIVE_GALLERY_QA === '1';
const destinationId = 'fixture-spot-0';
const makePhoto = (submission_id, asset, created_at) => ({
  submission_id, destination_id: destinationId, media_type: 'photo', status: 'approved',
  signed_url: Image.resolveAssetSource(asset).uri, expires_at: '2099-01-01T00:00:00Z',
  like_count: 0, dislike_count: 0, created_at,
});

export default galleryQA ? {
  restaurant: { id: destinationId, name: 'QA Harbor Wings', city: 'Buffalo', state_id: 1,
    state_code: 'NY', address: '1 Fixture Street', lat: 42.8874, lng: -78.8784 },
  gallery: { destination_id: destinationId, picture_count: 2, approved_submission_count: 2,
    images: [
      makePhoto('fixture-photo-1', require('../../../assets/wing-user.png'), '2026-10-08T12:00:00Z'),
      makePhoto('fixture-photo-2', require('../../../assets/logo/BuffaGo-master.png'), '2026-10-08T12:01:00Z'),
    ] },
} : null;
