import { buildFullPrompt, type AssistantPromptContext } from "./prompt";

const MODEL_ID = "composer-2.5";

function getApiKey(): string {
  const key = process.env.CURSOR_API_KEY;
  if (!key) throw new Error("CURSOR_API_KEY is not set");
  return key;
}

function normalizeRepoSpec(spec: string): string {
  return spec
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/\/$/, "")
    .toLowerCase();
}

function cloudBranchRef(): string {
  return process.env.CURSOR_CLOUD_REF?.trim() || "main";
}

/** Cursor only accepts repos linked to the API key account. */
async function resolveCloudRepo(): Promise<{ url: string; branch: string }> {
  const { Cursor } = await loadSdk();
  const apiKey = getApiKey();
  const repoSpec = process.env.CURSOR_CLOUD_REPO?.trim();
  if (!repoSpec) throw new Error("CURSOR_CLOUD_REPO is not set (owner/repo)");

  const target = normalizeRepoSpec(repoSpec);
  const connected = await Cursor.repositories.list({ apiKey });

  const match = connected.find((r) => {
    const normalized = normalizeRepoSpec(r.url);
    return (
      normalized === target ||
      normalized.endsWith(`/${target}`) ||
      target.endsWith(`/${normalized}`)
    );
  });

  if (!match) {
    if (connected.length === 0) {
      throw new Error(
        `No hay repos de GitHub conectados a tu API key de Cursor. ` +
          `Conectá GitHub en https://cursor.com/dashboard/integrations y autorizá ${target}.`,
      );
    }
    throw new Error(
      `El repo "${target}" no está en la lista de Cursor para tu API key. ` +
        `Repos conectados (primeros 5): ${connected
          .slice(0, 5)
          .map((r) => r.url)
          .join(", ")}…`,
    );
  }

  return { url: match.url, branch: cloudBranchRef() };
}

type CloudRepoEntry = { url: string; startingRef?: string };

async function createCloudAgent(apiKey: string, repo: { url: string; branch: string }) {
  const attempts: CloudRepoEntry[][] = [
    [{ url: repo.url, startingRef: repo.branch }],
    [{ url: repo.url }],
  ];

  let lastError: unknown;
  for (let i = 0; i < attempts.length; i++) {
    const repos = attempts[i]!;
    try {
      const { Agent } = await loadSdk();
      return await Agent.create({
        apiKey,
        model: { id: MODEL_ID },
        cloud: { repos },
      });
    } catch (err) {
      lastError = err;
      const msg = formatCursorError(err);
      const retryable =
        msg.includes("branch") ||
        msg.includes("default branch") ||
        msg.includes("repository");
      if (!retryable || i === attempts.length - 1) throw err;
    }
  }

  throw lastError;
}

async function loadSdk() {
  return import("@cursor/sdk");
}

function formatCursorError(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

async function openAgent(cursorAgentId: string | null) {
  const { Agent } = await loadSdk();
  const apiKey = getApiKey();

  if (cursorAgentId) {
    return Agent.resume(cursorAgentId, {
      apiKey,
      model: { id: MODEL_ID },
    });
  }

  const repo = await resolveCloudRepo();
  return createCloudAgent(apiKey, repo);
}

export async function collectAgentResponse(options: {
  cursorAgentId: string | null;
  promptContext: AssistantPromptContext;
  userMessage: string;
}): Promise<{ agentId: string; text: string }> {
  const { CursorAgentError } = await loadSdk();
  const fullPrompt = buildFullPrompt(options.promptContext, options.userMessage);

  try {
    await using agent = await openAgent(options.cursorAgentId);
    const run = await agent.send(fullPrompt);
    let text = "";
    for await (const event of run.stream()) {
      if (event.type === "assistant") {
        for (const block of event.message.content) {
          if (block.type === "text") text += block.text;
        }
      }
    }
    const result = await run.wait();
    if (result.status === "error") {
      throw new Error(`Cursor run failed: ${result.id}`);
    }
    return { agentId: agent.agentId, text };
  } catch (err) {
    if (err instanceof CursorAgentError) {
      throw new Error(`Cursor startup failed: ${formatCursorError(err)}`);
    }
    throw err;
  }
}

export async function streamAgentResponse(options: {
  cursorAgentId: string | null;
  promptContext: AssistantPromptContext;
  userMessage: string;
  onChunk: (text: string) => void;
}): Promise<{ agentId: string; text: string }> {
  const { CursorAgentError } = await loadSdk();
  const fullPrompt = buildFullPrompt(options.promptContext, options.userMessage);

  try {
    await using agent = await openAgent(options.cursorAgentId);
    const run = await agent.send(fullPrompt);
    let text = "";
    for await (const event of run.stream()) {
      if (event.type === "assistant") {
        for (const block of event.message.content) {
          if (block.type === "text") {
            text += block.text;
            options.onChunk(block.text);
          }
        }
      }
    }
    const result = await run.wait();
    if (result.status === "error") {
      throw new Error(`Cursor run failed: ${result.id}`);
    }
    return { agentId: agent.agentId, text };
  } catch (err) {
    if (err instanceof CursorAgentError) {
      throw new Error(`Cursor startup failed: ${formatCursorError(err)}`);
    }
    throw err;
  }
}
