import { FileText } from "lucide-react";
import type { SourceCitation } from "../../shared/types";

interface SourceListProps {
  citations: SourceCitation[];
}

export function SourceList({ citations }: SourceListProps) {
  if (!citations.length) return null;

  return (
    <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase text-graphite">
        <FileText size={14} />
        Sources
      </div>
      <ul className="mt-3 space-y-2">
        {citations.map((citation) => (
          <li key={`${citation.title}-${citation.fileId ?? ""}`} className="text-sm text-graphite">
            <span className="font-medium text-ink">{citation.title}</span>
            {citation.quote ? <span> - {citation.quote}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
