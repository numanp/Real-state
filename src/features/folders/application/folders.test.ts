import { describe, expect, it } from 'vitest';

import { FoldersService } from '@/features/folders/application/folders-service';
import { DEFAULT_FOLDER_NAME } from '@/features/folders/domain/entities/folder';
import { InMemoryFoldersRepository } from '@/features/folders/infrastructure/in-memory-folders-repository';

const USER = 'user-1';

function setup() {
  const repo = new InMemoryFoldersRepository();
  return { repo, folders: new FoldersService(repo) };
}

describe('FoldersService', () => {
  it('creates and lists folders', async () => {
    const { folders } = setup();
    const f = await folders.create(USER, 'Para visitar');
    expect(f.name).toBe('Para visitar');
    expect((await folders.list(USER)).map((x) => x.name)).toContain('Para visitar');
  });

  it('rejects empty or too-long names', async () => {
    const { folders } = setup();
    await expect(folders.create(USER, '   ')).rejects.toMatchObject({ code: 'invalid_name' });
    await expect(folders.create(USER, 'x'.repeat(61))).rejects.toMatchObject({
      code: 'invalid_name',
    });
  });

  it('rejects duplicate names (case-insensitive)', async () => {
    const { folders } = setup();
    await folders.create(USER, 'Playa');
    await expect(folders.create(USER, 'playa')).rejects.toMatchObject({ code: 'duplicate_name' });
  });

  it('renames and deletes a folder', async () => {
    const { folders } = setup();
    const f = await folders.create(USER, 'Temp');
    await folders.rename(USER, f.id, 'Definitivo');
    expect((await folders.list(USER)).map((x) => x.name)).toContain('Definitivo');
    await folders.delete(USER, f.id);
    expect((await folders.list(USER)).some((x) => x.id === f.id)).toBe(false);
  });

  it('saves a property into folders and reports membership + counts', async () => {
    const { folders } = setup();
    const a = await folders.create(USER, 'A');
    const b = await folders.create(USER, 'B');
    await folders.saveToFolders(USER, 'p1', [a.id, b.id]);
    expect((await folders.foldersContaining(USER, 'p1')).sort()).toEqual([a.id, b.id].sort());
    const refreshed = await folders.list(USER);
    expect(refreshed.find((x) => x.id === a.id)?.itemCount).toBe(1);
  });

  it('auto-creates the default folder when saving with no folder selected', async () => {
    const { folders } = setup();
    await folders.saveToFolders(USER, 'p1', []);
    const list = await folders.list(USER);
    const def = list.find((x) => x.isDefault);
    expect(def?.name).toBe(DEFAULT_FOLDER_NAME);
    expect(await folders.listItems(USER, def!.id)).toEqual(['p1']);
  });

  it('removes a property from a folder', async () => {
    const { folders } = setup();
    const a = await folders.create(USER, 'A');
    await folders.saveToFolders(USER, 'p1', [a.id]);
    await folders.removeFromFolder(USER, 'p1', a.id);
    expect(await folders.foldersContaining(USER, 'p1')).toEqual([]);
  });

  it('isolates folders per user', async () => {
    const { folders } = setup();
    await folders.create('a', 'Mine');
    expect(await folders.list('b')).toEqual([]);
  });
});
