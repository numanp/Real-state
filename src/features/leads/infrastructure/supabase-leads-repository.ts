import { supabase } from '@/core/supabase/client';
import {
  type CreatedLead,
  mapCreatedLead,
  mapReceivedLeads,
  mapRepliedMessage,
  mapSentLeads,
  mapThread,
  type ReceivedLead,
  type RepliedMessage,
  type SentLead,
  type ThreadMessage,
} from '@/features/leads/domain/entities/lead';
import { leadErrorFromMessage, type LeadsRepository } from '@/features/leads/domain/ports/leads-repository';

/** Reads/writes leads through the 0034 RPCs. The table is unreachable directly
 *  (REVOKE ALL + FORCE RLS + no policy): create_lead binds the buyer to
 *  auth.uid(); get_received_leads is owner-scoped and never returns buyer
 *  contact; get_sent_leads is buyer-scoped. The RPC contract IS the gate.
 *  Server RAISE codes (P0001) on create are translated to typed LeadError. */
export class SupabaseLeadsRepository implements LeadsRepository {
  async createLead(propertyId: string, message: string): Promise<CreatedLead> {
    const { data, error } = await supabase.rpc('create_lead', {
      p_property_id: propertyId,
      p_message: message,
    });
    if (error) throw leadErrorFromMessage(error.message);
    const created = mapCreatedLead(data);
    if (!created) throw new Error('leads.createLead: empty response');
    return created;
  }

  async getSentLeads(limit = 20, offset = 0): Promise<SentLead[]> {
    const { data, error } = await supabase.rpc('get_sent_leads', {
      p_limit: limit,
      p_offset: offset,
    });
    if (error) throw new Error(`leads.getSentLeads: ${error.message}`);
    return mapSentLeads(data);
  }

  async getReceivedLeads(limit = 20, offset = 0): Promise<ReceivedLead[]> {
    const { data, error } = await supabase.rpc('get_received_leads', {
      p_limit: limit,
      p_offset: offset,
    });
    if (error) throw new Error(`leads.getReceivedLeads: ${error.message}`);
    return mapReceivedLeads(data);
  }

  async markLeadRead(leadId: string): Promise<void> {
    const { error } = await supabase.rpc('mark_lead_read', { p_lead_id: leadId });
    if (error) throw new Error(`leads.markLeadRead: ${error.message}`);
  }

  async replyToLead(leadId: string, body: string): Promise<RepliedMessage> {
    const { data, error } = await supabase.rpc('reply_to_lead', {
      p_lead_id: leadId,
      p_body: body,
    });
    if (error) throw leadErrorFromMessage(error.message);
    const replied = mapRepliedMessage(data);
    if (!replied) throw new Error('leads.replyToLead: empty response');
    return replied;
  }

  async getLeadThread(leadId: string, limit = 100, offset = 0): Promise<ThreadMessage[]> {
    const { data, error } = await supabase.rpc('get_lead_thread', {
      p_lead_id: leadId,
      p_limit: limit,
      p_offset: offset,
    });
    if (error) throw new Error(`leads.getLeadThread: ${error.message}`);
    return mapThread(data);
  }

  async closeLead(leadId: string): Promise<void> {
    const { error } = await supabase.rpc('close_lead', { p_lead_id: leadId });
    if (error) throw leadErrorFromMessage(error.message);
  }
}
