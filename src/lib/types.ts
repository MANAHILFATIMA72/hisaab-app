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
  time: string | null; // 'HH:MM'
  tags: string; // comma separated, lower case
  receipt: string | null; // file uri of a receipt photo
  split_id: string | null; // rows of one purchase split across categories share this
  group_expense_id: string | null; // my share of a group bill
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

export type Group = {
  id: string;
  name: string;
  icon: string;
  archived: number;
  created_at: number;
};

export type GroupMember = {
  id: string;
  group_id: string;
  name: string;
  phone: string;
  is_me: number;
  sort: number;
};

export type GroupExpense = {
  id: string;
  group_id: string;
  title: string;
  amount: number;
  paid_by: string;
  split: string; // JSON SplitInput, kept so the bill can be edited the way it was entered
  date: ISODate;
  category_id: string | null;
  created_at: number;
};

export type GroupShare = { expense_id: string; member_id: string; amount: number };

export type GroupSettlement = {
  id: string;
  group_id: string;
  from_member: string;
  to_member: string;
  amount: number;
  date: ISODate;
  created_at: number;
};

export type GroupRecurring = {
  id: string;
  group_id: string;
  title: string;
  amount: number;
  paid_by: string;
  split: string;
  category_id: string | null;
  next_date: ISODate;
  active: number;
};

export type EventBudget = {
  id: string;
  name: string;
  tag: string;
  amount: number;
  created_at: number;
};
