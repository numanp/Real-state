import { describe, expect, it } from 'vitest';
import { LeadsService } from '@/features/leads/application/leads-service';
import {
  createLeadsStore,
  InMemoryLeadsRepository,
} from '@/features/leads/infrastructure/in-memory-leads-repository';
import { leadErrorFromMessage } from '@/features/leads/domain/ports/leads-repository';

const PROP = 'prop-1';

/** A buyer view and an owner view over a SHARED store, so a lead created by the
 *  buyer surfaces in the owner's received inbox — the two-sided loop. */
function setup() {
  const store = createLeadsStore();
  store.props.set(PROP, { ownerId: 'owner', title: 'Depto para consultas', city: 'Buenos Aires' });
  const buyer = new LeadsService(new InMemoryLeadsRepository('buyer', store));
  const owner = new LeadsService(new InMemoryLeadsRepository('owner', store));
  return { store, buyer, owner };
}

describe('LeadsService', () => {
  it('sends a valid lead and reflects it in sent + the owner received inbox', async () => {
    const { buyer, owner } = setup();

    const created = await buyer.createLead(PROP, '  Me interesa  ');
    expect(created.status).toBe('new');
    expect(created.id).toBeTruthy();

    const sent = await buyer.getSentLeads();
    expect(sent).toHaveLength(1);
    expect(sent[0].title).toBe('Depto para consultas');
    expect(sent[0].status).toBe('new');

    const received = await owner.getReceivedLeads();
    expect(received).toHaveLength(1);
    expect(received[0].message).toBe('Me interesa'); // trimmed server-side mirror
    expect(received[0]).not.toHaveProperty('buyerId'); // identity is name-only, never id
  });

  it('rejects an empty/oversized message BEFORE touching the repository', async () => {
    const { buyer } = setup();
    await expect(buyer.createLead(PROP, '   ')).rejects.toMatchObject({ code: 'invalid_message' });
    await expect(buyer.createLead(PROP, 'x'.repeat(1001))).rejects.toMatchObject({ code: 'invalid_message' });
    expect(await buyer.getSentLeads()).toHaveLength(0);
  });

  it('rejects a self-inquiry on your own listing', async () => {
    const { owner } = setup();
    await expect(owner.createLead(PROP, 'a mí mismo')).rejects.toMatchObject({ code: 'self_inquiry' });
    expect(await owner.getSentLeads()).toHaveLength(0);
  });

  it('rejects a 2nd same-day lead to the same property (rate limit)', async () => {
    const { buyer } = setup();
    await buyer.createLead(PROP, 'primera');
    await expect(buyer.createLead(PROP, 'segunda')).rejects.toMatchObject({ code: 'lead_rate_limited' });
    expect(await buyer.getSentLeads()).toHaveLength(1);
  });

  it('allows a lead to a DIFFERENT property the same day', async () => {
    const { store, buyer } = setup();
    store.props.set('prop-2', { ownerId: 'owner', title: 'Segundo aviso' });
    await buyer.createLead(PROP, 'primera');
    const second = await buyer.createLead('prop-2', 'otra propiedad');
    expect(second.id).toBeTruthy();
    expect(await buyer.getSentLeads()).toHaveLength(2);
  });

  it('lets the owner (and only the owner) mark a received lead read', async () => {
    const { buyer, owner } = setup();
    const created = await buyer.createLead(PROP, 'hola');

    await buyer.markLeadRead(created.id); // not the owner — no-op
    expect((await owner.getReceivedLeads())[0].status).toBe('new');

    await owner.markLeadRead(created.id);
    expect((await owner.getReceivedLeads())[0].status).toBe('read');
  });
});

describe('LeadsService — messaging (Phase 2)', () => {
  it('lets a participant reply and builds the thread (original + replies, is_mine per side)', async () => {
    const { buyer, owner } = setup();
    const lead = await buyer.createLead(PROP, 'Hola, ¿disponible?');

    await owner.replyToLead(lead.id, 'Sí, disponible');
    await buyer.replyToLead(lead.id, '¿Mañana?');

    const buyerThread = await buyer.getLeadThread(lead.id);
    expect(buyerThread).toHaveLength(3);
    expect(buyerThread.map((m) => m.isMine)).toEqual([true, false, true]);
    expect(buyerThread[0].body).toBe('Hola, ¿disponible?');
    expect(buyerThread.every((m) => !('senderId' in m))).toBe(true);

    const ownerThread = await owner.getLeadThread(lead.id);
    expect(ownerThread.map((m) => m.isMine)).toEqual([false, true, false]);
  });

  it("flips the lead to 'replied' on reply", async () => {
    const { buyer, owner } = setup();
    const lead = await buyer.createLead(PROP, 'Hola');
    await owner.replyToLead(lead.id, 'Buenas');
    const recv = await owner.getReceivedLeads();
    expect(recv.find((r) => r.id === lead.id)?.status).toBe('replied');
  });

  it('rejects an empty reply before touching the repository', async () => {
    const { buyer } = setup();
    const lead = await buyer.createLead(PROP, 'Hola');
    await expect(buyer.replyToLead(lead.id, '   ')).rejects.toMatchObject({ code: 'invalid_message' });
  });

  it('rejects a non-participant reply and gives them an empty thread', async () => {
    const { store, buyer } = setup();
    const lead = await buyer.createLead(PROP, 'Hola');
    const stranger = new LeadsService(new InMemoryLeadsRepository('stranger', store));
    await expect(stranger.replyToLead(lead.id, 'me cuelo')).rejects.toMatchObject({
      code: 'not_participant',
    });
    expect(await stranger.getLeadThread(lead.id)).toHaveLength(0);
  });
});

describe('leadErrorFromMessage', () => {
  it('maps a server P0001 message to a typed LeadError code', () => {
    expect(leadErrorFromMessage('leads.createLead: lead_rate_limited').code).toBe('lead_rate_limited');
    expect(leadErrorFromMessage('self_inquiry').code).toBe('self_inquiry');
    expect(leadErrorFromMessage('invalid_message').code).toBe('invalid_message');
  });

  it('falls back to unknown for an unrecognized message', () => {
    expect(leadErrorFromMessage('some random transport error').code).toBe('unknown');
  });
});
