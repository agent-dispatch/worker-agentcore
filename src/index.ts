import { exec } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
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
  type: "task.progress" | "task.log" | "task.result" | "task.heartbeat";
  message?: string;
  payload?: Record<string, unknown>;
}

export interface WorkerArtifact {
  uri: string;
  kind: string;
  contentType?: string;
  sizeBytes?: number;
}

export interface WorkerResult {
  ok: boolean;
  output?: string;
  events: WorkerEvent[];
  artifacts: WorkerArtifact[];
  error?: string;
}

export interface WorkerOptions {
  artifactDir?: string;
  commandAllowlist?: string[];
}

export async function runAgentDispatchWorkerTask(payload: WorkerPayload, options: WorkerOptions = {}): Promise<WorkerResult> {
  if (payload.taskType === "command.run") {
    return runCommand(payload, options);
  }

  const instruction = payload.input.instruction ?? "";
  const resultPayload = {
    instruction,
    context: payload.input.context ?? {},
    completedAt: new Date().toISOString()
  };
  const artifacts = await writeArtifacts(options.artifactDir, resultPayload);
  return {
    ok: true,
    output: `Accepted instruction: ${instruction}`,
    artifacts,
    events: [
      { type: "task.progress", message: "AgentDispatch worker accepted agent.run task." },
      { type: "task.heartbeat", message: "AgentDispatch worker heartbeat.", payload: { status: "running" } },
      { type: "task.result", payload: resultPayload }
    ]
  };
}

async function runCommand(payload: WorkerPayload, options: WorkerOptions): Promise<WorkerResult> {
  const command = payload.input.command;
  if (!command) {
    return { ok: false, events: [], artifacts: [], error: "command.run requires input.command." };
  }
  const allowlist = options.commandAllowlist ?? commandAllowlistFromEnv();
  if (allowlist.length > 0 && !allowlist.some((allowed) => command === allowed || command.startsWith(`${allowed} `))) {
    return {
      ok: false,
      artifacts: [],
      events: [{ type: "task.log", message: `Command is not allowed: ${command}`, payload: { stream: "stderr" } }],
      error: "Command rejected by AGENTDISPATCH_COMMAND_ALLOWLIST."
    };
  }
  try {
    const result = await execAsync(command, { timeout: Number(payload.input.timeoutSeconds ?? 900) * 1000 });
    const artifacts = await writeArtifacts(options.artifactDir, { command, stdout: result.stdout, stderr: result.stderr, exitCode: 0 });
    return {
      ok: true,
      output: result.stdout,
      artifacts,
      events: [
        { type: "task.heartbeat", message: "AgentDispatch worker heartbeat.", payload: { status: "running" } },
        { type: "task.log", message: result.stdout, payload: { stream: "stdout" } },
        { type: "task.log", message: result.stderr, payload: { stream: "stderr" } },
        { type: "task.result", payload: { exitCode: 0 } }
      ]
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      artifacts: [],
      events: [{ type: "task.log", message, payload: { stream: "stderr" } }],
      error: message
    };
  }
}

async function writeArtifacts(artifactDir = process.env.AGENTDISPATCH_ARTIFACT_DIR ?? "/tmp/agentdispatch-artifacts", payload: Record<string, unknown>): Promise<WorkerArtifact[]> {
  await mkdir(artifactDir, { recursive: true });
  const resultPath = join(artifactDir, "result.json");
  const resultBytes = Buffer.from(JSON.stringify(payload, null, 2));
  await writeFile(resultPath, resultBytes);
  const artifacts = [{ uri: resultPath, kind: "json", contentType: "application/json", sizeBytes: resultBytes.byteLength }];
  await writeFile(join(artifactDir, "manifest.json"), JSON.stringify({ artifacts }, null, 2));
  return artifacts;
}

function commandAllowlistFromEnv(): string[] {
  return (process.env.AGENTDISPATCH_COMMAND_ALLOWLIST ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}
