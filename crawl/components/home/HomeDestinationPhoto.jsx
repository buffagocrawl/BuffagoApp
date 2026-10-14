import React, { useEffect, useMemo, useState } from 'react';
import { Pressable } from 'react-native';
import { WingShotImage } from '../ui/OperationUI';
import WingdexPhotoViewer from '../WingdexPhotoViewer';

export default function HomeDestinationPhoto({ photo, restaurantName, style }) {
  const [open, setOpen] = useState(false);
  const photos = useMemo(() => photo ? [photo] : [], [photo]);
  useEffect(() => { setOpen(false); }, [photo?.submission_id, photo?.destination_id]);
  if (!photo?.submission_id || !photo.signed_url) return null;
  return <>
    <Pressable testID="home-destination-photo" accessibilityRole="button" accessibilityLabel={`Open photo of ${restaurantName}`}
      onPress={() => setOpen(true)}>
      <WingShotImage approved uri={photo.signed_url} style={style} />
    </Pressable>
    {open ? <WingdexPhotoViewer photos={photos} selectedId={photo.submission_id} restaurantName={restaurantName}
      onClose={() => setOpen(false)} /> : null}
  </>;
}
