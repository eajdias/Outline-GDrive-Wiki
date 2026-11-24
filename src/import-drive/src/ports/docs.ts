export interface DocImageObject {
  objectId: string;
  title: string | null;
  description: string | null;
}

export interface DocImageBytes {
  bytes: Uint8Array;
  contentType: string;
}

export interface DocsPort {
  listImages(docId: string): Promise<DocImageObject[]>;
  getImage(docId: string, objectId: string): Promise<DocImageBytes>;
}
