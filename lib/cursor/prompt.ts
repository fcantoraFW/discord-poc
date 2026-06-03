export type AssistantPromptContext = {
  orgName: string;
  assistantName: string;
  instructions: string;
  context: string;
};

export function buildPromptPrefix(ctx: AssistantPromptContext): string {
  return `[ORG: ${ctx.orgName}]
[ASSISTANT: ${ctx.assistantName}]
<instructions>
${ctx.instructions}
</instructions>
<context>
${ctx.context}
</context>
---
`;
}

export function buildFullPrompt(
  ctx: AssistantPromptContext,
  userMessage: string,
): string {
  return `${buildPromptPrefix(ctx)}${userMessage}`;
}
