import { DEFAULT_FOLDER_NAME, type Folder } from '@/features/folders/domain/entities/folder';
import { FolderError, type FoldersRepository } from '@/features/folders/domain/ports/folders-repository';

interface FolderRecord {
  id: string;
  userId: string;
  name: string;
  isDefault: boolean;
  items: Set<string>;
}

export class InMemoryFoldersRepository implements FoldersRepository {
  private readonly byUser = new Map<string, FolderRecord[]>();
  private counter = 0;

  async listFolders(userId: string): Promise<Folder[]> {
    return this.foldersOf(userId).map((f) => this.toFolder(f));
  }

  async createFolder(userId: string, name: string): Promise<Folder> {
    this.assertUniqueName(userId, name);
    return this.toFolder(this.insert(userId, name, false));
  }

  async renameFolder(userId: string, folderId: string, name: string): Promise<void> {
    const folder = this.requireFolder(userId, folderId);
    this.assertUniqueName(userId, name, folderId);
    folder.name = name;
  }

  async deleteFolder(userId: string, folderId: string): Promise<void> {
    const list = this.foldersOf(userId);
    const idx = list.findIndex((f) => f.id === folderId);
    if (idx === -1) throw new FolderError('not_found', 'Carpeta no encontrada');
    list.splice(idx, 1);
  }

  async saveToFolders(userId: string, propertyId: string, folderIds: string[]): Promise<void> {
    const targets =
      folderIds.length === 0
        ? [this.ensureDefault(userId)]
        : folderIds.map((id) => this.requireFolder(userId, id));
    for (const folder of targets) folder.items.add(propertyId);
  }

  async removeFromFolder(userId: string, propertyId: string, folderId: string): Promise<void> {
    this.requireFolder(userId, folderId).items.delete(propertyId);
  }

  async foldersContaining(userId: string, propertyId: string): Promise<string[]> {
    return this.foldersOf(userId)
      .filter((f) => f.items.has(propertyId))
      .map((f) => f.id);
  }

  async listFolderItems(userId: string, folderId: string): Promise<string[]> {
    return [...this.requireFolder(userId, folderId).items];
  }

  // --- internals ---

  private foldersOf(userId: string): FolderRecord[] {
    let list = this.byUser.get(userId);
    if (!list) {
      list = [];
      this.byUser.set(userId, list);
    }
    return list;
  }

  private insert(userId: string, name: string, isDefault: boolean): FolderRecord {
    this.counter += 1;
    const record: FolderRecord = {
      id: `folder-${this.counter}`,
      userId,
      name,
      isDefault,
      items: new Set<string>(),
    };
    this.foldersOf(userId).push(record);
    return record;
  }

  private ensureDefault(userId: string): FolderRecord {
    return this.foldersOf(userId).find((f) => f.isDefault) ?? this.insert(userId, DEFAULT_FOLDER_NAME, true);
  }

  private requireFolder(userId: string, folderId: string): FolderRecord {
    const found = this.foldersOf(userId).find((f) => f.id === folderId);
    if (!found) throw new FolderError('not_found', 'Carpeta no encontrada');
    return found;
  }

  private assertUniqueName(userId: string, name: string, exceptId?: string): void {
    const clash = this.foldersOf(userId).some(
      (f) => f.id !== exceptId && f.name.toLowerCase() === name.toLowerCase(),
    );
    if (clash) throw new FolderError('duplicate_name', 'Ya tenés una carpeta con ese nombre');
  }

  private toFolder(r: FolderRecord): Folder {
    return { id: r.id, userId: r.userId, name: r.name, isDefault: r.isDefault, itemCount: r.items.size };
  }
}
