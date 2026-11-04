import { it, expect } from "vitest";
import { parseClientMessage } from "./index";
it("accepts only versioned typed inputs and refuses client authority and malformed messages", () => {
  const valid = {
    v: 1,
    type: "input",
    command: { seq: 1, x: 1, z: -1, jump: true, yaw: 0 },
  };
  expect(parseClientMessage(JSON.stringify(valid))).toEqual(valid);
  for (const value of [
    { ...valid, position: { z: -400 } },
    { v: 1, type: "finish", time: 1 },
    { ...valid, v: 2 },
    { ...valid, command: { ...valid.command, x: 9 } },
    { ...valid, command: { ...valid.command, yaw: null } },
    { ...valid, command: { ...valid.command, seq: 1.5 } },
    {
      v: 1,
      type: "join",
      mode: "quick",
      name: "<script>",
      arenaId: "cosmic-sprint",
    },
    null,
    [],
    {},
  ])
    expect(parseClientMessage(JSON.stringify(value))).toBeNull();
  expect(parseClientMessage("{")).toBeNull();
  expect(parseClientMessage("x".repeat(2049))).toBeNull();
});
