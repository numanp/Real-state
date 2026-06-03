import { supabase } from '@/core/supabase/client';
import type { Folder } from '@/features/folders/domain/entities/folder';
import { FolderError, type FoldersRepository } from '@/features/folders/domain/ports/folders-repository';

interface FolderRow {
  id: string;
  user_id: string;
  name: string;
  is_default: boolean;
  item_count: number;
}

const COLUMNS = 'id,user_id,name,is_default,item_count';

function toFolder(r: FolderRow): Folder {
  return { id: r.id, userId: r.user_id, name: r.name, isDefault: r.is_default, itemCount: r.item_count };
}

function mapWriteError(message: string): FolderError {
  if (/quota/i.test(message)) {
    return new FolderError('quota_exceeded', 'Alcanzaste el límite de carpetas de tu plan.');
  }
  if (/duplicate|unique/i.test(message)) {
    return new FolderError('duplicate_name', 'Ya tenés una carpeta con ese nombre.');
  }
  return new FolderError('invalid_name', message);
}

export class SupabaseFoldersRepository implements FoldersRepository {
  async listFolders(_userId: string): Promise<Folder[]> {
    const { data, error } = await supabase
      .from('folders')
      .select(COLUMNS)
      .order('is_default', { ascending: false })
      .order('name');
    if (error) throw new Error(`folders.list: ${error.message}`);
    return (data ?? []).map((r) => toFolder(r as FolderRow));
  }

  async createFolder(userId: string, name: string): Promise<Folder> {
    const { data, error } = await supabase
      .from('folders')
      .insert({ user_id: userId, name })
      .select(COLUMNS)
      .single();
    if (error) throw mapWriteError(error.message);
    return toFolder(data as FolderRow);
  }

  async renameFolder(_userId: string, folderId: string, name: string): Promise<void> {
    const { data, error } = await supabase.from('folders').update({ name }).eq('id', folderId).select('id');
    if (error) throw mapWriteError(error.message);
    if (!data || data.length === 0) throw new FolderError('not_found', 'Carpeta no encontrada');
  }

  async deleteFolder(_userId: string, folderId: string): Promise<void> {
    const { error } = await supabase.from('folders').delete().eq('id', folderId);
    if (error) throw new Error(`folders.delete: ${error.message}`);
  }

  async saveToFolders(userId: string, propertyId: string, folderIds: string[]): Promise<void> {
    const targets = folderIds.length > 0 ? folderIds : [await this.ensureDefaultFolderId(userId)];
    const rows = targets.map((folder_id) => ({ folder_id, property_id: propertyId, user_id: userId }));
    const { error } = await supabase
      .from('folder_items')
      .upsert(rows, { onConflict: 'folder_id,property_id', ignoreDuplicates: true });
    if (error) throw new Error(`folders.save: ${error.message}`);
  }

  async removeFromFolder(_userId: string, propertyId: string, folderId: string): Promise<void> {
    const { error } = await supabase
      .from('folder_items')
      .delete()
      .eq('folder_id', folderId)
      .eq('property_id', propertyId);
    if (error) throw new Error(`folders.remove: ${error.message}`);
  }

  async foldersContaining(_userId: string, propertyId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('folder_items')
      .select('folder_id')
      .eq('property_id', propertyId);
    if (error) throw new Error(`folders.containing: ${error.message}`);
    return (data ?? []).map((r: { folder_id: string }) => r.folder_id);
  }

  async listFolderItems(_userId: string, folderId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('folder_items')
      .select('property_id')
      .eq('folder_id', folderId);
    if (error) throw new Error(`folders.items: ${error.message}`);
    return (data ?? []).map((r: { property_id: string }) => r.property_id);
  }

  private async ensureDefaultFolderId(userId: string): Promise<string> {
    const { data } = await supabase.from('folders').select('id').eq('is_default', true).maybeSingle();
    if (data?.id) return data.id as string;
    const created = await this.createFolder(userId, 'Favoritos'); // handle_new_user normally makes this
    return created.id;
  }
}
