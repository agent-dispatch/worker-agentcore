import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { runAgentDispatchWorkerTask, type WorkerPayload } from "./index.js";

const protocol = (process.env.AGENTDISPATCH_WORKER_PROTOCOL ?? "http").toLowerCase();
const port = Number(process.env.PORT ?? (protocol === "a2a" ? 9000 : 8080));

export const server = createServer(handleRequest);

export async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method === "GET" && request.url === "/ping") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "Healthy" }));
    return;
  }

  if (request.method === "GET" && request.url === "/.well-known/agent-card.json") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(createAgentCard()));
    return;
  }

  if (request.method === "POST" && request.url !== "/invocations" && request.url !== "/") {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: "Not found. Use POST /invocations for HTTP or POST / for A2A." }));
    return;
  }

  if (request.method !== "POST") {
    response.writeHead(405);
    response.end();
    return;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }

  try {
    const requestBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (request.url === "/") {
      await handleA2ARequest(requestBody, response);
      return;
    }
    const payload = requestBody as WorkerPayload;
    const result = await runAgentDispatchWorkerTask(payload, {
      artifactDir: process.env.AGENTDISPATCH_ARTIFACT_DIR,
      commandAllowlist: process.env.AGENTDISPATCH_COMMAND_ALLOWLIST?.split(",").map((value) => value.trim()).filter(Boolean)
    });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(result));
  } catch (error) {
    response.writeHead(400, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  }
}

if (process.env.AGENTDISPATCH_WORKER_NO_LISTEN !== "1") {
  server.listen(port, () => {
    console.error(`AgentDispatch worker listening on ${port}`);
  });
}

async function handleA2ARequest(body: any, response: ServerResponse): Promise<void> {
  if (body?.jsonrpc !== "2.0" || body?.method !== "message/send") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      jsonrpc: "2.0",
      id: body?.id ?? null,
      error: {
        code: -32601,
        message: "Unsupported A2A method. Use message/send."
      }
    }));
    return;
  }

  const instruction = extractA2AText(body);
  const metadata = body.params?.metadata && typeof body.params.metadata === "object" ? body.params.metadata : {};
  const input = metadata.input && typeof metadata.input === "object"
    ? { ...metadata.input, instruction }
    : { instruction, context: metadata.context ?? {} };
  const result = await runAgentDispatchWorkerTask({
    taskType: "agent.run",
    input,
    metadata
  }, {
    artifactDir: process.env.AGENTDISPATCH_ARTIFACT_DIR,
    commandAllowlist: process.env.AGENTDISPATCH_COMMAND_ALLOWLIST?.split(",").map((value) => value.trim()).filter(Boolean)
  });

  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({
    jsonrpc: "2.0",
    id: body.id,
    result: {
      kind: "message",
      role: "agent",
      messageId: randomUUID(),
      parts: [
        {
          kind: "text",
          text: result.output ?? (result.ok ? "Task accepted." : result.error ?? "Task failed.")
        }
      ],
      metadata: {
        ok: result.ok,
        events: result.events,
        artifacts: result.artifacts,
        error: result.error
      }
    }
  }));
}

function extractA2AText(body: any): string {
  const parts = body?.params?.message?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part) => typeof part?.text === "string" ? part.text : "")
    .filter(Boolean)
    .join("\n");
}

function createAgentCard() {
  const name = process.env.AGENTDISPATCH_AGENT_NAME ?? "AgentDispatch Worker";
  return {
    name,
    description: process.env.AGENTDISPATCH_AGENT_DESCRIPTION ?? "AgentDispatch-compatible cloud subagent runtime.",
    version: process.env.npm_package_version ?? "0.1.0",
    url: process.env.AGENTCORE_RUNTIME_URL ?? "/",
    protocolVersion: "0.3.0",
    capabilities: {
      streaming: false,
      pushNotifications: false
    },
    defaultInputModes: ["text/plain", "application/json"],
    defaultOutputModes: ["text/plain", "application/json"],
    skills: [
      {
        id: "agentdispatch.agent.run",
        name: "Run delegated agent task",
        description: "Accepts an A2A message and executes it using the configured AgentDispatch worker framework."
      }
    ]
  };
}
