import { mobileModule } from './mobile-runtime.mjs';

// Render the real, stateless shared controls inside the lightweight RN harness.
export function photoControlsRuntime(runtime) {
  const { default: Controls } = mobileModule('components/PhotoVoteControls.jsx', {
    react: runtime.react, 'react/jsx-runtime': runtime.jsx,
    'react-native': { View: 'view' }, 'react-native-paper': { Button: 'button' },
  });
  for (const name of ['jsx', 'jsxs']) {
    const original = runtime.jsx[name];
    runtime.jsx[name] = (type, props) => type === Controls ? Controls(props) : original(type, props);
  }
  return { __esModule: true, default: Controls };
}
