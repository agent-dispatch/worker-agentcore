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

  it("accepts invocation requests on /invocations", async () => {
    const response = await fetch(`${baseUrl}/invocations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskType: "agent.run", input: { instruction: "work" } })
    });
    await expect(response.json()).resolves.toMatchObject({ ok: true, output: "Accepted instruction: work" });
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
