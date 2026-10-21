import { View } from 'react-native';
import Svg, { Circle, G, Rect } from 'react-native-svg';

import { Spacing } from '@/constants/theme';
import { useApp } from '@/state/app';

import { Row, Text } from './kit';

export type Slice = { label: string; value: number; color: string };

/** Donut chart drawn with stroke-dasharray arcs; a 2px gap separates slices. */
export function Donut({
  slices,
  size = 180,
  centerLabel,
  centerValue,
}: {
  slices: Slice[];
  size?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const { colors } = useApp();
  const stroke = 26;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = slices.reduce((a, s) => a + s.value, 0);
  let offset = 0;
  return (
    <View style={{ width: size, height: size, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.track} strokeWidth={stroke} fill="none" />
          {total > 0 &&
            slices.map((s) => {
              const len = (s.value / total) * c;
              const gap = slices.length > 1 ? Math.min(2, len / 2) : 0;
              const el = (
                <Circle
                  key={s.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  stroke={s.color}
                  strokeWidth={stroke}
                  fill="none"
                  strokeDasharray={`${Math.max(0, len - gap)} ${c}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += len;
              return el;
            })}
        </G>
      </Svg>
      {centerLabel && (
        <Text variant="caption" muted center>
          {centerLabel}
        </Text>
      )}
      {centerValue && (
        <Text variant="amount" center>
          {centerValue}
        </Text>
      )}
    </View>
  );
}

export function Legend({ slices, format }: { slices: Slice[]; format: (v: number) => string }) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  return (
    <View style={{ gap: Spacing.one }}>
      {slices.map((s) => (
        <Row key={s.label} style={{ justifyContent: 'space-between' }}>
          <Row style={{ flex: 1 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.color }} />
            <Text numberOfLines={1} style={{ flexShrink: 1 }}>
              {s.label}
            </Text>
          </Row>
          <Text variant="caption" muted>
            {total ? Math.round((s.value / total) * 100) : 0}%
          </Text>
          <Text variant="label" style={{ minWidth: 96, textAlign: 'right' }}>
            {format(s.value)}
          </Text>
        </Row>
      ))}
    </View>
  );
}

export type BarGroup = { label: string; income: number; expense: number };

/** Paired income/expense bars per month. Bars keep LTR time order even in Urdu, like most charts. */
export function Bars({ groups, height = 150 }: { groups: BarGroup[]; height?: number }) {
  const { colors } = useApp();
  const max = Math.max(1, ...groups.flatMap((g) => [g.income, g.expense]));
  const barW = 12;
  const groupW = 44;
  const width = groups.length * groupW;
  return (
    <View style={{ alignItems: 'center', direction: 'ltr' }}>
      <Svg width={width} height={height}>
        {groups.map((g, i) => {
          const x = i * groupW + (groupW - barW * 2 - 3) / 2;
          const hi = (g.income / max) * (height - 4);
          const he = (g.expense / max) * (height - 4);
          return (
            <G key={g.label}>
              <Rect x={x} y={height - hi} width={barW} height={hi} rx={3} fill={colors.income} />
              <Rect x={x + barW + 3} y={height - he} width={barW} height={he} rx={3} fill={colors.expense} />
            </G>
          );
        })}
      </Svg>
      <View style={{ flexDirection: 'row', width }}>
        {groups.map((g) => (
          <View key={g.label} style={{ width: groupW }}>
            <Text variant="caption" muted center>
              {g.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
