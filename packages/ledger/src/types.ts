/** Amounts stored as integers in the expense/period currency unit (IRT = toman). */

export type SplitMode = 'equal' | 'weight' | 'exact' | 'percent';

export type PeriodKind = 'split' | 'banker' | 'pot';

export type PeriodTemplate =
  | 'travel'
  | 'household'
  | 'work'
  | 'family'
  | 'dorm'
  | 'ziarat'
  | 'wedding'
  | 'building'
  | 'custom';

export type RecurringCadence = 'days' | 'jalaliMonthly' | 'jalaliBimonthly';

export type SettlementStatus = 'sent' | 'pending_confirm' | 'settled';

export type IndexAsset = 'none' | 'gold' | 'usd';

export type MemberRole = 'owner' | 'member' | 'viewer';

export type RoundTo = 0 | 1000 | 10000;

export interface MemberRef {
  id: string;
  name: string;
}

export interface ExpenseShareInput {
  memberId: string;
  /** equal: ignored; weight: relative weight; exact: minor units; percent: 0-100 */
  value: number;
  /** If true, member is excluded from this expense */
  excluded?: boolean;
}

export interface TaxInput {
  type: 'none' | 'percent' | 'amount';
  /** percent: 0-100; amount: minor units */
  value: number;
}

export interface ExpensePayerInput {
  memberId: string;
  /** Amount this person paid toward the expense, minor units of expense currency */
  amount: number;
}

export interface ExpenseInput {
  id: string;
  title: string;
  /** Base amount before service/tax/tip, minor units */
  amount: number;
  currency: string;
  payerId: string;
  /** If set and non-empty, credits are split across these payers instead of payerId. */
  payers?: ExpensePayerInput[];
  splitMode: SplitMode;
  shares: ExpenseShareInput[];
  tax?: TaxInput;
  service?: TaxInput;
  tip?: TaxInput;
  /** FX rate to period base currency; 1 if same */
  fxRate?: number;
  createdAt?: string;
  occurredAt?: string;
}

export interface PaymentInput {
  id: string;
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  currency: string;
  fxRate?: number;
  /** loan increases debt; settlement decreases */
  kind: 'settlement' | 'loan';
  note?: string;
  createdAt?: string;
  status?: SettlementStatus;
  indexAsset?: IndexAsset;
  indexRateAtCreate?: number;
}

export interface ComputedShare {
  memberId: string;
  amount: number;
}

export interface BalanceMap {
  [memberId: string]: number;
}

export interface SettlementEdge {
  fromMemberId: string;
  toMemberId: string;
  amount: number;
}
