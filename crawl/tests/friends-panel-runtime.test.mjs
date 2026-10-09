import test from 'node:test';
import assert from 'node:assert/strict';
import { hookRuntime, mobileModule } from './helpers/mobile-runtime.mjs';

function harness({ width = 320, fontScale = 1.3, mark = async () => { throw new Error('Rejected status update'); } } = {}) {
  const runtime = hookRuntime();
  const calls = [];
  const module = mobileModule('components/FriendsPanel.jsx', {
    react: runtime.react, 'react/jsx-runtime': runtime.jsx,
    'react-native': { View: 'view', Alert: {}, Share: {}, useWindowDimensions: () => ({ width, fontScale }) },
    'react-native-paper': { Avatar: { Text: 'avatar' }, Button: 'button', Card: Object.assign('card', { Title: 'title', Content: 'content' }),
      Dialog: { Title: 'dialog-title', Content: 'dialog-content', Actions: 'dialog-actions' }, Divider: 'divider', Portal: 'portal', Searchbar: 'search', Text: 'text', useTheme: () => ({ colors: {} }) },
    'react-native-qrcode-svg': { default: 'qr' }, 'expo-router': { useRouter: () => ({ push: route => calls.push(route) }) },
    '../lib/analytics': { trackEvent() {} },
    '../lib/friends': { getFriends: async () => [], getPendingInvites: async () => [], getBlockedUsers: async () => [],
      markFriendActivitySeen: mark, getFriendInviteCode: async () => 'fixture-code', friendInviteUrl: () => 'https://example.invalid' },
  });
  return { runtime, Component: module.default, calls };
}
function elements(tree) {
  if (!tree) return [];
  if (Array.isArray(tree)) return tree.flatMap(elements);
  return typeof tree === 'object' ? [tree, ...elements(tree.props?.children)] : [];
}
async function settle() { for (let i = 0; i < 8; i++) await Promise.resolve(); }

test('rejected activity and pending acknowledgements show feedback and refresh badges without unhandled rejection', async () => {
  const kinds = [];
  const { runtime, Component } = harness({ mark: async kind => { kinds.push(kind); throw new Error('Rejected'); } });
  let badges = 0;
  const props = { onBadgeChange: () => badges++ };
  runtime.render(Component, props);
  await settle();
  let tree = runtime.render(Component, props);
  assert.ok(elements(tree).some(node => node.props?.children === 'Activity status is temporarily unavailable.'));
  assert.equal(badges, 1);
  elements(tree).find(node => node.type === 'button' && node.props.children[0] === 'Pending').props.onPress();
  runtime.render(Component, props);
  await settle();
  tree = runtime.render(Component, props);
  assert.deepEqual(kinds, ['activity', 'requests']);
  assert.equal(badges, 2);
  assert.ok(elements(tree).some(node => node.props?.children === 'Activity status is temporarily unavailable.'));
  runtime.unmount();
});

test('an acknowledgement rejected after unmount does not refresh a departed panel', async () => {
  let reject;
  const { runtime, Component } = harness({ mark: () => new Promise((_resolve, failure) => { reject = failure; }) });
  let badges = 0;
  runtime.render(Component, { onBadgeChange: () => badges++ });
  runtime.unmount();
  reject(new Error('Rejected after close'));
  await settle();
  assert.equal(badges, 0);
});

test('compact and scaled QR actions have full-width targets while typical phones retain a row', () => {
  for (const [width, fontScale, direction] of [[320, 1.3, 'column'], [390, 1.3, 'column'], [390, 1, 'row']]) {
    const { runtime, Component, calls } = harness({ width, fontScale, mark: async () => {} });
    const nodes = elements(runtime.render(Component, {}));
    const row = nodes.find(node => node.type === 'view' && elements(node.props.children).some(child => child.props?.children === 'My Friend QR'));
    const actionRow = nodes.filter(node => node.type === 'view' && node.props.style?.flexDirection === direction)
      .find(node => node.props.children?.some?.(child => child?.props?.children === 'My Friend QR'));
    assert.ok(row);
    assert.ok(actionRow);
    const enter = elements(actionRow).find(node => node.props?.children === 'Enter Code');
    assert.equal(enter.props.contentStyle.minHeight, 44);
    enter.props.onPress();
    assert.deepEqual(calls, ['/friends/add']);
    runtime.unmount();
  }
});

