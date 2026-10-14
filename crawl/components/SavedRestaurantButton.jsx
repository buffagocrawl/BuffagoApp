import React from 'react';
import { Button } from 'react-native-paper';
import { savedRestaurantLabel } from '../lib/savedRestaurantLabels';

export default function SavedRestaurantButton({ ratedByMe, isFavorite, isWantToTry, pending, restaurantName, onToggle, ...props }) {
  const selected = ratedByMe ? isFavorite : isWantToTry;
  const kind = ratedByMe ? 'favorites' : 'wantToTry';
  const label = savedRestaurantLabel(ratedByMe, selected);
  return <Button {...props} mode={selected ? 'contained-tonal' : 'outlined'}
    icon={ratedByMe ? (selected ? 'heart' : 'heart-outline') : (selected ? 'bookmark' : 'bookmark-outline')}
    disabled={pending} loading={pending} accessibilityState={{ selected: Boolean(selected) }}
    accessibilityLabel={`${selected ? 'Remove from' : 'Add to'} ${ratedByMe ? 'Favorites' : 'Want to Try'}: ${restaurantName}`}
    onPress={(event) => { event?.stopPropagation?.(); onToggle(kind, !selected); }}>
    {label}
  </Button>;
}
