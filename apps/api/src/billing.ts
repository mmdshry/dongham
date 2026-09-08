import { nanoid } from 'nanoid';
import { insertBillingEvent } from './repo.js';
import type { BillingEvent } from './types.js';

export function premiumUntilFromNow(days = 30): string {
  return new Date(Date.now() + days * 86400_000).toISOString();
}

export async function recordBillingEvent(input: {
  userId: string;
  source: BillingEvent['source'];
  sku?: string;
  amount?: number;
  until: string;
}): Promise<void> {
  await insertBillingEvent({
    id: nanoid(),
    userId: input.userId,
    source: input.source,
    sku: input.sku,
    amount: input.amount,
    until: input.until,
    createdAt: new Date().toISOString(),
  });
}
