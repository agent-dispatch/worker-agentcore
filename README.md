# @agentdispatch/worker-agentcore

Reference AgentCore worker contract for AgentDispatch.

The worker accepts normalized AgentDispatch payloads, executes long-running `agent.run` or `command.run` work, emits structured JSON events, and returns a JSON result. It is intended to be packaged into the ECR image used by `agentcore.runtime` mode.
