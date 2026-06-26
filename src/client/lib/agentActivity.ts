export interface AgentActivity {
  agent: string;
  action: string;
  detail: string;
  tone: "pine" | "iris" | "coral" | "saffron";
  timestamp: string;
}

export type AgentActivityInput = Omit<AgentActivity, "timestamp">;

