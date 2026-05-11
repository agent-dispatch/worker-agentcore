# @agent-dispatch/worker-agentcore

[![npm](https://img.shields.io/npm/v/@agent-dispatch/worker-agentcore.svg)](https://www.npmjs.com/package/@agent-dispatch/worker-agentcore)
[![license](https://img.shields.io/npm/l/@agent-dispatch/worker-agentcore.svg)](https://www.npmjs.com/package/@agent-dispatch/worker-agentcore)

Reference AWS AgentCore worker runtime for AgentDispatch.

This package is the cloud-side process you can package into an ECR image and run through AWS AgentCore. It receives tasks from `@agent-dispatch/adapter-aws-agentcore`, executes them with your chosen agent framework, and exposes protocol endpoints that let the lead agent continue interaction after spawn.

## What it provides

- HTTP task endpoint for `agent.run` and `command.run` payloads.
- A2A-compatible JSON-RPC `message/send` endpoint.
- Agent Card discovery at `/.well-known/agent-card.json`.
- Health endpoint for runtime checks.
- Pluggable execution boundary for OpenClaw, Hermes Agent, LangChain, Strands, custom scripts, or direct model calls.

## Runtime contract

Endpoint | Purpose
--- | ---
`GET /health` | Liveness check.
`GET /.well-known/agent-card.json` | Returns A2A agent metadata and supported skills.
`POST /` | Accepts AgentDispatch task payloads and A2A JSON-RPC messages.

The default worker is intentionally small. It proves the AgentCore runtime path and gives teams a place to wire their real subagent implementation.

## Run locally

```bash
npm install
npm run build
npm start
```

Send an A2A-style message:

```bash
curl -X POST http://localhost:9000/ \
  -H "content-type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "1",
    "method": "message/send",
    "params": {
      "message": {
        "role": "user",
        "parts": [{ "kind": "text", "text": "Run the background task." }]
      }
    }
  }'
```

## Build a runtime image

```bash
docker build -t agentdispatch-worker-agentcore .
docker tag agentdispatch-worker-agentcore:latest 123456789012.dkr.ecr.us-west-2.amazonaws.com/agentdispatch-worker:latest
docker push 123456789012.dkr.ecr.us-west-2.amazonaws.com/agentdispatch-worker:latest
```

Use the pushed image in `@agent-dispatch/adapter-aws-agentcore` runtime mode with `ecrImageUri` and `executionRoleArn`.

## Customizing the worker

Replace the default executor with your framework-specific runtime:

- OpenClaw or Hermes Agent for native subagent execution.
- LangChain, Strands, or custom orchestrators for tool-heavy workflows.
- Direct model calls for simple long-running analysis.
- Internal tools exposed by the runtime container or cloud environment.

The important boundary is the protocol contract: accept an AgentDispatch task or A2A message, run the subagent, emit structured results, and keep cloud credentials inside the runtime environment.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```
