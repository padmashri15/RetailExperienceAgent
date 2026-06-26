import { Activity, CircleDotDashed } from "lucide-react";
import type { AgentActivity } from "../lib/agentActivity";

export function AgentActivityTimeline({ activities }: { activities: AgentActivity[] }) {
  return (
    <aside className="panel min-w-0 p-4 2xl:sticky 2xl:top-5 2xl:max-h-[calc(100vh-40px)] 2xl:overflow-hidden">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity size={18} className="text-pine" />
          <h2 className="text-sm font-semibold text-ink">Agent activity timeline</h2>
        </div>
        <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-graphite">Live</span>
      </div>
      <div className="space-y-3 2xl:max-h-[calc(100vh-112px)] 2xl:overflow-y-auto 2xl:pr-1">
        {activities.slice(0, 8).map((activity, index) => {
          const toneClass = getToneClass(activity.tone);
          return (
            <article key={`${activity.timestamp}-${activity.agent}-${index}`} className="grid grid-cols-[30px_1fr] gap-3">
              <div className="relative flex justify-center">
                <span className={`z-10 grid h-7 w-7 place-items-center rounded-md ${toneClass.icon}`}>
                  <CircleDotDashed size={14} />
                </span>
                {index < activities.length - 1 ? <span className="absolute bottom-[-16px] top-7 w-px bg-slate-200" /> : null}
              </div>
              <div className={`rounded-md border bg-white p-3 ${toneClass.border}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase text-graphite">{activity.timestamp}</span>
                  <span className={`rounded px-2 py-1 text-[11px] font-semibold ${toneClass.badge}`}>{activity.action}</span>
                </div>
                <h3 className="mt-2 text-sm font-semibold text-ink">{activity.agent}</h3>
                <p className="mt-1 text-xs leading-5 text-graphite">{activity.detail}</p>
              </div>
            </article>
          );
        })}
      </div>
    </aside>
  );
}

function getToneClass(tone: AgentActivity["tone"]) {
  switch (tone) {
    case "iris":
      return {
        badge: "bg-violet-50 text-iris",
        border: "border-violet-100",
        icon: "bg-violet-100 text-iris"
      };
    case "coral":
      return {
        badge: "bg-red-50 text-coral",
        border: "border-red-100",
        icon: "bg-red-100 text-coral"
      };
    case "saffron":
      return {
        badge: "bg-amber-50 text-amber-800",
        border: "border-amber-100",
        icon: "bg-amber-100 text-amber-800"
      };
    default:
      return {
        badge: "bg-emerald-50 text-pine",
        border: "border-emerald-100",
        icon: "bg-emerald-100 text-pine"
      };
  }
}
