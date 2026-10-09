import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import Svg, { Circle, Polyline, Text as SvgText, Line } from 'react-native-svg';
import { routePreviewPoints } from '../lib/routePreview';

export default function RoutePreview({ stops }) {
  const { dark, colors } = useTheme();
  const points = routePreviewPoints(stops);
  return <View style={[styles.preview, { backgroundColor: dark ? '#10202A' : '#E6EEF0' }]} accessible accessibilityLabel={points.length ? 'Stop locations schematic. Lines show stop order, not road directions.' : 'Route preview unavailable. View route for stop details.'}>
    <Svg width="100%" height="128" viewBox="0 0 320 148">
      {[40, 80, 120].map((y) => <Line key={'y' + y} x1="0" y1={y} x2="320" y2={y} stroke={dark ? '#1E323C' : '#D5E2E4'} />)}
      {[40, 100, 160, 220, 280].map((x) => <Line key={'x' + x} x1={x} y1="0" x2={x} y2="148" stroke={dark ? '#1E323C' : '#D5E2E4'} />)}
      {points.length > 1 ? <Polyline points={points.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={colors.primary} strokeWidth="4" strokeDasharray="7 4" /> : null}
      {points.map((p) => <React.Fragment key={p.number}><Circle cx={p.x} cy={p.y} r="15" fill={colors.primary} /><SvgText x={p.x} y={p.y + 5} textAnchor="middle" fill="#15100A" fontWeight="bold" fontSize="14">{p.number}</SvgText></React.Fragment>)}
    </Svg>
    <Text variant="labelSmall" style={[styles.caption, { color: dark ? '#C0CED5' : '#435560' }]}>{points.length ? 'Stop locations · schematic, not road directions' : 'BuffaGo · discover your next wing adventure'}</Text>
    {!points.length ? <Text style={[styles.fallback, { color: colors.onSurface }]} variant="titleMedium">Route preview unavailable</Text> : null}
  </View>;
}
const styles = StyleSheet.create({ preview: { minHeight: 152 }, caption: { marginHorizontal: 12, marginBottom: 8 }, fallback: { position: 'absolute', top: 64, left: 12, right: 12, textAlign: 'center', fontWeight: '700' } });
