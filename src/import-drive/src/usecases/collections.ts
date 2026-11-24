import type { OutlinePort } from "../ports/outline.js";

export interface CollectionSettings {
  collectionMap: Record<string, string>;
  defaultCollectionId: string | null;
  ignoreFolders: string[];
}

export interface CollectionResolver {
  resolve(folderId: string, folderPath: string[]): Promise<string | null>;
}

export function normalizeFolderName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function createCollectionResolver(outline: OutlinePort, settings: CollectionSettings): CollectionResolver {
  const cache = new Map<string, string | null>();

  return {
    async resolve(folderId: string, folderPath: string[]): Promise<string | null> {
      const cached = cache.get(folderId);
      if (cached !== undefined) return cached;

      const folderName = folderPath[folderPath.length - 1] ?? "";
      const normalized = normalizeFolderName(folderName);

      if (folderName && settings.ignoreFolders.includes(normalized)) {
        cache.set(folderId, null);
        return null;
      }

      const mapped = settings.collectionMap[folderId];
      if (mapped) {
        cache.set(folderId, mapped);
        return mapped;
      }

      if (folderName) {
        const byName = await outline.findCollectionByName(folderName);
        if (byName) {
          cache.set(folderId, byName);
          return byName;
        }
      }

      if (!settings.defaultCollectionId) {
        throw new Error(
          `No Outline collection for Drive folder "${folderName || "(root)"}". ` +
            "Map it with OUTLINE_COLLECTION_MAP or set OUTLINE_DEFAULT_COLLECTION_ID.",
        );
      }
      cache.set(folderId, settings.defaultCollectionId);
      return settings.defaultCollectionId;
    },
  };
}
