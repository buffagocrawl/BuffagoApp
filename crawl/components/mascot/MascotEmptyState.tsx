import React from 'react';
import { MascotMoment, type MascotMomentProps } from './MascotMoment';

type Props = Omit<MascotMomentProps, 'momentType'>;

export function MascotEmptyState(props: Props) {
  return <MascotMoment {...props} momentType="empty" />;
}

