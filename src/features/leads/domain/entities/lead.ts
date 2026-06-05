/** Lead-loop domain — pure value objects + tolerant mappers.
 *  No Supabase import: every function here is unit-testable on plain data.
 *  Mirrors the 0034_leads RPC contracts (create_lead / get_sent_leads /
 *  get_received_leads / mark_lead_read). The received view carries the buyer's
 *  display NAME only — NEVER contact details — matching get_received_leads. */

export const MESSAGE_MIN = 1;
export const MESSAGE_MAX = 1000;

export type LeadStatus = 'new' | 'read' | 'replied' | 'closed';

/** The row returned by create_lead. */
export interface CreatedLead {
  id: string;
  status: LeadStatus;
  createdAt?: string;
}

/** A lead in the buyer's outbox (get_sent_leads). */
export interface SentLead {
  id: string;
  propertyId: string;
  title: string;
  coverImagePath?: string;
  message: string;
  status: LeadStatus;
  createdAt?: string;
}

/** A lead in the owner's inbox (get_received_leads). buyerName only — no contact. */
export interface ReceivedLead {
  id: string;
  propertyId: string;
  title: string;
  city?: string;
  coverImagePath?: string;
  buyerName?: string;
  message: string;
  status: LeadStatus;
  createdAt?: string;
}

// --- tolerant snake_case (RPC row) → camelCase (domain) readers --------------
const asRecord = (json: unknown): Record<string, unknown> =>
  json && typeof json === 'object' ? (json as Record<string, unknown>) : {};

const str = (j: Record<string, unknown>, k: string): string | undefined =>
  typeof j[k] === 'string' ? (j[k] as string) : undefined;

const STATUSES: readonly LeadStatus[] = ['new', 'read', 'replied', 'closed'];
const status = (j: Record<string, unknown>, k: string): LeadStatus => {
  const v = j[k];
  return typeof v === 'string' && (STATUSES as readonly string[]).includes(v) ? (v as LeadStatus) : 'new';
};

/** Maps the create_lead jsonb response. Returns null when the row has no id
 *  (so the caller can treat an empty response as an error, not a fake lead). */
export function mapCreatedLead(json: unknown): CreatedLead | null {
  if (json == null) return null;
  const j = asRecord(json);
  const id = str(j, 'id');
  if (!id) return null;
  return { id, status: status(j, 'status'), createdAt: str(j, 'created_at') };
}

export function mapSentLead(json: unknown): SentLead {
  const j = asRecord(json);
  return {
    id: str(j, 'id') ?? '',
    propertyId: str(j, 'property_id') ?? '',
    title: str(j, 'title') ?? '',
    coverImagePath: str(j, 'cover_image_path'),
    message: str(j, 'message') ?? '',
    status: status(j, 'status'),
    createdAt: str(j, 'created_at'),
  };
}

export function mapSentLeads(rows: unknown): SentLead[] {
  return Array.isArray(rows) ? rows.map(mapSentLead) : [];
}

export function mapReceivedLead(json: unknown): ReceivedLead {
  const j = asRecord(json);
  return {
    id: str(j, 'id') ?? '',
    propertyId: str(j, 'property_id') ?? '',
    title: str(j, 'title') ?? '',
    city: str(j, 'city'),
    coverImagePath: str(j, 'cover_image_path'),
    buyerName: str(j, 'buyer_name'),
    message: str(j, 'message') ?? '',
    status: status(j, 'status'),
    createdAt: str(j, 'created_at'),
  };
}

export function mapReceivedLeads(rows: unknown): ReceivedLead[] {
  return Array.isArray(rows) ? rows.map(mapReceivedLead) : [];
}
