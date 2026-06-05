/*
  Verifies the lead-loop Phase 2 — two-way messaging (0035_lead_messages). Like
  `leads`, lead_messages is RPC-ONLY (carries sender ids): unreachable at the
  GRANT layer; every path is a SECURITY DEFINER RPC bound to auth.uid().

  Proves:
    - lead_messages SELECT/INSERT denied at the grant layer (anon).
    - reply_to_lead requires auth (anonymous rejected) + validates the body.
    - only the lead's buyer OR owner can reply; a third party is rejected and
      sees an EMPTY thread.
    - replying flips the lead status to 'replied'.
    - get_lead_thread returns the original inquiry + replies in chronological
      order, with is_mine relative to the caller (no sender_id leak), and the
      buyer and owner see the SAME thread with is_mine mirrored.

  Push on reply (pg_net → Expo) is fire-and-forget; not asserted here.

  Run: SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
       node supabase/tests/leads-thread-check.mjs
*/
import { createConfirmedUser, anonClient } from './_helpers.mjs';

const ANON = process.env.SUPABASE_ANON_KEY;

if (!ANON) {
  console.error('SUPABASE_ANON_KEY is required');
  process.exit(2);
}

let fail = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) fail++;
  console.log(`${cond ? '✓' : '✗ FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
};

const signUp = (prefix) =>
  createConfirmedUser(`${prefix}_${Math.floor(Math.random() * 1e9)}_${Date.now()}@example.com`);

// --- setup: owner with a listing + a buyer's lead on it ----------------------
const owner = await signUp('thr_owner');
const { data: prop, error: pe } = await owner.client
  .from('properties')
  .insert({
    owner_id: owner.id,
    title: 'Aviso con hilo',
    listing_type: 'rent',
    property_kind: 'apartment',
    status: 'active',
    price_cents: 50_000_000,
    currency: 'ARS',
    bedrooms: 2,
    bathrooms: 1,
    city: 'Buenos Aires',
  })
  .select('id')
  .single();
if (pe || !prop) {
  console.error('could not create owner listing:', pe?.message);
  process.exit(1);
}
const propertyId = prop.id;

const buyer = await signUp('thr_buyer');
const { data: lead, error: sendErr } = await buyer.client.rpc('create_lead', {
  p_property_id: propertyId,
  p_message: 'Hola, ¿sigue disponible?',
});
if (sendErr || !lead?.id) {
  console.error('could not create lead:', sendErr?.message);
  process.exit(1);
}
const leadId = lead.id;

// --- lead_messages is unreachable at the GRANT layer -------------------------
const anon = anonClient();
const { error: leakErr } = await anon.from('lead_messages').select('sender_id').limit(1);
ok('lead_messages SELECT denied at the grant layer (anon)', !!leakErr, leakErr?.message);
const insLeak = await anon.from('lead_messages').insert({ lead_id: leadId, body: 'x' });
ok('lead_messages INSERT denied at the grant layer (anon)', !!insLeak.error, insLeak.error?.message);

// --- anonymous cannot reply --------------------------------------------------
const anonReply = await anon.rpc('reply_to_lead', { p_lead_id: leadId, p_body: 'hola' });
ok('anonymous user cannot reply', !!anonReply.error, anonReply.error?.message);

// --- body validation: whitespace-only rejected -------------------------------
const emptyReply = await owner.client.rpc('reply_to_lead', { p_lead_id: leadId, p_body: '   ' });
ok('whitespace-only reply rejected server-side', !!emptyReply.error, emptyReply.error?.message);

// --- a non-participant cannot reply and sees an empty thread -----------------
const stranger = await signUp('thr_stranger');
const strangerReply = await stranger.client.rpc('reply_to_lead', { p_lead_id: leadId, p_body: 'me cuelo' });
ok('a non-participant cannot reply', !!strangerReply.error, strangerReply.error?.message);
const { data: strangerThread } = await stranger.client.rpc('get_lead_thread', {
  p_lead_id: leadId,
  p_limit: 50,
  p_offset: 0,
});
ok('a non-participant sees an empty thread', (strangerThread ?? []).length === 0);

// --- owner replies -> success, lead flips to 'replied' -----------------------
const ownerReply = await owner.client.rpc('reply_to_lead', { p_lead_id: leadId, p_body: 'Sí, disponible. ¿Cuándo la verías?' });
ok('owner can reply to the lead', !ownerReply.error && !!ownerReply.data?.id, ownerReply.error?.message);
const { data: recv } = await owner.client.rpc('get_received_leads', { p_limit: 50, p_offset: 0 });
ok("lead status becomes 'replied' after a reply", (recv ?? []).find((r) => r.id === leadId)?.status === 'replied');

// --- buyer replies -----------------------------------------------------------
const buyerReply = await buyer.client.rpc('reply_to_lead', { p_lead_id: leadId, p_body: 'Mañana a la tarde' });
ok('buyer can reply to the lead', !buyerReply.error && !!buyerReply.data?.id, buyerReply.error?.message);

// --- thread: original inquiry + 2 replies, chronological, is_mine correct ----
const { data: buyerThread } = await buyer.client.rpc('get_lead_thread', { p_lead_id: leadId, p_limit: 50, p_offset: 0 });
ok('thread has the original inquiry + 2 replies (3 entries)', (buyerThread ?? []).length === 3, `len=${buyerThread?.length}`);
const ordered = (buyerThread ?? []).every((m, i, a) => i === 0 || a[i - 1].created_at <= m.created_at);
ok('thread is ordered oldest-first', ordered);
ok("buyer's view: original message is_mine=true", buyerThread?.[0]?.is_mine === true, JSON.stringify(buyerThread?.[0]));
ok("buyer's view: owner reply is_mine=false", buyerThread?.[1]?.is_mine === false);
ok("buyer's view: own reply is_mine=true", buyerThread?.[2]?.is_mine === true);
ok('thread rows never expose sender_id', (buyerThread ?? []).every((m) => !('sender_id' in m)));

// --- owner sees the SAME thread with is_mine mirrored ------------------------
const { data: ownerThread } = await owner.client.rpc('get_lead_thread', { p_lead_id: leadId, p_limit: 50, p_offset: 0 });
ok('owner sees the same 3-entry thread', (ownerThread ?? []).length === 3);
ok("owner's view: original message is_mine=false", ownerThread?.[0]?.is_mine === false);
ok("owner's view: owner reply is_mine=true", ownerThread?.[1]?.is_mine === true);

// --- close / archive (lifecycle) --------------------------------------------
const strangerClose = await stranger.client.rpc('close_lead', { p_lead_id: leadId });
ok('a non-participant cannot close the lead', !!strangerClose.error, strangerClose.error?.message);

const ownerClose = await owner.client.rpc('close_lead', { p_lead_id: leadId });
ok('a participant can close the lead', !ownerClose.error, ownerClose.error?.message);
const { data: recvClosed } = await owner.client.rpc('get_received_leads', { p_limit: 50, p_offset: 0 });
ok("closed lead reads status 'closed'", (recvClosed ?? []).find((r) => r.id === leadId)?.status === 'closed');

// a new reply reopens the conversation
await buyer.client.rpc('reply_to_lead', { p_lead_id: leadId, p_body: 'Reabro la consulta' });
const { data: recvReopened } = await owner.client.rpc('get_received_leads', { p_limit: 50, p_offset: 0 });
ok("a reply reopens a closed lead to 'replied'", (recvReopened ?? []).find((r) => r.id === leadId)?.status === 'replied');

console.log(`\n${fail === 0 ? 'ALL OK' : `${fail} FAILED`}`);
process.exit(fail === 0 ? 0 : 1);
