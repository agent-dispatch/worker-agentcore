# @agentdispatch/worker-agentcore

Reference AgentCore worker contract for AgentDispatch.

The worker accepts normalized AgentDispatch payloads, executes long-running `agent.run` or `command.run` work, emits structured JSON events, and returns a JSON result. It is intended to be packaged into the ECR image used by `agentcore.runtime` mode.

## Contract

The worker response includes:

- `events`: structured `task.progress`, `task.heartbeat`, `task.log`, and `task.result` events.
- `artifacts`: metadata for files written by the worker.
- `output`: human-readable summary text.

Environment:

- `AGENTDISPATCH_ARTIFACT_DIR`: where `result.json` and `manifest.json` are written.
- `AGENTDISPATCH_COMMAND_ALLOWLIST`: comma-separated command prefixes allowed for `command.run`.
