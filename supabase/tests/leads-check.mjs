/*
  Verifies the lead-loop DB layer (0034_leads). The `leads` table is RPC-ONLY
  (mirrors agency_reviews 0020-0022): it carries buyer/owner ids, so it is
  UNREACHABLE at the GRANT layer and every path goes through SECURITY DEFINER
  RPCs bound to auth.uid().

  Proves:
    - leads SELECT/INSERT denied at the grant layer (anon).
    - create_lead requires auth (anonymous rejected).
    - whitespace-only message rejected server-side (1..1000 contract).
    - a buyer sends a lead on an OWNER's listing → it lands in the owner's
      get_received_leads (with the property title + buyer name) and the buyer's
      get_sent_leads, with status 'new'.
    - a third user's received list does NOT include it (isolation).
    - self-inquiry (owner on their own listing) rejected.
    - a 2nd same-day lead to the SAME property is rejected (per-property dedup),
      while a lead to a DIFFERENT property is allowed.
    - mark_lead_read flips status 'new' -> 'read' for the owner only.

  Push fan-out (pg_net → Expo) is fire-and-forget with no receipt, so it is not
  asserted here.

  Run: SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
       node supabase/tests/leads-check.mjs
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

const TITLE = 'Depto para consultas';
const makeListing = async (client, ownerId, title = TITLE) =>
  client
    .from('properties')
    .insert({
      owner_id: ownerId,
      title,
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

// --- setup: an owner with TWO real, visible listings --------------------------
// Seed listings have owner_id NULL (read-only), so the owner-side inbox needs a
// genuinely owned property. Two listings let us prove the dedup is per-property.
const owner = await signUp('lead_owner');
const { data: prop, error: pe } = await makeListing(owner.client, owner.id);
const { data: prop2, error: pe2 } = await makeListing(owner.client, owner.id, 'Segundo aviso');
if (pe || !prop || pe2 || !prop2) {
  console.error('could not create owner listings:', pe?.message ?? pe2?.message);
  process.exit(1);
}
const propertyId = prop.id;
const propertyId2 = prop2.id;

// --- leads is unreachable at the GRANT layer (not just RLS rows) --------------
const anon = anonClient();
const { error: leakErr } = await anon.from('leads').select('buyer_id').limit(1);
ok('leads SELECT denied at the grant layer (anon)', !!leakErr, leakErr?.message);
const insLeak = await anon.from('leads').insert({ property_id: propertyId, message: 'x' });
ok('leads INSERT denied at the grant layer (anon)', !!insLeak.error, insLeak.error?.message);

// --- anonymous cannot send a lead (auth required) ----------------------------
const anonSend = await anon.rpc('create_lead', { p_property_id: propertyId, p_message: 'hola' });
ok('anonymous user cannot send a lead', !!anonSend.error, anonSend.error?.message);

// --- message validation: whitespace-only rejected (independent buyer) --------
const validator = await signUp('lead_val');
const emptyMsg = await validator.client.rpc('create_lead', { p_property_id: propertyId, p_message: '   ' });
ok('whitespace-only message rejected server-side', !!emptyMsg.error, emptyMsg.error?.message);

// --- buyer sends a valid lead on the owner's listing (POSITIVE — drives RED) --
const MSG = 'Me interesa, ¿sigue disponible?';
const buyer = await signUp('lead_buyer');
const { data: lead, error: sendErr } = await buyer.client.rpc('create_lead', {
  p_property_id: propertyId,
  p_message: MSG,
});
ok('buyer can send a lead', !sendErr && !!lead?.id, sendErr?.message ?? JSON.stringify(lead));
ok("new lead status is 'new'", lead?.status === 'new', JSON.stringify(lead?.status));

// --- it lands in the buyer's sent list, carrying the property title -----------
const { data: sent } = await buyer.client.rpc('get_sent_leads', { p_limit: 50, p_offset: 0 });
const sentRow = (sent ?? []).find((r) => r.id === lead?.id);
ok('lead appears in sender get_sent_leads', !!sentRow);
ok('sent row carries the property title', sentRow?.title === TITLE, sentRow?.title);
ok("sent row status is 'new'", sentRow?.status === 'new', sentRow?.status);

// --- it lands in the OWNER's received list, with property + buyer fields ------
const { data: recv } = await owner.client.rpc('get_received_leads', { p_limit: 50, p_offset: 0 });
const recvRow = (recv ?? []).find((r) => r.id === lead?.id);
ok('lead appears in owner get_received_leads', !!recvRow);
ok('received row carries the property title', recvRow?.title === TITLE, recvRow?.title);
ok('received row carries the buyer message', recvRow?.message === MSG, recvRow?.message);
ok('received row exposes a buyer_name field (no contact)', recvRow != null && 'buyer_name' in recvRow);

// --- a third user's received list does NOT include it (isolation) ------------
const other = await signUp('lead_other');
const { data: otherRecv } = await other.client.rpc('get_received_leads', { p_limit: 50, p_offset: 0 });
ok(
  "another user's received list does not include the lead",
  !(otherRecv ?? []).some((r) => r.id === lead?.id),
);

// --- self-inquiry (owner on their OWN listing) rejected ----------------------
const self = await owner.client.rpc('create_lead', { p_property_id: propertyId, p_message: 'a mí mismo' });
ok('self-inquiry rejected server-side', !!self.error, self.error?.message);

// --- per-property dedup: 2nd same-day lead to the SAME property rejected ------
const dup = await buyer.client.rpc('create_lead', { p_property_id: propertyId, p_message: 'otra consulta' });
ok('2nd same-day lead to same property is rejected', !!dup.error, dup.error?.message);

// --- ...but a lead to a DIFFERENT property the same day is allowed ------------
const { data: lead2, error: send2Err } = await buyer.client.rpc('create_lead', {
  p_property_id: propertyId2,
  p_message: 'Consulta por el segundo',
});
ok('lead to a DIFFERENT property same day is allowed', !send2Err && !!lead2?.id, send2Err?.message);

// --- mark_lead_read flips 'new' -> 'read' for the owner ----------------------
const mark = await owner.client.rpc('mark_lead_read', { p_lead_id: lead?.id });
ok('owner can mark a lead read', !mark.error, mark.error?.message);
const { data: recvAfter } = await owner.client.rpc('get_received_leads', { p_limit: 50, p_offset: 0 });
const readRow = (recvAfter ?? []).find((r) => r.id === lead?.id);
ok("marked lead now reads status 'read'", readRow?.status === 'read', readRow?.status);

// --- a non-owner cannot mark someone else's lead read ------------------------
const otherMark = await other.client.rpc('mark_lead_read', { p_lead_id: lead2?.id });
const { data: stillNew } = await buyer.client.rpc('get_sent_leads', { p_limit: 50, p_offset: 0 });
const lead2Row = (stillNew ?? []).find((r) => r.id === lead2?.id);
ok("a non-owner's mark_lead_read does not change the lead", lead2Row?.status === 'new', `${otherMark.error?.message ?? ''} status=${lead2Row?.status}`);

console.log(`\n${fail === 0 ? 'ALL OK' : `${fail} FAILED`}`);
process.exit(fail === 0 ? 0 : 1);
