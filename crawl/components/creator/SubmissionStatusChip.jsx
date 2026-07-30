import React from 'react';
import { Chip, useTheme } from 'react-native-paper';

const STATUS_ICONS = {
  Processing: 'progress-clock',
  'In Review': 'shield-search',
  Approved: 'check-circle',
  Featured: 'star-circle',
  'Not Selected Yet': 'calendar-clock',
  Rejected: 'information',
  'Upload Failed': 'alert-circle',
  'Duplicate video': 'content-copy',
  'Video couldn’t be processed': 'alert-circle',
  Withdrawn: 'minus-circle',
};

export default function SubmissionStatusChip({ status, testID }) {
  const theme = useTheme();
  const label = status || 'Processing';
  const positive = label === 'Approved' || label === 'Featured';
  const caution = label === 'Rejected' || label === 'Upload Failed' || label === 'Duplicate video' || label === 'Video couldn’t be processed';

  return (
    <Chip
      compact
      testID={testID}
      icon={STATUS_ICONS[label] || 'progress-clock'}
      accessibilityLabel={`Wing Shot status: ${label}`}
      style={{
        alignSelf: 'flex-start',
        backgroundColor: positive
          ? theme.colors.secondaryContainer
          : caution
          ? theme.colors.errorContainer
          : theme.colors.surfaceVariant,
      }}
      textStyle={{
        color: positive
          ? theme.colors.onSecondaryContainer
          : caution
          ? theme.colors.onErrorContainer
          : theme.colors.onSurfaceVariant,
      }}
    >
      {label}
    </Chip>
  );
}

