import './test-setup.js';
import { app } from './app.js';
import { initStore, resetDb } from './db.js';

const USERS = 100;
const PERIODS = 100;

async function json<T>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}

function phoneOf(i: number) {
  return `09121${String(i).padStart(6, '0')}`;
}

async function signup(i: number) {
  const phone = phoneOf(i);
  const req = await app.request('/auth/otp/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  const { devCode } = await json<{ devCode?: string }>(req);
  if (!devCode) throw new Error(`no mock OTP for ${phone} — refusing live SMS`);
  const verify = await app.request('/auth/otp/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code: devCode, displayName: `کاربر ${i}`, deviceId: `load-${i}` }),
  });
  const body = await json<{ token: string; user: { id: string } }>(verify);
  if (verify.status !== 200 || !body.token) throw new Error(`signup failed ${phone} ${verify.status}`);
  return { token: body.token, user: body.user, phone };
}

function expenseBody(id: string, title: string, payerId: string, memberIds: string[]) {
  const now = new Date().toISOString();
  return {
    id,
    title,
    amount: 10_000 + title.length,
    currency: 'IRT',
    payerId,
    splitMode: 'equal',
    shares: memberIds.map((memberId) => ({ memberId, value: 1 })),
    tax: { type: 'none', value: 0 },
    tags: ['load'],
    fxRate: 1,
    createdAt: now,
    updatedAt: now,
    version: 0,
  };
}

function idsOf(rows: { id: string }[]) {
  return rows.map((r) => r.id).sort().join(',');
}

async function main() {
  const dbName = process.env.MYSQL_DATABASE || '';
  if (!/test/i.test(dbName)) {
    throw new Error(`refusing to load-sync on MYSQL_DATABASE=${dbName}; expected a *test* database`);
  }
  await initStore();
  await resetDb();

  console.log(`creating ${USERS} users on ${dbName}`);
  const users: Awaited<ReturnType<typeof signup>>[] = [];
  for (let i = 0; i < USERS; i += 1) users.push(await signup(i));

  console.log(`creating ${PERIODS} periods`);
  const periods: { id: string; owner: (typeof users)[0]; member: (typeof users)[0] }[] = [];
  for (let i = 0; i < PERIODS; i += 1) {
    const owner = users[i % USERS];
    const member = users[(i + 1) % USERS];
    const extra = users[(i + 2) % USERS];
    const memberIds = [`own-${i}`, `m1-${i}`, `m2-${i}`];
    const created = await app.request('/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({
        title: `بار ${i}`,
        currency: 'IRT',
        members: [
          { id: memberIds[0], displayName: owner.phone, userId: owner.user.id, role: 'owner' },
          { id: memberIds[1], displayName: member.phone, userId: member.user.id, role: 'member' },
          { id: memberIds[2], displayName: extra.phone, userId: extra.user.id, role: 'member' },
        ],
      }),
    });
    const { period } = await json<{ period?: { id: string } }>(created);
    if (created.status !== 200 || !period?.id) throw new Error(`period ${i} failed ${created.status}`);
    periods.push({ id: period.id, owner, member });

    const exp = await app.request(`/periods/${period.id}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify(expenseBody(`e-${i}-a`, `هزینه ${i}`, memberIds[0], memberIds)),
    });
    if (exp.status !== 200) throw new Error(`expense ${i} ${exp.status} ${await exp.text()}`);

    if (i % 3 === 0) {
      const pay = await app.request(`/periods/${period.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.token}` },
        body: JSON.stringify({
          id: `p-${i}`,
          fromMemberId: memberIds[1],
          toMemberId: memberIds[0],
          amount: 1000,
          currency: 'IRT',
          kind: 'settlement',
          fxRate: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 0,
          status: 'settled',
        }),
      });
      if (pay.status !== 200) throw new Error(`payment ${i} ${pay.status} ${await pay.text()}`);
    }
  }

  const sample = periods[0]!;
  const rejected = await app.request(`/periods/${sample.id}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sample.owner.token}` },
    body: JSON.stringify({ ops: [{ entity: 'expense', action: 'upsert', payload: { id: 'nope' } }] }),
  });
  if (rejected.status !== 410) throw new Error(`expected /sync ops → 410, got ${rejected.status}`);

  const pullA = await app.request(`/periods/${sample.id}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sample.owner.token}` },
    body: JSON.stringify({ deviceId: 'load-a' }),
  });
  const pullB = await app.request(`/periods/${sample.id}/snapshot`, {
    headers: { Authorization: `Bearer ${sample.member.token}` },
  });
  type Snap = { expenses: { id: string }[]; payments: { id: string }[]; members: { id: string }[]; version: number };
  const a = await json<Snap>(pullA);
  const b = await json<Snap>(pullB);
  if (idsOf(a.expenses) !== idsOf(b.expenses) || idsOf(a.payments) !== idsOf(b.payments) || idsOf(a.members) !== idsOf(b.members)) {
    throw new Error('owner/member snapshots diverged');
  }
  if (a.version !== b.version) throw new Error(`version mismatch ${a.version} vs ${b.version}`);

  const second = await app.request(`/periods/${sample.id}/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sample.member.token}` },
    body: JSON.stringify(expenseBody('e-0-offline-flush', 'از عضو پس از آفلاین', 'm1-0', ['own-0', 'm1-0', 'm2-0'])),
  });
  if (second.status !== 200) throw new Error(`flush-style write failed ${second.status}`);

  const againA = await json<Snap>(
    await app.request(`/periods/${sample.id}/snapshot`, { headers: { Authorization: `Bearer ${sample.owner.token}` } }),
  );
  const againB = await json<Snap>(
    await app.request(`/periods/${sample.id}/snapshot`, { headers: { Authorization: `Bearer ${sample.member.token}` } }),
  );
  if (idsOf(againA.expenses) !== idsOf(againB.expenses)) throw new Error('post-write snapshots diverged');
  if (!againA.expenses.some((e) => e.id === 'e-0-offline-flush')) throw new Error('flushed expense missing');

  console.log('load-sync ok', {
    users: USERS,
    periods: PERIODS,
    sample: sample.id,
    version: againA.version,
    expenses: againA.expenses.length,
  });
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
