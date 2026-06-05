import { supabase } from '@/core/supabase/client';
import {
  type CreatedLead,
  mapCreatedLead,
  mapReceivedLeads,
  mapSentLeads,
  type ReceivedLead,
  type SentLead,
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
}
