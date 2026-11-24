export interface RagDocument {
  location: string;
  title: string | null;
}

export interface RawTextInput {
  title: string;
  text: string;
  url: string;
}

export interface RagPort {
  ensureWorkspace(): Promise<void>;
  addRawText(input: RawTextInput): Promise<string>;
  updateEmbeddings(adds: string[], deletes: string[]): Promise<RagDocument[]>;
  removeDocuments(locations: string[]): Promise<void>;
  workspaceDocuments(): Promise<RagDocument[]>;
}
