import { router } from 'expo-router';

import type { Account, Category, Transaction } from '@/lib/types';
import { useApp } from '@/state/app';
import { categoryName } from '@/state/labels';

import { CategoryIcon, ListRow, Text } from './kit';

export function TxRow({
  tx,
  categories,
  accounts,
}: {
  tx: Transaction;
  categories: Map<string, Category>;
  accounts: Map<string, Pick<Account, 'name'>>;
}) {
  const { t, colors, money, date } = useApp();
  const cat = tx.category_id ? categories.get(tx.category_id) : undefined;
  const isTransfer = tx.type === 'transfer';
  const title = isTransfer
    ? t('tx.transferTo', { name: accounts.get(tx.to_account_id ?? '')?.name ?? '' })
    : categoryName(cat, t);
  const subtitle = [
    tx.time ? `${date(tx.date)} ${tx.time}` : date(tx.date),
    accounts.get(tx.account_id)?.name,
    tx.note,
    tx.group_expense_id ? t('tx.groupShare') : null,
    tx.split_id ? t('tx.splitPart') : null,
    tx.receipt ? '📎' : null,
    tx.tags
      ? tx.tags
          .split(',')
          .map((x) => `#${x}`)
          .join(' ')
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const color = tx.type === 'income' ? colors.income : tx.type === 'expense' ? colors.expense : colors.textSecondary;
  return (
    <ListRow
      onPress={() => router.push(`/tx/${tx.id}`)}
      left={
        <CategoryIcon
          icon={isTransfer ? 'swap-horizontal' : (cat?.icon ?? 'help')}
          color={isTransfer ? colors.textSecondary : (cat?.color ?? colors.textSecondary)}
        />
      }
      title={title}
      subtitle={subtitle}
      right={
        <Text variant="amount" color={color}>
          {tx.type === 'expense' ? '-' : tx.type === 'income' ? '+' : ''}
          {money(tx.amount, { ignoreHidden: true })}
        </Text>
      }
    />
  );
}
