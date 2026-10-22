import type { AccountType, CategoryKind, ProfileType } from '@/lib/types';

export type DefaultCategory = {
  key: string;
  kind: CategoryKind;
  icon: string; // Ionicons name
  color: string;
  profiles?: ProfileType[]; // omitted = everyone
};

// Names live in the i18n files under `cat.<key>` so they follow the app language.
export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  // Expenses for everyone
  { key: 'food', kind: 'expense', icon: 'fast-food', color: '#E8590C' },
  { key: 'groceries', kind: 'expense', icon: 'basket', color: '#2B8A3E' },
  { key: 'transport', kind: 'expense', icon: 'car', color: '#1971C2' },
  { key: 'bills', kind: 'expense', icon: 'flash', color: '#F59F00' },
  { key: 'mobile', kind: 'expense', icon: 'phone-portrait', color: '#7048E8' },
  { key: 'health', kind: 'expense', icon: 'medkit', color: '#E03131' },
  { key: 'shopping', kind: 'expense', icon: 'shirt', color: '#C2255C' },
  { key: 'family', kind: 'expense', icon: 'people', color: '#0C8599' },
  { key: 'charity', kind: 'expense', icon: 'heart', color: '#099268' },
  { key: 'fun', kind: 'expense', icon: 'film', color: '#AE3EC9' },
  { key: 'other_expense', kind: 'expense', icon: 'ellipsis-horizontal', color: '#868E96' },
  // Expenses by profile
  {
    key: 'rent',
    kind: 'expense',
    icon: 'home',
    color: '#5C940D',
    profiles: ['employee', 'household', 'freelancer', 'business'],
  },
  { key: 'fees', kind: 'expense', icon: 'school', color: '#3B5BDB', profiles: ['student', 'household'] },
  { key: 'books', kind: 'expense', icon: 'book', color: '#4263EB', profiles: ['student'] },
  // Student life: hostel, canteen, outings with friends
  { key: 'hostel_rent', kind: 'expense', icon: 'bed', color: '#5C940D', profiles: ['student'] },
  { key: 'mess', kind: 'expense', icon: 'restaurant', color: '#D9480F', profiles: ['student'] },
  { key: 'canteen', kind: 'expense', icon: 'cafe', color: '#A0522D', profiles: ['student'] },
  { key: 'outings', kind: 'expense', icon: 'people-circle', color: '#E64980', profiles: ['student', 'employee'] },
  { key: 'printing', kind: 'expense', icon: 'print', color: '#5C7CFA', profiles: ['student'] },
  { key: 'laundry', kind: 'expense', icon: 'water', color: '#22B8CF', profiles: ['student'] },
  { key: 'personal_care', kind: 'expense', icon: 'cut', color: '#BE4BDB', profiles: ['student', 'employee'] },
  {
    key: 'subscriptions',
    kind: 'expense',
    icon: 'tv',
    color: '#7950F2',
    profiles: ['student', 'employee', 'freelancer'],
  },
  { key: 'gifts', kind: 'expense', icon: 'gift', color: '#F06595', profiles: ['student'] },
  { key: 'trips', kind: 'expense', icon: 'airplane', color: '#1098AD', profiles: ['student', 'employee'] },
  { key: 'gym', kind: 'expense', icon: 'barbell', color: '#2F9E44', profiles: ['student'] },
  { key: 'kids', kind: 'expense', icon: 'happy', color: '#F76707', profiles: ['household'] },
  { key: 'house_help', kind: 'expense', icon: 'hand-left', color: '#74B816', profiles: ['household'] },
  {
    key: 'committee',
    kind: 'expense',
    icon: 'repeat',
    color: '#1098AD',
    profiles: ['household', 'employee', 'business'],
  },
  { key: 'tools', kind: 'expense', icon: 'laptop', color: '#495057', profiles: ['freelancer'] },
  { key: 'internet', kind: 'expense', icon: 'wifi', color: '#1C7ED6', profiles: ['freelancer', 'student'] },
  { key: 'stock', kind: 'expense', icon: 'cube', color: '#D9480F', profiles: ['business'] },
  { key: 'staff', kind: 'expense', icon: 'briefcase', color: '#5F3DC4', profiles: ['business'] },
  // Income
  { key: 'salary', kind: 'income', icon: 'wallet', color: '#2F9E44', profiles: ['employee', 'household'] },
  { key: 'pocket_money', kind: 'income', icon: 'cash', color: '#37B24D', profiles: ['student'] },
  { key: 'scholarship', kind: 'income', icon: 'ribbon', color: '#2B8A3E', profiles: ['student'] },
  { key: 'part_time', kind: 'income', icon: 'time', color: '#40C057', profiles: ['student'] },
  { key: 'tuition_income', kind: 'income', icon: 'easel', color: '#51CF66', profiles: ['student'] },
  { key: 'freelance', kind: 'income', icon: 'laptop', color: '#2F9E44', profiles: ['student'] },
  { key: 'client_payment', kind: 'income', icon: 'card', color: '#2F9E44', profiles: ['freelancer'] },
  { key: 'sales', kind: 'income', icon: 'storefront', color: '#2F9E44', profiles: ['business'] },
  { key: 'household_money', kind: 'income', icon: 'home', color: '#2F9E44', profiles: ['household'] },
  { key: 'gift', kind: 'income', icon: 'gift', color: '#40C057' },
  { key: 'other_income', kind: 'income', icon: 'add-circle', color: '#69DB7C' },
];

// Students see the categories they use most first.
const STUDENT_ORDER = [
  'food',
  'canteen',
  'transport',
  'hostel_rent',
  'mess',
  'outings',
  'mobile',
  'internet',
  'books',
  'printing',
  'fees',
  'shopping',
  'personal_care',
  'laundry',
  'subscriptions',
  'gifts',
  'trips',
  'gym',
  'groceries',
  'health',
  'bills',
  'family',
  'fun',
  'charity',
  'other_expense',
  'pocket_money',
  'scholarship',
  'part_time',
  'tuition_income',
  'freelance',
  'gift',
  'other_income',
];

/** Bumped when new default categories are added, so existing users get them on update. */
export const CATEGORY_SEED_VERSION = 2;

export function categoriesFor(profile: ProfileType): DefaultCategory[] {
  const list = DEFAULT_CATEGORIES.filter((c) => !c.profiles || c.profiles.includes(profile));
  if (profile !== 'student') return list;
  const rank = (k: string) => {
    const i = STUDENT_ORDER.indexOf(k);
    return i < 0 ? STUDENT_ORDER.length : i;
  };
  return [...list].sort((a, b) => rank(a.key) - rank(b.key));
}

export const DEFAULT_ACCOUNTS: { key: string; type: AccountType; profiles?: ProfileType[] }[] = [
  { key: 'acc_cash', type: 'cash' },
  { key: 'acc_bank', type: 'bank', profiles: ['employee', 'freelancer', 'business', 'household'] },
  { key: 'acc_wallet', type: 'wallet' },
];

export const GOAL_TEMPLATES = [
  { key: 'umrah', icon: 'airplane', target: 400000_00 },
  { key: 'hajj', icon: 'airplane', target: 1200000_00 },
  { key: 'wedding', icon: 'diamond', target: 1000000_00 },
  { key: 'education', icon: 'school', target: 300000_00 },
  { key: 'laptop', icon: 'laptop', target: 150000_00 },
  { key: 'bike', icon: 'bicycle', target: 200000_00 },
  { key: 'emergency', icon: 'shield-checkmark', target: 0 },
] as const;

export const CATEGORY_ICONS = [
  'fast-food',
  'basket',
  'car',
  'bus',
  'flash',
  'water',
  'flame',
  'phone-portrait',
  'wifi',
  'medkit',
  'shirt',
  'people',
  'heart',
  'film',
  'home',
  'school',
  'book',
  'happy',
  'gift',
  'cash',
  'card',
  'wallet',
  'storefront',
  'cube',
  'briefcase',
  'laptop',
  'airplane',
  'cafe',
  'restaurant',
  'paw',
  'fitness',
  'cut',
  'construct',
  'game-controller',
  'musical-notes',
  'repeat',
  'bed',
  'print',
  'tv',
  'barbell',
  'ribbon',
  'easel',
  'people-circle',
  'ellipsis-horizontal',
] as const;

export const CATEGORY_COLORS = [
  '#E8590C',
  '#2B8A3E',
  '#1971C2',
  '#F59F00',
  '#7048E8',
  '#E03131',
  '#C2255C',
  '#0C8599',
  '#099268',
  '#AE3EC9',
  '#5C940D',
  '#3B5BDB',
  '#495057',
  '#D9480F',
];
