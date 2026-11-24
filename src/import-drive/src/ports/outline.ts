export interface CreateDocumentInput {
  title: string;
  markdown: string;
  collectionId: string;
}

export interface UpdateDocumentInput {
  title: string;
  markdown: string;
}

export interface OutlinePort {
  findCollectionByName(name: string): Promise<string | null>;
  create(input: CreateDocumentInput): Promise<string>;
  update(id: string, input: UpdateDocumentInput): Promise<void>;
  archive(id: string): Promise<void>;
}
