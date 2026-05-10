import { exec } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export interface WorkerPayload {
  taskType: "agent.run" | "command.run" | string;
  framework?: string;
  prompt?: string;
  input: {
    instruction?: string;
    command?: string;
    context?: Record<string, unknown>;
    framework?: string;
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

export interface AgentRunRequest {
  instruction: string;
  context: Record<string, unknown>;
  input: WorkerPayload["input"];
  metadata?: Record<string, unknown>;
}

export interface AgentRunResult {
  output?: string;
  result?: Record<string, unknown>;
  events?: WorkerEvent[];
  artifacts?: WorkerArtifact[];
}

export interface AgentFrameworkAdapter {
  readonly name: string;
  run(request: AgentRunRequest): Promise<AgentRunResult>;
}

export interface WorkerOptions {
  artifactDir?: string;
  commandAllowlist?: string[];
  frameworkAdapters?: AgentFrameworkAdapter[];
  defaultFramework?: string;
}

export async function runAgentDispatchWorkerTask(payload: WorkerPayload, options: WorkerOptions = {}): Promise<WorkerResult> {
  if (payload.taskType === "command.run") {
    return runCommand(payload, options);
  }

  return runAgent(payload, options);
}

async function runAgent(payload: WorkerPayload, options: WorkerOptions): Promise<WorkerResult> {
  const frameworkName = selectFrameworkName(payload, options);
  const adapter = createFrameworkRegistry(options).get(frameworkName);
  if (!adapter) {
    return {
      ok: false,
      artifacts: [],
      events: [{ type: "task.log", message: `Unsupported agent framework: ${frameworkName}`, payload: { framework: frameworkName } }],
      error: `Unsupported agent framework: ${frameworkName}`
    };
  }

  const instruction = payload.input.instruction ?? payload.prompt ?? "";
  const context = payload.input.context ?? {};
  const frameworkResult = await adapter.run({ instruction, context, input: payload.input, metadata: payload.metadata });
  const resultPayload = frameworkResult.result ?? {
    framework: adapter.name,
    instruction,
    context,
    completedAt: new Date().toISOString()
  };
  const artifacts = frameworkResult.artifacts ?? await writeArtifacts(options.artifactDir, resultPayload);
  return {
    ok: true,
    output: frameworkResult.output,
    artifacts,
    events: [
      { type: "task.progress", message: `AgentDispatch worker accepted agent.run task with ${adapter.name}.`, payload: { framework: adapter.name } },
      { type: "task.heartbeat", message: "AgentDispatch worker heartbeat.", payload: { status: "running" } },
      ...(frameworkResult.events ?? []),
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

function selectFrameworkName(payload: WorkerPayload, options: WorkerOptions): string {
  return payload.input.framework ?? payload.framework ?? options.defaultFramework ?? process.env.AGENTDISPATCH_AGENT_FRAMEWORK ?? "echo";
}

function createFrameworkRegistry(options: WorkerOptions): Map<string, AgentFrameworkAdapter> {
  const adapters = [new EchoAgentFrameworkAdapter(), ...(options.frameworkAdapters ?? [])];
  return new Map(adapters.map((adapter) => [adapter.name, adapter]));
}

class EchoAgentFrameworkAdapter implements AgentFrameworkAdapter {
  readonly name = "echo";

  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    return {
      output: `Accepted instruction: ${request.instruction}`,
      result: {
        framework: this.name,
        instruction: request.instruction,
        context: request.context,
        completedAt: new Date().toISOString()
      }
    };
  }
}
