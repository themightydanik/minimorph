import { it, expect } from "vitest";
import { arenas } from "@minimorph/game-content";
import { Room } from "./matches";
for (const arena of arenas)
  it(`server bots navigate ${arena.id} through real physics from eight safe slots`, () => {
    const room = new Room(arena.id, undefined, 0, 0);
    for (let i = 0; i < 8; i++)
      room.add(`Bot ${i}`, true, (["easy", "normal", "hard"] as const)[i % 3]);
    for (
      let tick = 0;
      tick < 30 * 240 && room.participants.some((p) => p.status === "racing");
      tick++
    )
      room.simulate();
    expect(
      new Set(room.participants.map((p) => p.state.collapseTimes)).size,
    ).toBe(1);
    expect(Object.keys(room.collapseTimes).length).toBeGreaterThan(0);
    for (const p of room.participants)
      expect(
        p.state.won,
        JSON.stringify({ name: p.name, state: p.state }),
      ).toBe(true);
  });
it('hard bots dive only on descent into a long safe deck and respect action locks', async () => {
  const { botInput } = await import('./bots');
  const { createPlayer, ArenaRuntime } = await import('@minimorph/game-simulation');
  const arena = { ...arenas[0], mechanisms: [], obstacles: [], platforms: [{ id: 'safe', x: 0, y: 0, z: 0, width: 10, depth: 40 }] };
  const world = new ArenaRuntime(arena), state = createPlayer(arena);
  Object.assign(state, { x: 0, z: 0, y: .5, grounded: false, vy: -2, coyote: 0 });
  expect(botInput(state, arena, world, 'hard').dive).toBe(true);
  state.vy = 2; expect(botInput(state, arena, world, 'hard').dive).toBe(false);
  state.action = 'recover'; expect(botInput(state, arena, world, 'hard')).toMatchObject({ jump: false, dive: false, x: 0, z: 0 });
});
for(const arena of arenas)it(`eight ${arena.id} bots recover and finish at a different obstacle arrival phase`,()=>{
 const room=new Room(arena.id,undefined,0,0),supports=new Set<string>(),branches=new Set<string>();
 for(let i=0;i<8;i++){const p=room.add(`Phase bot ${i}`,true,(['easy','normal','hard'] as const)[i%3]);p.state.elapsed=2.3;}
 for(let tick=0;tick<30*240&&room.participants.some(p=>p.status==='racing');tick++){
  room.simulate();
  for(const p of room.participants){
   if(p.state.supportId)supports.add(p.state.supportId);
   for(const b of arena.branches??[])if(-p.state.z>b.start&&-p.state.z<b.end&&Math.abs(p.state.x-b.x)<.8&&p.state.grounded)branches.add(b.id);
  }
 }
 for(const p of room.participants)expect(p.state.won,JSON.stringify(p.state)).toBe(true);
 for(const b of arena.branches??[])expect(branches).toContain(b.id);
 expect(supports.has(arena.mechanisms.find(o=>o.kind==='moving-platform')!.id)).toBe(true);
});
it.each(arenas)('bot resumes ordinary navigation after a real walk-off fall in $id',async arena=>{
 const {createPlayer,stepArenaPlayer,FIXED_STEP,ArenaRuntime}=await import('@minimorph/game-simulation');
 const {botInput}=await import('./bots');
 const state=createPlayer(arena),world=new ArenaRuntime(arena);
 // Cause a genuine failure with controls, then hand control back to navigation.
 for(let tick=0;tick<360;tick++)stepArenaPlayer(state,{x:1,z:0,jump:false},FIXED_STEP,arena,world);
 expect(state.falls).toBeGreaterThan(0);
 for(let frame=0;frame<2400&&!state.won;frame++){
  const input=botInput(state,arena,world,'normal');
  for(let tick=0;tick<12;tick++)stepArenaPlayer(state,{...input,jump:input.jump&&tick===0},FIXED_STEP,arena,world);
 }
 expect(state.respawns).toBeGreaterThan(0);expect(state.won,JSON.stringify(state)).toBe(true);
});
