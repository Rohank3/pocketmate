import { PersonaType } from "@/lib/agent/prompts";

export interface GridMutationState {
  groupBy?: string[];
  filter?: Record<string, string | number | boolean>;
  renderChart?: string;
  highlightRowId?: string;
  statusMessage?: string;
}

export interface ToolExecutionRecord {
  name: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
}

export interface AgentRunResult {
  reply: string;
  gridMutation?: GridMutationState | null;
  actionCard?: Record<string, unknown> | null;
  executedTools: ToolExecutionRecord[];
  activePersona: PersonaType;
}
