import React from 'react';

type Props = { children: React.ReactNode; fallback?: React.ReactNode };
type State = { failed: boolean };

export class MascotErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    if (__DEV__) console.warn('[mascot] Rendering failed; hiding mascot.', error);
  }

  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}

