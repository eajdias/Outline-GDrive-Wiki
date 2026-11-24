import type { RawSource } from "../domain/citations.js";

export interface ChatAnswer {
  text: string;
  sources: RawSource[];
}

export interface ChatClient {
  chat(workspace: string, question: string): Promise<ChatAnswer>;
}
