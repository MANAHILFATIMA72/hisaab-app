export const Colors = {
  light: {
    text: '#111827',
    textSecondary: '#6B7280',
    background: '#F5F7F6',
    card: '#FFFFFF',
    border: '#E5E7EB',
    primary: '#0E7C5A',
    primarySoft: '#DDF3EA',
    onPrimary: '#FFFFFF',
    income: '#15803D',
    expense: '#DC2626',
    warning: '#D97706',
    danger: '#DC2626',
    track: '#E5E7EB',
  },
  dark: {
    text: '#F3F4F6',
    textSecondary: '#9CA3AF',
    background: '#0B1210',
    card: '#151E1B',
    border: '#26322E',
    primary: '#34C08F',
    primarySoft: '#173A2E',
    onPrimary: '#04140E',
    income: '#4ADE80',
    expense: '#F87171',
    warning: '#FBBF24',
    danger: '#F87171',
    track: '#26322E',
  },
} as const;

export type Palette = { [K in keyof typeof Colors.light]: string };

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = { sm: 8, md: 12, lg: 16, xl: 24 } as const;
