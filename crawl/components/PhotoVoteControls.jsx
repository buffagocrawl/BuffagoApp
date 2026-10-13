import React from 'react';
import { View } from 'react-native';
import { Button } from 'react-native-paper';

export const PHOTO_VERDICTS = [
  { value: -1, label: 'Dislike', icon: 'thumb-down-outline', count: 'dislike_count' },
  { value: 0, label: 'Average', icon: 'minus-circle-outline', count: 'neutral_count' },
  { value: 1, label: 'Like', icon: 'thumb-up-outline', count: 'like_count' },
];

export default function PhotoVoteControls({ photo, onVote, disabled, showCounts = true, testPrefix = 'photo-vote' }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 4 }}>
    {PHOTO_VERDICTS.map(({ value, label, icon, count }) => <Button key={value} compact icon={icon}
      testID={testPrefix.startsWith('photo-preview-') ? `photo-preview-${label.toLowerCase()}-${testPrefix.slice(14)}`
        : testPrefix === 'photo-vote' ? `photo-vote-${label.toLowerCase()}` : `${testPrefix}-${value}`} contentStyle={{ minHeight: 44 }}
      mode={photo?.current_vote === value ? 'contained' : 'outlined'}
      accessibilityLabel={showCounts ? `${label}, ${photo?.[count] ?? 0}` : label}
      accessibilityState={{ selected: photo?.current_vote === value, disabled: Boolean(disabled) }}
      disabled={disabled} onPress={(event) => { event?.stopPropagation?.(); onVote(value); }}>
      {label}{showCounts ? ` ${photo?.[count] ?? 0}` : ''}
    </Button>)}
  </View>;
}
