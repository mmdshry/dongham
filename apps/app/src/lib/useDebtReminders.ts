import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { globalDebts } from './analytics';
import { db } from './db';
import { fetchFxRates, type FxRates } from './fx';
import { scheduleDebtReminders } from './reminders';

export function useDebtReminders() {
  const periods = useLiveQuery(() => db.periods.toArray(), []) || [];
  const members = useLiveQuery(() => db.members.toArray(), []) || [];
  const expenses = useLiveQuery(() => db.expenses.toArray(), []) || [];
  const payments = useLiveQuery(() => db.payments.toArray(), []) || [];
  const profile = useLiveQuery(() => db.profile.get('self'));
  const [fxRates, setFxRates] = useState<FxRates>({});

  useEffect(() => {
    void fetchFxRates().then(setFxRates);
  }, []);

  const debts = useMemo(
    () =>
      globalDebts(
        periods,
        members,
        expenses,
        payments,
        {
          userId: profile?.userId,
          guestKey: profile?.guestKey,
          displayName: profile?.displayName,
          phone: profile?.phone,
        },
        fxRates,
      ),
    [periods, members, expenses, payments, profile, fxRates],
  );

  useEffect(() => {
    void scheduleDebtReminders({ owedToMe: debts.owedToMe, iOwe: debts.iOwe });
  }, [debts.owedToMe, debts.iOwe, profile?.usePersianDigits]);
}
