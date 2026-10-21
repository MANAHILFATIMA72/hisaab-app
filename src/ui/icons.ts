import { GOAL_TEMPLATES } from '@/db/defaults';
import type { AccountType } from '@/lib/types';

export const ACCOUNT_ICONS: Record<AccountType, string> = {
  cash: 'cash',
  bank: 'business',
  wallet: 'phone-portrait',
  card: 'card',
};

export function goalIcon(template: string | null): string {
  return GOAL_TEMPLATES.find((g) => g.key === template)?.icon ?? 'flag';
}
