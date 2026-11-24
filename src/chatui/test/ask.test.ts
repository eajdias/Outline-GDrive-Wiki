import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatAnswer, ChatClient } from "../src/ports/chat.js";
import { ChatClientError } from "../src/domain/chat-failure.js";
import { AskUpstreamError, AskValidationError, askQuestion } from "../src/usecases/ask.js";

function options(workspaces: string[], onWorkspaceError: (workspace: string, error: unknown) => void = () => undefined) {
  return { maxQuestionChars: 1000, minScore: 0.65, workspaces, onWorkspaceError };
}

class StubChat implements ChatClient {
  constructor(private readonly result: ChatAnswer | ChatClientError) {}

  async chat(_workspace: string, _question: string): Promise<ChatAnswer> {
    if (this.result instanceof ChatClientError) throw this.result;
    return this.result;
  }
}

class MultiStub implements ChatClient {
  readonly calls: string[] = [];

  constructor(private readonly results: Record<string, ChatAnswer | Error>) {}

  async chat(workspace: string, _question: string): Promise<ChatAnswer> {
    this.calls.push(workspace);
    const result = this.results[workspace];
    if (result instanceof Error) throw result;
    if (!result) throw new Error(`missing stub for ${workspace}`);
    return result;
  }
}

function answer(score: number, url = "https://wiki.example.test/doc/doc"): ChatAnswer {
  return {
    text: "Resposta baseada no wiki.",
    sources: [
      {
        title: "doc.txt",
        description: "Documento certo",
        url: `web://${url}.website`,
        score,
        text: "<document_metadata>x</document_metadata> trecho",
      },
    ],
  };
}

test("returns the answer with citation when the top score passes the threshold", async () => {
  const result = await askQuestion(new StubChat(answer(0.8)), "Como configurar o Evo?", options(["kb-wiki"]));

  assert.equal(result.notFound, false);
  assert.equal(result.answer, "Resposta baseada no wiki.");
  assert.equal(result.sources[0]?.url, "https://wiki.example.test/doc/doc");
  assert.equal(result.sources[0]?.origin, "wiki");
});

test("turns a low-score answer into an explicit not found", async () => {
  const result = await askQuestion(new StubChat(answer(0.4)), "Qual a capital da França?", options(["kb-wiki"]));

  assert.equal(result.notFound, true);
  assert.equal(result.answer, "");
  assert.deepEqual(result.sources, []);
});

test("merges sources from both workspaces and tags their origin", async () => {
  const chat = new MultiStub({
    "kb-wiki": answer(0.7, "https://wiki.example.test/doc/wiki-doc"),
    "kb-drive": answer(0.9, "https://drive.example.test/doc/drive-doc"),
  });

  const result = await askQuestion(chat, "Como configurar o Evo?", options(["kb-wiki", "kb-drive"]));

  assert.equal(result.notFound, false);
  assert.equal(result.answer, "Resposta baseada no wiki.");
  assert.equal(result.sources.length, 2);
  assert.deepEqual(
    result.sources.map((source) => source.origin).sort(),
    ["drive", "wiki"],
  );
});

test("degrades to the healthy workspace when one fails", async () => {
  const failures: string[] = [];
  const chat = new MultiStub({
    "kb-wiki": new ChatClientError("unavailable", "down"),
    "kb-drive": answer(0.9, "https://drive.example.test/doc/drive-doc"),
  });

  const result = await askQuestion(
    chat,
    "Como configurar o Evo?",
    options(["kb-wiki", "kb-drive"], (workspace) => failures.push(workspace)),
  );

  assert.equal(result.notFound, false);
  assert.deepEqual(failures, ["kb-wiki"]);
  assert.equal(result.sources[0]?.origin, "drive");
});

test("throws when every workspace fails", async () => {
  const chat = new MultiStub({
    "kb-wiki": new ChatClientError("timeout", "slow"),
    "kb-drive": new ChatClientError("unavailable", "down"),
  });

  await assert.rejects(
    () => askQuestion(chat, "Como configurar o Evo?", options(["kb-wiki", "kb-drive"])),
    AskUpstreamError,
  );
});

test("rejects questions outside the size bounds", async () => {
  const chat = new StubChat(answer(0.9));

  await assert.rejects(() => askQuestion(chat, " oi ", options(["kb-wiki"])), AskValidationError);
  await assert.rejects(
    () => askQuestion(chat, "x".repeat(1001), options(["kb-wiki"])),
    AskValidationError,
  );
});

test("maps an upstream failure to a typed error when it is the only workspace", async () => {
  const chat = new StubChat(new ChatClientError("timeout", "slow"));

  await assert.rejects(
    () => askQuestion(chat, "Como configurar o Evo?", options(["kb-wiki"])),
    (error: unknown) => error instanceof AskUpstreamError && error.failure === "timeout",
  );
});
