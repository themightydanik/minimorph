// Ordinary digital controls, recorded in seconds of simulation time. Used by
// physics and real-browser tests; no teleports or disabled hazards.
export const courseRun = [
  { seconds: 1.18, keys: ["KeyW"], jump: false },
  { seconds: 1.08, keys: ["KeyW"], jump: true },
  { seconds: 0.55, keys: ["KeyW", "KeyD"], jump: true },
  { seconds: 0.45, keys: ["KeyW"], jump: false },
  { seconds: 0.65, keys: ["KeyW", "KeyA"], jump: true },
  { seconds: 1.1, keys: ["KeyW"], jump: false },
  { seconds: 1.3, keys: ["KeyW"], jump: true },
];
