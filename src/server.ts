import { createServer } from "node:http";
import { runAgentDispatchWorkerTask, type WorkerPayload } from "./index.js";

const port = Number(process.env.PORT ?? 8080);

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/ping") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ok" }));
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
    const result = await runAgentDispatchWorkerTask(payload);
    response.writeHead(result.ok ? 200 : 500, { "content-type": "application/json" });
    response.end(JSON.stringify(result));
  } catch (error) {
    response.writeHead(400, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  }
});

server.listen(port, () => {
  console.error(`AgentDispatch worker listening on ${port}`);
});
