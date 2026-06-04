import { buildFullPrompt, type AssistantPromptContext } from "./prompt";
import {
  createAgent,
  createRun,
  getAgent,
  getRun,
  listRepositories,
  streamRun,
  type V1Repository,
} from "./cloud-client";

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

async function resolveMatchedRepoUrl(apiKey: string): Promise<string> {
  const repoSpec = process.env.CURSOR_CLOUD_REPO?.trim();
  if (!repoSpec) throw new Error("CURSOR_CLOUD_REPO is not set (owner/repo)");

  const target = normalizeRepoSpec(repoSpec);
  const connected = await listRepositories(apiKey);

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

  return match.url;
}

function repoCreateAttempts(repoUrl: string): V1Repository[][] {
  const branch = cloudBranchRef();
  return [
    [{ url: repoUrl, startingRef: branch }],
    [{ url: repoUrl }],
  ];
}

async function waitForRunIdle(
  apiKey: string,
  agentId: string,
  runId: string,
  maxMs = 120_000,
): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const run = await getRun(apiKey, agentId, runId);
    if (
      run.status === "FINISHED" ||
      run.status === "ERROR" ||
      run.status === "CANCELLED" ||
      run.status === "EXPIRED"
    ) {
      return;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Cursor agent busy: timed out waiting for previous run");
}

async function startRun(
  apiKey: string,
  cursorAgentId: string | null,
  promptText: string,
): Promise<{ agentId: string; runId: string }> {
  if (cursorAgentId) {
    try {
      const { run } = await createRun(apiKey, cursorAgentId, {
        prompt: { text: promptText },
        model: { id: MODEL_ID },
      });
      return { agentId: cursorAgentId, runId: run.id };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("agent_busy") && !msg.includes("409")) throw err;
      const agent = await getAgent(apiKey, cursorAgentId);
      if (agent.latestRunId) {
        await waitForRunIdle(apiKey, cursorAgentId, agent.latestRunId);
      }
      const { run } = await createRun(apiKey, cursorAgentId, {
        prompt: { text: promptText },
        model: { id: MODEL_ID },
      });
      return { agentId: cursorAgentId, runId: run.id };
    }
  }

  const repoUrl = await resolveMatchedRepoUrl(apiKey);
  let lastError: unknown;

  for (const repos of repoCreateAttempts(repoUrl)) {
    try {
      const { agent, run } = await createAgent(apiKey, {
        prompt: { text: promptText },
        model: { id: MODEL_ID },
        repos,
      });
      return { agentId: agent.id, runId: run.id };
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const retryable =
        msg.includes("branch") ||
        msg.includes("default branch") ||
        msg.includes("repository");
      if (!retryable) throw err;
    }
  }

  throw lastError;
}

async function consumeRunStream(options: {
  apiKey: string;
  agentId: string;
  runId: string;
  onChunk?: (text: string) => void;
}): Promise<string> {
  let text = "";
  let terminalStatus: string | undefined;

  for await (const { event, data } of streamRun(
    options.apiKey,
    options.agentId,
    options.runId,
  )) {
    if (event === "assistant" && data && typeof data === "object" && "text" in data) {
      const delta = String((data as { text: string }).text);
      text += delta;
      options.onChunk?.(delta);
    }
    if (event === "result" && data && typeof data === "object") {
      const result = data as { status?: string; text?: string };
      terminalStatus = result.status;
      if (result.text) text = result.text;
    }
    if (event === "error" && data && typeof data === "object" && "message" in data) {
      throw new Error(String((data as { message: string }).message));
    }
  }

  if (terminalStatus === "ERROR") {
    const run = await getRun(options.apiKey, options.agentId, options.runId);
    throw new Error(`Cursor run failed: ${run.status}`);
  }

  if (!text) {
    const run = await getRun(options.apiKey, options.agentId, options.runId);
    if (run.status === "ERROR") {
      throw new Error(`Cursor run failed: ${run.status}`);
    }
    if (run.result) text = run.result;
  }

  return text;
}

export async function collectAgentResponse(options: {
  cursorAgentId: string | null;
  promptContext: AssistantPromptContext;
  userMessage: string;
}): Promise<{ agentId: string; text: string }> {
  const apiKey = getApiKey();
  const fullPrompt = buildFullPrompt(options.promptContext, options.userMessage);

  try {
    const { agentId, runId } = await startRun(apiKey, options.cursorAgentId, fullPrompt);
    const text = await consumeRunStream({ apiKey, agentId, runId });
    return { agentId, text };
  } catch (err) {
    throw new Error(
      `Cursor startup failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export async function streamAgentResponse(options: {
  cursorAgentId: string | null;
  promptContext: AssistantPromptContext;
  userMessage: string;
  onChunk: (text: string) => void;
}): Promise<{ agentId: string; text: string }> {
  const apiKey = getApiKey();
  const fullPrompt = buildFullPrompt(options.promptContext, options.userMessage);

  try {
    const { agentId, runId } = await startRun(apiKey, options.cursorAgentId, fullPrompt);
    const text = await consumeRunStream({
      apiKey,
      agentId,
      runId,
      onChunk: options.onChunk,
    });
    return { agentId, text };
  } catch (err) {
    throw new Error(
      `Cursor startup failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
