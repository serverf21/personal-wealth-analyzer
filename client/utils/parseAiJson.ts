/** Strips markdown ```json fences and parses AI JSON responses. */
export function parseAiJsonPayload(text: string): Record<string, unknown> | null {
  if (!text || typeof text !== "string") return null;
  let s = text.trim();
  const fullFence = s.match(/^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```\s*$/);
  if (fullFence) {
    s = fullFence[1].trim();
  } else if (s.startsWith("```")) {
    s = s
      .replace(/^```(?:json)?\s*\r?\n?/i, "")
      .replace(/\r?\n?```\s*$/i, "")
      .trim();
  }
  try {
    const v = JSON.parse(s);
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
    return null;
  } catch {
    const i0 = s.indexOf("{");
    const i1 = s.lastIndexOf("}");
    if (i0 >= 0 && i1 > i0) {
      try {
        const v = JSON.parse(s.slice(i0, i1 + 1));
        if (v !== null && typeof v === "object" && !Array.isArray(v)) {
          return v as Record<string, unknown>;
        }
      } catch {
        return null;
      }
    }
    return null;
  }
}
