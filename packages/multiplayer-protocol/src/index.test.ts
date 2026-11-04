import { it, expect } from "vitest";
import { parseClientMessage } from "./index";
it("accepts only versioned typed inputs and refuses client authority and malformed messages", () => {
  const valid = {
    v: 2,
    type: "input",
    command: { seq: 1, x: 1, z: -1, jump: true, yaw: 0 },
  };
  expect(parseClientMessage(JSON.stringify(valid))).toEqual(valid);
  for (const value of [
    { ...valid, position: { z: -400 } },
    { v: 2, type: "finish", time: 1 },
    { ...valid, v: 1 },
    { ...valid, command: { ...valid.command, x: 9 } },
    { ...valid, command: { ...valid.command, yaw: null } },
    { ...valid, command: { ...valid.command, seq: 1.5 } },
    {
      v: 2,
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
it('private joins require a valid code and public matchmaking cannot carry one', () => {
  const join={v: 2,type:'join',mode:'private',name:'Cadet',arenaId:'cosmic-sprint'};
  expect(parseClientMessage(JSON.stringify(join))).toBeNull();
  expect(parseClientMessage(JSON.stringify({...join,code:'ABC234'}))).not.toBeNull();
  expect(parseClientMessage(JSON.stringify({...join,mode:'quick',code:'ABC234'}))).toBeNull();
  expect(parseClientMessage(JSON.stringify({...join,mode:'quick'}))).not.toBeNull();
});
it('accepts analog dive intent but refuses forged action state or nonboolean dive', () => {
  const command = { seq: 2, x: .24, z: -.61, jump: false, dive: true, yaw: .4 };
  const wire = (c: unknown) => JSON.stringify({ v: 2, type: 'input', command: c });
  expect(parseClientMessage(wire(command))).not.toBeNull();
  expect(parseClientMessage(wire({ ...command, dive: 1 }))).toBeNull();
  expect(parseClientMessage(wire({ ...command, action: 'slide' }))).toBeNull();
  expect(parseClientMessage(wire({ ...command, vx: 90 }))).toBeNull();
});
