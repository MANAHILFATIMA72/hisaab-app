import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState, type ComponentProps, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text as RNText,
  TextInput,
  View,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Radius, Spacing } from '@/constants/theme';
import { formatDate } from '@/i18n';
import { addDays, fromISODate, toISODate, today } from '@/lib/dates';
import { useApp } from '@/state/app';

export type IconName = ComponentProps<typeof Ionicons>['name'];

// ---------- Text ----------

type Variant = 'title' | 'heading' | 'body' | 'label' | 'caption' | 'amount' | 'bigAmount';

const SIZES: Record<Variant, TextStyle> = {
  title: { fontSize: 24, fontWeight: '700', lineHeight: 32 },
  heading: { fontSize: 18, fontWeight: '700', lineHeight: 26 },
  body: { fontSize: 15, fontWeight: '400', lineHeight: 22 },
  label: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  caption: { fontSize: 12, fontWeight: '400', lineHeight: 18 },
  amount: { fontSize: 16, fontWeight: '700', lineHeight: 22 },
  bigAmount: { fontSize: 30, fontWeight: '800', lineHeight: 38 },
};

export function Text({
  variant = 'body',
  muted,
  color,
  style,
  center,
  ...rest
}: TextProps & { variant?: Variant; muted?: boolean; color?: string; center?: boolean }) {
  const { colors, fontScale, isRTL } = useApp();
  const base = SIZES[variant];
  // Urdu (Nastaliq/Naskh) glyphs are taller than Latin, so give them extra line height.
  const lineHeight = (base.lineHeight ?? 20) * fontScale * (isRTL ? 1.25 : 1);
  return (
    <RNText
      style={[
        base,
        {
          fontSize: (base.fontSize ?? 15) * fontScale,
          lineHeight,
          color: color ?? (muted ? colors.textSecondary : colors.text),
          writingDirection: isRTL ? 'rtl' : 'ltr',
          textAlign: center ? 'center' : isRTL ? 'right' : 'left',
        },
        style,
      ]}
      {...rest}
    />
  );
}

// ---------- Layout ----------

export function Screen({
  children,
  scroll = true,
  padded = true,
  style,
  footer,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  footer?: ReactNode;
}) {
  const { colors, isRTL } = useApp();
  const content = [styles.content, padded && { padding: Spacing.three }, style];
  return (
    <SafeAreaView
      edges={['bottom', 'left', 'right']}
      style={{ flex: 1, backgroundColor: colors.background, direction: isRTL ? 'rtl' : 'ltr' }}>
      {scroll ? (
        <ScrollView contentContainerStyle={[content, { paddingBottom: 120 }]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, content]}>{children}</View>
      )}
      {footer}
    </SafeAreaView>
  );
}

export function Card({
  children,
  style,
  onPress,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  const { colors } = useApp();
  const cardStyle = [styles.card, { backgroundColor: colors.card, borderColor: colors.border }, style];
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [cardStyle, pressed && { opacity: 0.7 }]}>
        {children}
      </Pressable>
    );
  }
  return <View style={cardStyle}>{children}</View>;
}

export function Row({
  children,
  style,
  gap = Spacing.two,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  gap?: number;
}) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Spacer({ size = Spacing.three }: { size?: number }) {
  return <View style={{ height: size }} />;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: Spacing.three, marginBottom: Spacing.two }}>
      <Text variant="heading">{children}</Text>
      {action}
    </Row>
  );
}

export function Empty({ icon = 'leaf-outline', text }: { icon?: IconName; text: string }) {
  const { colors } = useApp();
  return (
    <View style={{ alignItems: 'center', padding: Spacing.five, gap: Spacing.two }}>
      <Ionicons name={icon} size={40} color={colors.textSecondary} />
      <Text muted center>
        {text}
      </Text>
    </View>
  );
}

// ---------- Buttons ----------

export function Button({
  title,
  onPress,
  kind = 'primary',
  icon,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: IconName;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useApp();
  const bg =
    kind === 'primary'
      ? colors.primary
      : kind === 'danger'
        ? colors.danger
        : kind === 'secondary'
          ? colors.primarySoft
          : 'transparent';
  const fg = kind === 'primary' ? colors.onPrimary : kind === 'danger' ? '#fff' : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
        style,
      ]}>
      {icon && <Ionicons name={icon} size={18} color={fg} />}
      <Text variant="label" color={fg} center>
        {title}
      </Text>
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  color,
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  color?: string;
}) {
  const { colors } = useApp();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={10}
      style={{ padding: 6 }}>
      <Ionicons name={icon} size={22} color={color ?? colors.text} />
    </Pressable>
  );
}

export function Fab({ onPress, label }: { onPress: () => void; label: string }) {
  const { colors, isRTL } = useApp();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.fab,
        { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
        isRTL ? { left: Spacing.four } : { right: Spacing.four },
      ]}>
      <Ionicons name="add" size={30} color={colors.onPrimary} />
    </Pressable>
  );
}

// ---------- Inputs ----------

export function Field({
  label,
  children,
  hint,
  error,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string;
}) {
  const { colors } = useApp();
  return (
    <View style={{ marginBottom: Spacing.three, gap: Spacing.one }}>
      <Text variant="label" muted>
        {label}
      </Text>
      {children}
      {error ? (
        <Text variant="caption" color={colors.danger}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" muted>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function Input(props: ComponentProps<typeof TextInput> & { big?: boolean }) {
  const { colors, fontScale, isRTL } = useApp();
  const { big, style, ...rest } = props;
  return (
    <TextInput
      placeholderTextColor={colors.textSecondary}
      {...rest}
      style={[
        styles.input,
        {
          color: colors.text,
          backgroundColor: colors.card,
          borderColor: colors.border,
          fontSize: (big ? 28 : 16) * fontScale,
          fontWeight: big ? '700' : '400',
          textAlign: isRTL ? 'right' : 'left',
          writingDirection: isRTL ? 'rtl' : 'ltr',
        },
        style,
      ]}
    />
  );
}

export function Chips<T extends string>({
  options,
  value,
  onChange,
  wrap = true,
}: {
  options: { value: T; label: string; icon?: IconName; color?: string }[];
  value: T | null;
  onChange: (v: T) => void;
  wrap?: boolean;
}) {
  const { colors } = useApp();
  const chips = options.map((o) => {
    const selected = o.value === value;
    return (
      <Pressable
        key={o.value}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={() => onChange(o.value)}
        style={[
          styles.chip,
          {
            backgroundColor: selected ? colors.primary : colors.card,
            borderColor: selected ? colors.primary : colors.border,
          },
        ]}>
        {o.icon && <Ionicons name={o.icon} size={16} color={selected ? colors.onPrimary : (o.color ?? colors.text)} />}
        <Text variant="label" color={selected ? colors.onPrimary : colors.text}>
          {o.label}
        </Text>
      </Pressable>
    );
  });
  if (wrap) return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>{chips}</View>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.two }}>
      {chips}
    </ScrollView>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; color?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { colors } = useApp();
  return (
    <View style={[styles.segmented, { backgroundColor: colors.track }]}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, selected && { backgroundColor: colors.card }]}>
            <Text variant="label" center color={selected ? (o.color ?? colors.text) : colors.textSecondary}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function DateField({
  value,
  onChange,
  allowClear,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  allowClear?: boolean;
}) {
  const { colors, t, settings } = useApp();
  const [showIOS, setShowIOS] = useState(false);
  const current = value ? fromISODate(value) : new Date();
  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'date',
        onValueChange: (_e, d) => d && onChange(toISODate(d)),
      });
    } else {
      setShowIOS((s) => !s);
    }
  };
  const t0 = today();
  return (
    <View style={{ gap: Spacing.two }}>
      <Row style={{ flexWrap: 'wrap' }}>
        <Chips
          options={[
            { value: t0, label: t('common.today') },
            { value: addDays(t0, -1), label: t('common.yesterday') },
          ]}
          value={value}
          onChange={(v) => onChange(v)}
        />
        <Pressable onPress={open} style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Ionicons name="calendar-outline" size={16} color={colors.primary} />
          <Text variant="label">{value ? formatDate(value, settings.lang, true) : t('common.pickDate')}</Text>
        </Pressable>
        {allowClear && value && (
          <IconButton icon="close-circle" label={t('common.clear')} onPress={() => onChange(null)} />
        )}
      </Row>
      {Platform.OS === 'web' && (
        <Input
          value={value ?? ''}
          placeholder="YYYY-MM-DD"
          onChangeText={(v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && onChange(v)}
        />
      )}
      {showIOS && Platform.OS === 'ios' && (
        <DateTimePicker
          value={current}
          mode="date"
          display="inline"
          onValueChange={(_e, d) => d && onChange(toISODate(d))}
        />
      )}
    </View>
  );
}

// ---------- Lists ----------

export function CategoryIcon({ icon, color, size = 40 }: { icon: string; color: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color + '22',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Ionicons name={icon as IconName} size={size * 0.5} color={color} />
    </View>
  );
}

export function ListRow({
  title,
  subtitle,
  right,
  left,
  onPress,
  icon,
  chevron,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  left?: ReactNode;
  onPress?: () => void;
  icon?: IconName;
  chevron?: boolean;
}) {
  const { colors, isRTL } = useApp();
  const body = (
    <Row style={{ paddingVertical: Spacing.two + 2 }} gap={Spacing.three}>
      {left ?? (icon ? <Ionicons name={icon} size={22} color={colors.primary} /> : null)}
      <View style={{ flex: 1 }}>
        <Text variant="label" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" muted numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {chevron && <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.textSecondary} />}
    </Row>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.6 }}>
      {body}
    </Pressable>
  );
}

export function Divider() {
  const { colors } = useApp();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />;
}

export function ToggleRow({
  title,
  subtitle,
  value,
  onChange,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const { colors } = useApp();
  return (
    <ListRow
      title={title}
      subtitle={subtitle}
      right={<Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primary }} thumbColor="#fff" />}
    />
  );
}

export function ProgressBar({ value, color }: { value: number; color?: string }) {
  const { colors } = useApp();
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.track, overflow: 'hidden' }}>
      <View
        style={{
          width: `${clamped * 100}%`,
          height: '100%',
          borderRadius: 4,
          backgroundColor: color ?? colors.primary,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.two },
  card: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: 14,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.md,
  },
  fab: {
    position: 'absolute',
    bottom: Spacing.four,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  segmented: { flexDirection: 'row', borderRadius: Radius.md, padding: 3 },
  segment: { flex: 1, paddingVertical: 9, borderRadius: Radius.sm },
});
