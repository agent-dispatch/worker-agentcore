import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { runAgentDispatchWorkerTask, type WorkerPayload } from "./index.js";

const port = Number(process.env.PORT ?? 8080);

export const server = createServer(handleRequest);

export async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method === "GET" && request.url === "/ping") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "Healthy" }));
    return;
  }

  if (request.method === "POST" && request.url !== "/invocations") {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: "Not found. Use POST /invocations." }));
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
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as WorkerPayload;
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
