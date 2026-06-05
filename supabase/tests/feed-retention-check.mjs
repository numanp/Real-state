/*
  Verifies the feed_events retention purge (0024): purge_feed_events deletes rows
  older than the retention window and keeps recent ones. Requires the service
  role (to seed events with explicit ages and to run the definer purge — which,
  like dev_grant_entitlement, is REVOKE'd from clients but callable by service_role).
  Run: SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
       node supabase/tests/feed-retention-check.mjs
*/
import { createClient } from '@supabase/supabase-js';
import { createConfirmedUser } from './_helpers.mjs';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const newClient = (key) => createClient(URL, key, { auth: { persistSession: false } });

let fail = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) fail++;
  console.log(`${cond ? '✓' : '✗ FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
};

if (!ANON || !SERVICE) {
  console.error('SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are required');
  process.exit(2);
}

// A confirmed user gives us a real profile (FK target for feed_events).
const { id: userId } = await createConfirmedUser(`ret_${Math.floor(Math.random() * 1e9)}_${Date.now()}@example.com`);

const svc = newClient(SERVICE);
const daysAgo = (n) => new Date(Date.now() - n * 86400_000).toISOString();

// Seed one ancient event (200d) and one fresh event (now) — service_role bypasses RLS.
const { error: insErr } = await svc.from('feed_events').insert([
  { user_id: userId, event_type: 'view', created_at: daysAgo(200) },
  { user_id: userId, event_type: 'view', created_at: daysAgo(0) },
]);
ok('seeded one ancient + one fresh feed_event', !insErr, insErr?.message);

const countFor = async () => {
  const { count } = await svc
    .from('feed_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  return count ?? 0;
};
ok('two events present before purge', (await countFor()) === 2);

// Purge with the default 180d window (callable by service_role despite REVOKE).
const { error: purgeErr } = await svc.rpc('purge_feed_events', {});
ok('purge_feed_events runs via service_role', !purgeErr, purgeErr?.message);

const { data: remaining } = await svc
  .from('feed_events')
  .select('created_at')
  .eq('user_id', userId);
ok('only the fresh event survives (ancient purged)', (remaining?.length ?? 0) === 1, JSON.stringify(remaining));
const survivor = remaining?.[0]?.created_at;
ok(
  'survivor is the recent event',
  survivor != null && Date.now() - new Date(survivor).getTime() < 86400_000,
  survivor,
);

console.log(`\n${fail === 0 ? 'ALL OK' : `${fail} FAILED`}`);
process.exit(fail === 0 ? 0 : 1);
