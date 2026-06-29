import { Activity, Sparkles } from "lucide-react";
import type { AgentActivity } from "../lib/agentActivity";

export function AgentCallout({ activity }: { activity: AgentActivity }) {
  const toneClass = getToneClass(activity.tone);

  return (
    <aside
      aria-live="polite"
      className={`rounded-md border bg-white p-3 shadow-panel ${toneClass.border}`}
    >
      <div className="flex items-start gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ${toneClass.icon}`}>
          <Sparkles size={17} />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase text-graphite">Agent triggered</span>
            <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold text-graphite">
              <Activity size={11} />
              {activity.timestamp}
            </span>
          </div>
          <div className="mt-2 text-sm font-semibold text-ink">{activity.agent}</div>
          <div className="mt-1 text-xs font-semibold text-graphite">{activity.action}</div>
          <p className="mt-2 text-xs leading-5 text-graphite">{activity.detail}</p>
        </div>
      </div>
    </aside>
  );
}

function getToneClass(tone: AgentActivity["tone"]) {
  switch (tone) {
    case "iris":
      return {
        border: "border-violet-200",
        icon: "bg-violet-100 text-iris"
      };
    case "coral":
      return {
        border: "border-red-200",
        icon: "bg-red-100 text-coral"
      };
    case "saffron":
      return {
        border: "border-amber-200",
        icon: "bg-amber-100 text-amber-800"
      };
    default:
      return {
        border: "border-emerald-200",
        icon: "bg-emerald-100 text-pine"
      };
  }
}
