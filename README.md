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
`GET /ping` | AgentCore health check. Returns `{"status":"Healthy"}`.
`GET /health` | Local liveness alias.
`GET /.well-known/agent-card.json` | Returns A2A agent metadata and supported skills.
`POST /` | Accepts A2A JSON-RPC `message/send` messages.
`POST /invocations` | Accepts the AgentDispatch HTTP task envelope.

The default image is optimized for AgentCore A2A runtimes. It listens on port `9000` unless you override `PORT`, matching the AgentCore A2A service contract. For HTTP envelope mode, run with `AGENTDISPATCH_WORKER_PROTOCOL=http PORT=8080`.

The default worker is intentionally small. It proves the AgentCore runtime path and gives teams a place to wire their real subagent implementation.

## Run locally

```bash
npm install
npm run build
AGENTDISPATCH_WORKER_PROTOCOL=a2a npm start
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

The AWS adapter automatically sets `AGENTDISPATCH_WORKER_PROTOCOL` on runtime-mode deployments to match the requested AgentCore protocol. You can override or add environment variables with `target.details.environmentVariables`.

## Customizing the worker

The default executor is `echo`, which is only a smoke-test implementation. For a real cloud subagent, configure a command-backed framework adapter in the runtime environment:

```bash
AGENTDISPATCH_AGENT_FRAMEWORK=openclaw
AGENTDISPATCH_FRAMEWORK_COMMAND_OPENCLAW="openclaw run --stdin-json"
```

Or configure multiple frameworks at once:

```bash
AGENTDISPATCH_FRAMEWORK_COMMANDS='{
  "openclaw": "openclaw run --stdin-json",
  "hermes": {
    "command": "hermes-agent run --stdin-json",
    "timeoutSeconds": 1800,
    "env": {
      "HERMES_MODE": "subagent"
    }
  }
}'
```

When `input.framework` is `openclaw`, the worker launches the configured command without a shell, sends this JSON envelope to `stdin`, and maps the command response back into AgentDispatch events and results:

```json
{
  "taskType": "agent.run",
  "framework": "openclaw",
  "instruction": "Run the background task",
  "context": {},
  "input": {},
  "metadata": {}
}
```

Framework commands can return either plain text or structured JSON:

```json
{
  "output": "Task completed.",
  "result": {
    "summary": "Task completed."
  },
  "events": [
    {
      "type": "task.progress",
      "message": "Repository scan complete."
    }
  ],
  "artifacts": [
    {
      "uri": "s3://bucket/task/result.json",
      "kind": "json",
      "contentType": "application/json"
    }
  ]
}
```

This makes the package usable with:

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
