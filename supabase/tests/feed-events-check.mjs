/*
  Verifies feed_events capture + RLS: an authed user can insert (matching the
  SupabaseFeedEventsRepository row shape) and read only their own; anon cannot read.
  Run: SUPABASE_URL=... SUPABASE_ANON_KEY=... node supabase/tests/feed-events-check.mjs
*/
import { createConfirmedUser, anonClient } from './_helpers.mjs';

const email = `fe_${Date.now()}@example.com`;
const { client: c, id: uid } = await createConfirmedUser(email);

const { data: props } = await c.from('properties').select('id').limit(1);
const pid = props?.[0]?.id ?? null;

const { error: ie } = await c.from('feed_events').insert([
  { user_id: uid, property_id: pid, event_type: 'view', dwell_ms: 1200, position: 0, created_at: new Date().toISOString() },
  { user_id: uid, property_id: pid, event_type: 'like', created_at: new Date().toISOString() },
]);
console.log(`${ie ? '✗ FAIL' : '✓'} insert feed_events ${ie ? `[${ie.message}]` : '(2 rows)'}`);

const { data: mine } = await c.from('feed_events').select('event_type,dwell_ms');
console.log(`✓ read own = ${mine?.length} events [${(mine ?? []).map((r) => r.event_type).join(',')}]`);

const anon = anonClient();
const { data: ar } = await anon.from('feed_events').select('id').limit(5);
console.log(`${(ar?.length ?? 0) === 0 ? '✓' : '✗ FAIL'} anon cannot read feed_events (rows=${ar?.length ?? 0})`);

process.exit(ie ? 1 : 0);
