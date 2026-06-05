import type {
  CreatedLead,
  LeadStatus,
  ReceivedLead,
  RepliedMessage,
  SentLead,
  ThreadMessage,
} from '@/features/leads/domain/entities/lead';
import { LeadError, type LeadsRepository } from '@/features/leads/domain/ports/leads-repository';

interface StoredLead {
  id: string;
  propertyId: string;
  buyerId: string;
  ownerId?: string;
  message: string;
  status: LeadStatus;
  sentOn: string; // YYYY-MM-DD, UTC day — drives the per-(buyer,property)/day dedup
  createdAt: string;
}

interface StoredMessage {
  id: string;
  leadId: string;
  senderId: string;
  body: string;
  createdAt: string;
}

interface PropInfo {
  ownerId?: string;
  title?: string;
  city?: string;
  coverImagePath?: string;
}

/** Shared mutable store so multiple repo views (e.g. a buyer view + an owner
 *  view) over the SAME data each see the other side — the two-sided loop. The
 *  app's DI uses a fresh per-instance store; tests share one. */
export interface LeadsStore {
  rows: StoredLead[];
  messages: StoredMessage[];
  props: Map<string, PropInfo>;
  seq: { n: number };
}

export const createLeadsStore = (): LeadsStore => ({
  rows: [],
  messages: [],
  props: new Map(),
  seq: { n: 0 },
});

/** Offline test double for the leads port. Models a SINGLE current user
 *  (`self`, default 'me') — the in-memory mirror of create/read being bound to
 *  auth.uid() server-side. Self-inquiry + per-(buyer,property)/day dedup mirror
 *  0034 so the UI behaves identically with or without a backend. Input
 *  validation is NOT here — it belongs in LeadsService. */
export class InMemoryLeadsRepository implements LeadsRepository {
  constructor(
    private readonly self: string = 'me',
    private readonly store: LeadsStore = createLeadsStore(),
  ) {}

  async createLead(propertyId: string, message: string): Promise<CreatedLead> {
    const info = this.store.props.get(propertyId);
    if (info?.ownerId && info.ownerId === this.self) {
      throw new LeadError('self_inquiry');
    }

    const sentOn = new Date().toISOString().slice(0, 10);
    const duplicate = this.store.rows.some(
      (r) => r.buyerId === this.self && r.propertyId === propertyId && r.sentOn === sentOn,
    );
    if (duplicate) throw new LeadError('lead_rate_limited');

    const row: StoredLead = {
      id: `ld-${++this.store.seq.n}`,
      propertyId,
      buyerId: this.self,
      ownerId: info?.ownerId,
      message,
      status: 'new',
      sentOn,
      createdAt: new Date().toISOString(),
    };
    this.store.rows.push(row);
    return { id: row.id, status: row.status, createdAt: row.createdAt };
  }

  async getSentLeads(limit = 20, offset = 0): Promise<SentLead[]> {
    return this.store.rows
      .filter((r) => r.buyerId === this.self)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(offset, offset + limit)
      .map((r) => {
        const info = this.store.props.get(r.propertyId);
        return {
          id: r.id,
          propertyId: r.propertyId,
          title: info?.title ?? '',
          coverImagePath: info?.coverImagePath,
          message: r.message,
          status: r.status,
          createdAt: r.createdAt,
        };
      });
  }

  async getReceivedLeads(limit = 20, offset = 0): Promise<ReceivedLead[]> {
    return this.store.rows
      .filter((r) => r.ownerId != null && r.ownerId === this.self)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(offset, offset + limit)
      .map((r) => {
        const info = this.store.props.get(r.propertyId);
        return {
          id: r.id,
          propertyId: r.propertyId,
          title: info?.title ?? '',
          city: info?.city,
          coverImagePath: info?.coverImagePath,
          buyerName: r.buyerId, // a display-name stand-in for the double
          message: r.message,
          status: r.status,
          createdAt: r.createdAt,
        };
      });
  }

  async markLeadRead(leadId: string): Promise<void> {
    const row = this.store.rows.find(
      (r) => r.id === leadId && r.ownerId === this.self && r.status === 'new',
    );
    if (row) row.status = 'read';
  }

  async replyToLead(leadId: string, body: string): Promise<RepliedMessage> {
    const lead = this.store.rows.find((r) => r.id === leadId);
    if (!lead) throw new LeadError('lead_not_found');
    if (!this.participates(lead)) throw new LeadError('not_participant');

    const msg: StoredMessage = {
      id: `lm-${++this.store.seq.n}`,
      leadId,
      senderId: this.self,
      body,
      createdAt: new Date().toISOString(),
    };
    this.store.messages.push(msg);
    lead.status = 'replied';
    return { id: msg.id, createdAt: msg.createdAt };
  }

  async getLeadThread(leadId: string, limit = 100, offset = 0): Promise<ThreadMessage[]> {
    const lead = this.store.rows.find((r) => r.id === leadId);
    if (!lead || !this.participates(lead)) return [];

    const original: ThreadMessage = {
      id: lead.id,
      body: lead.message,
      isMine: lead.buyerId === this.self,
      createdAt: lead.createdAt,
    };
    const replies: ThreadMessage[] = this.store.messages
      .filter((m) => m.leadId === leadId)
      .map((m) => ({ id: m.id, body: m.body, isMine: m.senderId === this.self, createdAt: m.createdAt }));

    return [original, ...replies]
      .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
      .slice(offset, offset + limit);
  }

  /** Caller is the lead's buyer or its (non-null) owner. */
  private participates(lead: StoredLead): boolean {
    return lead.buyerId === this.self || (lead.ownerId != null && lead.ownerId === this.self);
  }
}
