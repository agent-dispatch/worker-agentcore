import { createServer } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
