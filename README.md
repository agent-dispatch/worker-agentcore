# @agentdispatch/worker-agentcore

Reference AgentCore worker contract for AgentDispatch.

The worker accepts normalized AgentDispatch payloads, executes long-running `agent.run` or `command.run` work, emits structured JSON events, and returns a JSON result. It is intended to be packaged into the ECR image used by `agentcore.runtime` mode.

## Agent Frameworks

Cloud adapters decide where a task runs. Worker framework adapters decide what agent framework runs inside that worker.

`agent.run` selects a framework in this order:

1. `input.framework`
2. top-level `framework`
3. `AGENTDISPATCH_AGENT_FRAMEWORK`
4. built-in `echo`

The built-in `echo` framework preserves the current reference behavior. Production workers can pass `frameworkAdapters` to `runAgentDispatchWorkerTask` to register adapters for Strands, LangChain, LangGraph, CrewAI, OpenAI Agents, or other deep-agent frameworks without changing MCP tools or cloud adapters.

## Contract

The worker response includes:

- `events`: structured `task.progress`, `task.heartbeat`, `task.log`, and `task.result` events.
- `artifacts`: metadata for files written by the worker.
- `output`: human-readable summary text.

Environment:

- `AGENTDISPATCH_ARTIFACT_DIR`: where `result.json` and `manifest.json` are written.
- `AGENTDISPATCH_COMMAND_ALLOWLIST`: comma-separated command prefixes allowed for `command.run`.
- `AGENTDISPATCH_AGENT_FRAMEWORK`: default `agent.run` framework name when the payload does not specify one.
