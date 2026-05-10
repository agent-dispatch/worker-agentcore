import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runAgentDispatchWorkerTask, type AgentFrameworkAdapter } from "../src/index.js";

describe("worker contract", () => {
  it("accepts agent.run payloads", async () => {
    const artifactDir = await mkdtemp(join(tmpdir(), "agentdispatch-worker-"));
    const result = await runAgentDispatchWorkerTask({ taskType: "agent.run", input: { instruction: "work" } }, { artifactDir });
    expect(result.ok).toBe(true);
    expect(result.events[0]).toMatchObject({ payload: { framework: "echo" } });
    expect(result.events[0].type).toBe("task.progress");
    expect(result.events.some((event) => event.type === "task.heartbeat")).toBe(true);
    expect(result.artifacts[0]).toMatchObject({ kind: "json", contentType: "application/json" });
    await expect(readFile(join(artifactDir, "manifest.json"), "utf8")).resolves.toContain("result.json");
    await rm(artifactDir, { recursive: true, force: true });
  });

  it("runs explicit framework adapters selected by input", async () => {
    const adapter: AgentFrameworkAdapter = {
      name: "strands",
      run: async (request) => ({
        output: `strands:${request.instruction}`,
        result: { framework: "strands", answer: request.instruction },
        events: [{ type: "task.progress", message: "strands started" }]
      })
    };

    const result = await runAgentDispatchWorkerTask(
      { taskType: "agent.run", input: { instruction: "deep research", framework: "strands" } },
      { frameworkAdapters: [adapter] }
    );

    expect(result.ok).toBe(true);
    expect(result.output).toBe("strands:deep research");
    expect(result.events.some((event) => event.message === "strands started")).toBe(true);
    expect(result.events.at(-1)?.payload).toMatchObject({ framework: "strands", answer: "deep research" });
  });

  it("reports unsupported framework selections clearly", async () => {
    const result = await runAgentDispatchWorkerTask({ taskType: "agent.run", framework: "langchain", input: { instruction: "work" } });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Unsupported agent framework: langchain");
  });

  it("accepts AgentCore prompt aliases for starter-toolkit entrypoints", async () => {
    const artifactDir = await mkdtemp(join(tmpdir(), "agentdispatch-worker-"));
    const result = await runAgentDispatchWorkerTask({ taskType: "agent.run", prompt: "work from prompt", input: {} }, { artifactDir });
    expect(result.ok).toBe(true);
    expect(result.output).toContain("work from prompt");
    await rm(artifactDir, { recursive: true, force: true });
  });

  it("rejects commands outside the allowlist", async () => {
    const result = await runAgentDispatchWorkerTask(
      { taskType: "command.run", input: { command: "rm -rf /tmp/nope" } },
      { commandAllowlist: ["echo"] }
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("ALLOWLIST");
  });

  it("runs allowed commands and writes artifacts", async () => {
    const artifactDir = await mkdtemp(join(tmpdir(), "agentdispatch-worker-"));
    const result = await runAgentDispatchWorkerTask(
      { taskType: "command.run", input: { command: "echo hello", timeoutSeconds: 2 } },
      { artifactDir, commandAllowlist: ["echo"] }
    );
    expect(result.ok).toBe(true);
    expect(result.output).toContain("hello");
    expect(result.events.some((event) => event.type === "task.heartbeat")).toBe(true);
    expect(result.artifacts).toHaveLength(1);
    await rm(artifactDir, { recursive: true, force: true });
  });

  it("reports command failures", async () => {
    const result = await runAgentDispatchWorkerTask(
      { taskType: "command.run", input: { command: "node -e \"process.exit(7)\"", timeoutSeconds: 2 } },
      { commandAllowlist: ["node"] }
    );
    expect(result.ok).toBe(false);
    expect(result.events[0]).toMatchObject({ type: "task.log" });
  });
});
