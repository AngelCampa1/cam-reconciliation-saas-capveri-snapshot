import { stripThinkingTags } from "./openrouter";

export function extractJsonObjectText(
  content: string,
  responseLabel: string,
): string {
  const stripped = stripThinkingTags(content).trim();
  const fenced = stripped.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? stripped;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  const firstJsonToken = findFirstJsonToken(candidate);
  if (firstJsonToken !== "{") {
    throw new Error(`${responseLabel} did not contain a JSON object`);
  }
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`${responseLabel} did not contain a JSON object`);
  }

  return candidate.slice(start, end + 1);
}

function findFirstJsonToken(value: string): string | undefined {
  return [...value].find((char) => char === "{" || char === "[");
}
