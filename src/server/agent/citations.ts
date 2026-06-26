import type { SourceCitation } from "../../shared/types";

export function extractCitations(response: unknown): SourceCitation[] {
  const citations: SourceCitation[] = [];
  const seen = new Set<string>();

  visit(response, (value) => {
    if (!isRecord(value)) return;

    if (typeof value.filename === "string" || typeof value.file_id === "string") {
      const title = String(value.filename ?? value.title ?? value.file_id ?? "Knowledge source");
      const key = `${title}:${String(value.file_id ?? "")}`;
      if (!seen.has(key)) {
        citations.push({
          title,
          fileId: typeof value.file_id === "string" ? value.file_id : undefined,
          quote: typeof value.text === "string" ? value.text.slice(0, 220) : undefined,
          score: typeof value.score === "number" ? value.score : undefined
        });
        seen.add(key);
      }
    }
  });

  return citations.slice(0, 5);
}

function visit(value: unknown, callback: (value: unknown) => void) {
  callback(value);
  if (Array.isArray(value)) {
    value.forEach((item) => visit(item, callback));
    return;
  }

  if (isRecord(value)) {
    Object.values(value).forEach((item) => visit(item, callback));
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
