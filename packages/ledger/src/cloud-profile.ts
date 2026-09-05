export type CloudPayoutMethod = {
  id: string;
  label?: string;
  cardNumber: string;
  sheba?: string;
  cardHolderName?: string;
  bankName?: string;
  accountNumber?: string;
  isDefault?: boolean;
};

export type CloudProfile = {
  displayName: string;
  phone?: string;
  email?: string;
  plan: 'free' | 'premium';
  premiumUntil?: string;
  usePersianDigits: boolean;
  debtReminders: boolean;
  calendarMode: 'jalali' | 'gregorian';
  fxWatchlist: string[];
  payoutMethods?: CloudPayoutMethod[];
  prefsUpdatedAt?: string;
};
