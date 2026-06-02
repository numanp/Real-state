import { z } from 'zod';

import type { Folder } from '@/features/folders/domain/entities/folder';
import { FolderError, type FoldersRepository } from '@/features/folders/domain/ports/folders-repository';

const nameSchema = z.string().trim().min(1).max(60);

export class FoldersService {
  constructor(private readonly repo: FoldersRepository) {}

  list(userId: string): Promise<Folder[]> {
    return this.repo.listFolders(userId);
  }

  async create(userId: string, name: string): Promise<Folder> {
    return this.repo.createFolder(userId, this.cleanName(name));
  }

  async rename(userId: string, folderId: string, name: string): Promise<void> {
    return this.repo.renameFolder(userId, folderId, this.cleanName(name));
  }

  delete(userId: string, folderId: string): Promise<void> {
    return this.repo.deleteFolder(userId, folderId);
  }

  saveToFolders(userId: string, propertyId: string, folderIds: string[]): Promise<void> {
    return this.repo.saveToFolders(userId, propertyId, folderIds);
  }

  removeFromFolder(userId: string, propertyId: string, folderId: string): Promise<void> {
    return this.repo.removeFromFolder(userId, propertyId, folderId);
  }

  foldersContaining(userId: string, propertyId: string): Promise<string[]> {
    return this.repo.foldersContaining(userId, propertyId);
  }

  listItems(userId: string, folderId: string): Promise<string[]> {
    return this.repo.listFolderItems(userId, folderId);
  }

  private cleanName(name: string): string {
    const parsed = nameSchema.safeParse(name);
    if (!parsed.success) {
      throw new FolderError('invalid_name', 'El nombre debe tener entre 1 y 60 caracteres');
    }
    return parsed.data;
  }
}
