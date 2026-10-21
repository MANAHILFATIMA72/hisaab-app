import type { ISODate } from './dates';

export type ProfileType = 'student' | 'employee' | 'household' | 'freelancer' | 'business';
export type AccountType = 'cash' | 'bank' | 'wallet' | 'card';
export type TxType = 'income' | 'expense' | 'transfer';
export type CategoryKind = 'income' | 'expense';
export type Frequency = 'daily' | 'weekly' | 'monthly';
export type UdhaarDirection = 'given' | 'taken';

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  opening_balance: number;
  archived: number;
  sort: number;
};

export type Category = {
  id: string;
  key: string | null;
  name: string;
  kind: CategoryKind;
  icon: string;
  color: string;
  parent_id: string | null;
  archived: number;
  sort: number;
};

export type Transaction = {
  id: string;
  type: TxType;
  amount: number;
  account_id: string;
  to_account_id: string | null;
  category_id: string | null;
  date: ISODate;
  note: string;
  recurring_id: string | null;
  created_at: number;
};

export type Recurring = {
  id: string;
  type: TxType;
  amount: number;
  account_id: string;
  to_account_id: string | null;
  category_id: string | null;
  note: string;
  frequency: Frequency;
  next_date: ISODate;
  active: number;
};

export type Budget = {
  id: string;
  category_id: string | null; // null = overall monthly budget
  amount: number;
};

export type Udhaar = {
  id: string;
  person: string;
  phone: string;
  direction: UdhaarDirection;
  amount: number;
  date: ISODate;
  due_date: ISODate | null;
  reason: string;
  created_at: number;
};

export type UdhaarPayment = {
  id: string;
  udhaar_id: string;
  amount: number;
  date: ISODate;
  note: string;
};

export type Goal = {
  id: string;
  name: string;
  template: string | null;
  target: number;
  deadline: ISODate | null;
  created_at: number;
};

export type GoalContribution = {
  id: string;
  goal_id: string;
  amount: number;
  date: ISODate;
};

export type Bill = {
  id: string;
  name: string;
  amount: number;
  due_day: number;
  active: number;
};
