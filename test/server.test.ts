import { createServer } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

let baseUrl: string;
let testServer: ReturnType<typeof createServer>;

beforeEach(async () => {
  process.env.AGENTDISPATCH_WORKER_NO_LISTEN = "1";
  const { handleRequest } = await import("../src/server.js");
  testServer = createServer(handleRequest);
  await new Promise<void>((resolve) => testServer.listen(0, "127.0.0.1", resolve));
  const address = testServer.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP server address.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => testServer.close((error) => error ? reject(error) : resolve()));
});

describe("AgentCore worker HTTP server", () => {
  it("returns AgentCore-compatible ping health", async () => {
    const response = await fetch(`${baseUrl}/ping`);
    await expect(response.json()).resolves.toEqual({ status: "Healthy" });
  });

  it("returns local health alias", async () => {
    const response = await fetch(`${baseUrl}/health`);
    await expect(response.json()).resolves.toEqual({ status: "Healthy" });
  });

  it("accepts invocation requests on /invocations", async () => {
    const response = await fetch(`${baseUrl}/invocations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskType: "agent.run", input: { instruction: "work" } })
    });
    await expect(response.json()).resolves.toMatchObject({ ok: true, output: "Accepted instruction: work" });
  });

  it("returns structured application failures with HTTP 200", async () => {
    const response = await fetch(`${baseUrl}/invocations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskType: "agent.run", input: { instruction: "work", framework: "missing-framework" } })
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: "Unsupported agent framework: missing-framework" });
  });

  it("serves an A2A agent card", async () => {
    const response = await fetch(`${baseUrl}/.well-known/agent-card.json`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      name: "AgentDispatch Worker",
      capabilities: { streaming: false },
      skills: [expect.objectContaining({ id: "agentdispatch.agent.run" })]
    });
  });

  it("accepts A2A message/send requests on root path", async () => {
    const response = await fetch(`${baseUrl}/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "req-1",
        method: "message/send",
        params: {
          message: {
            role: "user",
            parts: [{ kind: "text", text: "work through A2A" }],
            messageId: "msg-1"
          }
        }
      })
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      jsonrpc: "2.0",
      id: "req-1",
      result: {
        kind: "message",
        role: "agent",
        parts: [{ kind: "text", text: "Accepted instruction: work through A2A" }]
      }
    });
  });

  it("passes A2A framework metadata to command-backed adapters", async () => {
    const artifactDir = await mkdtemp(join(tmpdir(), "agentdispatch-worker-server-"));
    const scriptPath = join(artifactDir, "openclaw-a2a.mjs");
    const previousCommand = process.env.AGENTDISPATCH_FRAMEWORK_COMMAND_OPENCLAW;
    await writeFile(scriptPath, `
let body = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) body += chunk;
const request = JSON.parse(body);
console.log(JSON.stringify({ output: request.framework + ":" + request.instruction + ":" + request.context.repo }));
`);
    process.env.AGENTDISPATCH_FRAMEWORK_COMMAND_OPENCLAW = `${process.execPath} ${scriptPath}`;

    try {
      const response = await fetch(`${baseUrl}/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "req-2",
          method: "message/send",
          params: {
            message: {
              role: "user",
              parts: [{ kind: "text", text: "work through OpenClaw" }],
              messageId: "msg-2"
            },
            metadata: {
              framework: "openclaw",
              context: { repo: "agent-dispatch" }
            }
          }
        })
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        result: {
          parts: [{ kind: "text", text: "openclaw:work through OpenClaw:agent-dispatch" }]
        }
      });
    } finally {
      if (previousCommand === undefined) delete process.env.AGENTDISPATCH_FRAMEWORK_COMMAND_OPENCLAW;
      else process.env.AGENTDISPATCH_FRAMEWORK_COMMAND_OPENCLAW = previousCommand;
      await rm(artifactDir, { recursive: true, force: true });
    }
  });

  it("rejects unsupported POST paths", async () => {
    const response = await fetch(`${baseUrl}/wrong`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskType: "agent.run", input: { instruction: "work" } })
    });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ ok: false });
  });
});
