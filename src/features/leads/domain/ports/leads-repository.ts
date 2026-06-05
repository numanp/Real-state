import type {
  CreatedLead,
  ReceivedLead,
  RepliedMessage,
  SentLead,
  ThreadMessage,
} from '@/features/leads/domain/entities/lead';

/** Domain failure codes — mirror the server RAISE codes in 0034_leads.sql /
 *  0035_lead_messages.sql (P0001). 'unknown' is the fallback for unrecognized
 *  transport/DB errors. */
const KNOWN_CODES = [
  'auth_required',
  'invalid_message',
  'property_not_found',
  'self_inquiry',
  'lead_rate_limited',
  'lead_not_found',
  'not_participant',
] as const;

export type LeadErrorCode = (typeof KNOWN_CODES)[number] | 'unknown';

export class LeadError extends Error {
  constructor(
    public readonly code: LeadErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'LeadError';
  }
}

/** Translate a raw Supabase/PostgREST error message into a typed LeadError. The
 *  server RAISEs the code string AS the message (0034), so a substring match is
 *  enough; anything unrecognized falls back to 'unknown'. Keeps the in-memory
 *  and Supabase repos behaving identically for the UI (both throw LeadError). */
export function leadErrorFromMessage(message: string): LeadError {
  const code = KNOWN_CODES.find((c) => message.includes(c));
  return new LeadError(code ?? 'unknown', message);
}

/**
 * Lead-loop port. create_lead binds the buyer to auth.uid() server-side;
 * get_received_leads is owner-scoped and NEVER returns buyer contact details;
 * get_sent_leads is buyer-scoped; mark_lead_read is owner-scoped. All access is
 * via the 0034 RPCs — the table is unreachable directly.
 */
export interface LeadsRepository {
  /** Send an inquiry on a property. Returns the created lead. */
  createLead(propertyId: string, message: string): Promise<CreatedLead>;
  /** The caller's outbox, newest-first. */
  getSentLeads(limit?: number, offset?: number): Promise<SentLead[]>;
  /** The caller's inbox (leads on their listings), newest-first. */
  getReceivedLeads(limit?: number, offset?: number): Promise<ReceivedLead[]>;
  /** Flip one of the caller's received leads from 'new' to 'read'. Idempotent. */
  markLeadRead(leadId: string): Promise<void>;
  /** Post a message to a lead's thread (buyer or owner only). Flips it to 'replied'. */
  replyToLead(leadId: string, body: string): Promise<RepliedMessage>;
  /** The lead's thread (original inquiry + replies), oldest-first. Participant-only. */
  getLeadThread(leadId: string, limit?: number, offset?: number): Promise<ThreadMessage[]>;
}
