import type { Folder } from '@/features/folders/domain/entities/folder';

export type FolderErrorCode = 'invalid_name' | 'duplicate_name' | 'not_found';

export class FolderError extends Error {
  constructor(
    public readonly code: FolderErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'FolderError';
  }
}

/**
 * Folders + the property↔folder "save" edge. Every method is scoped by userId
 * (per-owner isolation = the in-memory mirror of the RLS + owns_folder() guard).
 */
export interface FoldersRepository {
  listFolders(userId: string): Promise<Folder[]>;
  createFolder(userId: string, name: string): Promise<Folder>;
  renameFolder(userId: string, folderId: string, name: string): Promise<void>;
  deleteFolder(userId: string, folderId: string): Promise<void>;
  /** Save a property into the given folders. If folderIds is empty, the default
   *  'Favoritos' folder is used (created on first use). Idempotent. */
  saveToFolders(userId: string, propertyId: string, folderIds: string[]): Promise<void>;
  removeFromFolder(userId: string, propertyId: string, folderId: string): Promise<void>;
  foldersContaining(userId: string, propertyId: string): Promise<string[]>;
  listFolderItems(userId: string, folderId: string): Promise<string[]>;
}
