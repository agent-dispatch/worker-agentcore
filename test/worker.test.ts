import { describe, expect, it } from "vitest";
import { runAgentDispatchWorkerTask } from "../src/index.js";

describe("worker contract", () => {
  it("accepts agent.run payloads", async () => {
    const result = await runAgentDispatchWorkerTask({ taskType: "agent.run", input: { instruction: "work" } });
    expect(result.ok).toBe(true);
    expect(result.events[0].type).toBe("task.progress");
  });
});
