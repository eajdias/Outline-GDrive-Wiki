import { ChatClientError, type ChatFailure } from "../domain/chat-failure.js";
import { toCitations, topScore, type Citation, type SourceOrigin } from "../domain/citations.js";
import type { ChatClient } from "../ports/chat.js";

export interface AskOptions {
  maxQuestionChars: number;
  minScore: number;
  workspaces: string[];
  onWorkspaceError: (workspace: string, error: unknown) => void;
}

export interface AskResult {
  answer: string;
  notFound: boolean;
  sources: Citation[];
}

export class AskValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AskValidationError";
  }
}

export class AskUpstreamError extends Error {
  constructor(readonly failure: ChatFailure) {
    super(`chat upstream failed: ${failure}`);
    this.name = "AskUpstreamError";
  }
}

interface WorkspaceAnswer {
  workspace: string;
  text: string;
  citations: Citation[];
}

function originFor(workspace: string): SourceOrigin {
  return workspace === "kb-drive" ? "drive" : "wiki";
}

function mergeCitations(answers: WorkspaceAnswer[]): Citation[] {
  const byKey = new Map<string, Citation>();

  for (const answer of answers) {
    for (const citation of answer.citations) {
      const key = citation.url ?? citation.title;
      const existing = byKey.get(key);
      if (!existing || (citation.score ?? 0) > (existing.score ?? 0)) {
        byKey.set(key, citation);
      }
    }
  }

  return [...byKey.values()].sort((left, right) => (right.score ?? 0) - (left.score ?? 0)).slice(0, 4);
}

export async function askQuestion(
  chat: ChatClient,
  question: string,
  options: AskOptions,
): Promise<AskResult> {
  const normalized = question.trim().replace(/\s+/g, " ");

  if (normalized.length < 3) {
    throw new AskValidationError("A pergunta precisa ter pelo menos 3 caracteres.");
  }
  if (normalized.length > options.maxQuestionChars) {
    throw new AskValidationError(`A pergunta pode ter no máximo ${options.maxQuestionChars} caracteres.`);
  }

  const settled = await Promise.allSettled(
    options.workspaces.map(async (workspace) => ({
      workspace,
      answer: await chat.chat(workspace, normalized),
    })),
  );

  const answers: WorkspaceAnswer[] = [];
  let firstFailure: ChatFailure | null = null;

  for (const [index, entry] of settled.entries()) {
    const workspace = options.workspaces[index] ?? "unknown";

    if (entry.status === "rejected") {
      if (entry.reason instanceof ChatClientError && firstFailure === null) {
        firstFailure = entry.reason.failure;
      }
      options.onWorkspaceError(workspace, entry.reason);
      continue;
    }

    const citations = toCitations(entry.value.answer.sources, 4, originFor(workspace)).filter(
      (citation) => citation.score !== null && citation.score >= options.minScore,
    );
    answers.push({ workspace, text: entry.value.answer.text.trim(), citations });
  }

  if (answers.length === 0) {
    throw new AskUpstreamError(firstFailure ?? "upstream");
  }

  const answering = answers.filter((answer) => answer.citations.length > 0 && answer.text.length > 0);
  if (answering.length === 0) {
    return { answer: "", notFound: true, sources: [] };
  }

  const best = answering.reduce((left, right) => {
    return (topScore(right.citations) ?? 0) > (topScore(left.citations) ?? 0) ? right : left;
  });

  return {
    answer: best.text,
    notFound: false,
    sources: mergeCitations(answering),
  };
}
