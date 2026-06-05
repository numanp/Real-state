import { z } from 'zod';
import {
  type CreatedLead,
  MESSAGE_MAX,
  MESSAGE_MIN,
  type ReceivedLead,
  type SentLead,
} from '@/features/leads/domain/entities/lead';
import { LeadError, type LeadsRepository } from '@/features/leads/domain/ports/leads-repository';

const messageSchema = z.string().min(MESSAGE_MIN).max(MESSAGE_MAX);

/** Thin orchestrator over the leads port. Validation here is a UX gate (fail
 *  fast, clear errors) — the server RPC (0034) re-checks everything and is the
 *  real authority (self-inquiry, rate-limit, property visibility). Reads
 *  delegate straight through. */
export class LeadsService {
  constructor(private readonly repo: LeadsRepository) {}

  async createLead(propertyId: string, message: string): Promise<CreatedLead> {
    const trimmed = message.trim();
    if (!messageSchema.safeParse(trimmed).success) {
      throw new LeadError('invalid_message', `message must be ${MESSAGE_MIN}-${MESSAGE_MAX} chars`);
    }
    return this.repo.createLead(propertyId, trimmed);
  }

  getSentLeads(limit?: number, offset?: number): Promise<SentLead[]> {
    return this.repo.getSentLeads(limit, offset);
  }

  getReceivedLeads(limit?: number, offset?: number): Promise<ReceivedLead[]> {
    return this.repo.getReceivedLeads(limit, offset);
  }

  markLeadRead(leadId: string): Promise<void> {
    return this.repo.markLeadRead(leadId);
  }
}
