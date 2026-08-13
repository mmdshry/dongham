import { detectBank } from '@dongham/ledger';
import { nanoid } from 'nanoid';
import { encryptText, decryptMaybe } from './crypto';
import { db, type LocalProfile, type PayoutMethod } from './db';
import { luhnOk, normalizeCard, normalizeSheba, shebaOk } from './format';
import { updateProfile } from './api';

export interface DecryptedPayout {
  id: string;
  label?: string;
  card: string;
  sheba: string;
  holder: string;
  bank: string;
  isDefault?: boolean;
}

export async function listPayouts(profile?: LocalProfile | null): Promise<DecryptedPayout[]> {
  const p = profile || (await db.profile.get('self'));
  if (!p) return [];
  const methods = p.payoutMethods?.length
    ? p.payoutMethods
    : p.cardNumber || p.sheba
      ? [
          {
            id: 'legacy',
            cardNumber: p.cardNumber,
            sheba: p.sheba,
            cardHolderName: p.cardHolderName,
            bankName: p.bankName,
            isDefault: true,
          } satisfies PayoutMethod,
        ]
      : [];
  const out: DecryptedPayout[] = [];
  for (const m of methods) {
    const card = await decryptMaybe(m.cardNumber);
    const sheba = await decryptMaybe(m.sheba);
    const bank = m.bankName || detectBank(card, sheba)?.name || '';
    out.push({
      id: m.id,
      label: m.label,
      card,
      sheba,
      holder: m.cardHolderName || p.cardHolderName || '',
      bank,
      isDefault: m.isDefault,
    });
  }
  return out;
}

export async function defaultPayout(profile?: LocalProfile | null): Promise<DecryptedPayout | undefined> {
  const list = await listPayouts(profile);
  return list.find((m) => m.isDefault) || list[0];
}

export async function savePayoutMethod(input: {
  id?: string;
  card?: string;
  sheba?: string;
  holder?: string;
  bank?: string;
  isDefault?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const card = input.card ? normalizeCard(input.card) : '';
  const sheba = input.sheba ? normalizeSheba(input.sheba) : '';
  if (card && !luhnOk(card)) return { ok: false, error: 'شماره کارت نامعتبر است' };
  if (sheba && !shebaOk(sheba)) return { ok: false, error: 'شبا نامعتبر است' };
  if (!card && !sheba) return { ok: false, error: 'کارت یا شبا لازم است' };
  const bank = input.bank || detectBank(card, sheba)?.name || '';
  const method: PayoutMethod = {
    id: input.id || nanoid(),
    cardNumber: card ? await encryptText(card) : undefined,
    sheba: sheba ? await encryptText(sheba) : undefined,
    cardHolderName: input.holder,
    bankName: bank,
    isDefault: input.isDefault,
    label: bank || undefined,
  };
  const profile = (await db.profile.get('self'))!;
  let methods = [...(profile.payoutMethods || [])];
  const idx = methods.findIndex((m) => m.id === method.id);
  if (idx >= 0) methods[idx] = method;
  else methods.push(method);
  if (method.isDefault || methods.length === 1) {
    methods = methods.map((m) => ({ ...m, isDefault: m.id === method.id }));
  }
  const def = methods.find((m) => m.isDefault) || methods[0];
  await updateProfile({
    payoutMethods: methods,
    cardNumber: def?.cardNumber,
    sheba: def?.sheba,
    cardHolderName: def?.cardHolderName || input.holder,
    bankName: def?.bankName || bank,
  });
  return { ok: true };
}

export async function removePayoutMethod(id: string) {
  const profile = (await db.profile.get('self'))!;
  const methods = (profile.payoutMethods || []).filter((m) => m.id !== id);
  const def = methods[0];
  await updateProfile({
    payoutMethods: methods,
    cardNumber: def?.cardNumber,
    sheba: def?.sheba,
    bankName: def?.bankName,
    cardHolderName: def?.cardHolderName,
  });
}
