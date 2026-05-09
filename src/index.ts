import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export interface WorkerPayload {
  taskType: "agent.run" | "command.run" | string;
  input: {
    instruction?: string;
    command?: string;
    context?: Record<string, unknown>;
    timeoutSeconds?: number;
    [key: string]: unknown;
  };
  metadata?: Record<string, unknown>;
}

export interface WorkerEvent {
  type: "task.progress" | "task.log" | "task.result";
  message?: string;
  payload?: Record<string, unknown>;
}

export interface WorkerResult {
  ok: boolean;
  output?: string;
  events: WorkerEvent[];
  error?: string;
}

export async function runAgentDispatchWorkerTask(payload: WorkerPayload): Promise<WorkerResult> {
  if (payload.taskType === "command.run") {
    return runCommand(payload);
  }

  const instruction = payload.input.instruction ?? "";
  return {
    ok: true,
    output: `Accepted instruction: ${instruction}`,
    events: [
      { type: "task.progress", message: "AgentDispatch worker accepted agent.run task." },
      { type: "task.result", payload: { instruction, context: payload.input.context ?? {} } }
    ]
  };
}

async function runCommand(payload: WorkerPayload): Promise<WorkerResult> {
  const command = payload.input.command;
  if (!command) {
    return { ok: false, events: [], error: "command.run requires input.command." };
  }
  try {
    const result = await execAsync(command, { timeout: Number(payload.input.timeoutSeconds ?? 900) * 1000 });
    return {
      ok: true,
      output: result.stdout,
      events: [
        { type: "task.log", message: result.stdout, payload: { stream: "stdout" } },
        { type: "task.log", message: result.stderr, payload: { stream: "stderr" } },
        { type: "task.result", payload: { exitCode: 0 } }
      ]
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, events: [{ type: "task.log", message }], error: message };
  }
}
