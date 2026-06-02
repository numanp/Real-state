export interface Folder {
  id: string;
  userId: string;
  name: string;
  isDefault: boolean;
  itemCount: number;
}

export const DEFAULT_FOLDER_NAME = 'Favoritos';
