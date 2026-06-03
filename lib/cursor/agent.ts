import { buildFullPrompt, type AssistantPromptContext } from "./prompt";

const MODEL_ID = "composer-2.5";

function getApiKey(): string {
  const key = process.env.CURSOR_API_KEY;
  if (!key) throw new Error("CURSOR_API_KEY is not set");
  return key;
}

function getCloudRepos(): Array<{ url: string }> {
  const repo = process.env.CURSOR_CLOUD_REPO;
  if (!repo) throw new Error("CURSOR_CLOUD_REPO is not set (owner/repo)");
  const url = repo.startsWith("http") ? repo : `https://github.com/${repo}`;
  return [{ url }];
}

async function loadSdk() {
  return import("@cursor/sdk");
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
  return Agent.create({
    apiKey,
    model: { id: MODEL_ID },
    cloud: { repos: getCloudRepos() },
  });
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
      throw new Error(`Cursor startup failed: ${err.message}`);
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
      throw new Error(`Cursor startup failed: ${err.message}`);
    }
    throw err;
  }
}
