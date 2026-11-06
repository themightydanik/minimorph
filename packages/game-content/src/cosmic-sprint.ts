import type {
  ArenaConfig,
  ArenaObstacle,
  ArenaVisual,
  NavigationRoute,
  Point,
} from "./arenas";
import type { Platform } from "./legacy";
const p = (x: number, z: number, y = 0): Point => ({ x, y, z });
const spawn = p(0, 28),
  finish = { ...p(90, -214, 0.2), radius: 2.2 };
const checkpoints = [
  { ...p(8, -14), radius: 2.4 },
  { ...p(24, -50), radius: 2.4 },
  { ...p(48, -126), radius: 2.6 },
  { ...p(38, -138, 0.2), radius: 2.4 },
  { ...p(66, -177, 0.2), radius: 2.4 },
  { ...p(88, -190, 0.2), radius: 2.4 },
];
const navigation: NavigationRoute[] = [
  {
    id: "star-launch",
    stage: 0,
    name: "Star Launch",
    points: [spawn, p(0, -6), checkpoints[0]],
  },
  {
    id: "hammer-detour",
    stage: 1,
    name: "Hammer Plaza outside arc",
    points: [checkpoints[0], p(0, -20), p(-6, -32), p(0, -47), checkpoints[1]],
  },
  {
    id: "turbo-lane",
    stage: 2,
    name: "Turbo Lane",
    skill: "hard",
    points: [
      checkpoints[1],
      p(52, -56),
      p(76, -68),
      p(76, -102),
      checkpoints[2],
    ],
  },
  {
    id: "bounce-garden",
    stage: 2,
    name: "Bounce Garden",
    skill: "easy",
    points: [
      checkpoints[1],
      p(0, -60),
      p(-24, -76),
      p(-24, -104),
      p(8, -122),
      checkpoints[2],
    ],
  },
  {
    id: "carousel-entry",
    stage: 3,
    name: "Orbit Carousel approach",
    points: [checkpoints[2], checkpoints[3]],
  },
  {
    id: "carousel-crossing",
    stage: 4,
    name: "Orbit Carousel",
    points: [
      checkpoints[3],
      p(38, -149, 0.2),
      p(48, -155, 0.2),
      p(57, -163, 0.2),
      p(64, -172, 0.2),
      checkpoints[4],
    ],
  },
  {
    id: "star-stair",
    stage: 5,
    name: "Star Finish approach",
    points: [checkpoints[4], p(80, -177, 0.2), checkpoints[5]],
  },
  {
    id: "star-finish",
    stage: 6,
    name: "Star Finish",
    points: [checkpoints[5], p(104, -200, 0.8), finish],
  },
];
const platforms: Platform[] = [],
  visuals: ArenaVisual[] = [],
  mechanisms: ArenaObstacle[] = [];
function deck(
  id: string,
  at: Point,
  width: number,
  depth: number,
  asset = "wide-floating-island",
  yaw = 0,
) {
  platforms.push({ x: at.x, y: at.y, z: at.z, id, width, depth, yaw });
  visuals.push({ ...at, id, asset, width, depth, yaw, fit: "floor" });
}
function bridge(
  id: string,
  a: Point,
  b: Point,
  width: number,
  asset = "large-floor-panel",
) {
  deck(
    id,
    p((a.x + b.x) / 2, (a.z + b.z) / 2, a.y),
    width,
    Math.hypot(b.x - a.x, b.z - a.z) + 2,
    asset,
    Math.atan2(b.x - a.x, b.z - a.z),
  );
}
deck("launch-island", p(0, 12), 32, 48);
bridge("launch-fan", p(0, -7), checkpoints[0], 22, "main-floor-tile");
platforms.push({
  id: "hammer-plaza",
  ...p(12, -32),
  width: 48,
  depth: 48,
  radius: 24,
});
visuals.push({
  id: "hammer-plaza",
  ...p(12, -32),
  asset: "circular-arena-floor",
  width: 48,
  depth: 48,
  fit: "floor",
});
deck(
  "branch-crossroads",
  checkpoints[1],
  24,
  16,
  "landing-transition-platform",
);
for (const route of navigation.filter((r) => r.stage === 2))
  for (let i = 1; i < route.points.length; i++)
    bridge(
      `${route.id}-${i}`,
      route.points[i - 1],
      route.points[i],
      route.skill === "easy" ? 13 : 9,
    );
deck("rejoin-island", checkpoints[2], 30, 18, "landing-transition-platform");
bridge("carousel-approach", checkpoints[2], checkpoints[3], 15);
deck("carousel-entry-island", checkpoints[3], 14, 12);
deck(
  "carousel-exit-island",
  checkpoints[4],
  22,
  16,
  "landing-transition-platform",
);
bridge("finish-promenade", checkpoints[4], p(80, -177, 0.2), 16);
bridge("finish-turn", p(80, -177, 0.2), checkpoints[5], 14);
bridge("final-rise", checkpoints[5], p(96, -195, 0.2), 13, "large-floor-panel");
deck("star-step", p(100, -198, 0.8), 14, 12, "main-floor-tile");
bridge("final-descent", p(104, -200, 0.8), p(97, -206, 0.8), 12);
deck("finish-island", finish, 28, 22, "landing-transition-platform");
for (const [i, at] of [
  p(2, -28, 0.9),
  p(14, -34, 0.9),
  p(25, -40, 0.9),
].entries())
  mechanisms.push({
    ...at,
    id: `park-hammer-${i}`,
    kind: "sweeper",
    length: 7.6,
    width: 2.1,
    height: 1.9,
    period: 5.8 + i * 0.6,
    phase: i * 0.8,
  });
mechanisms.push(
  {
    ...p(43, -54),
    id: "turbo-east",
    kind: "conveyor",
    width: 8,
    depth: 25,
    yaw: Math.PI / 2,
    velocityX: 2.3,
    velocityZ: 0,
    period: 1,
  },
  {
    ...p(76, -84),
    id: "turbo-north",
    kind: "conveyor",
    width: 8,
    depth: 26,
    velocityX: 0,
    velocityZ: -2.3,
    period: 1,
  },
  {
    ...p(80, -80),
    id: "turbo-piston-a",
    kind: "pusher",
    width: 2.8,
    depth: 1.2,
    height: 1,
    shaft: false,
    side: 1,
    reach: 7,
    period: 4.6,
    warning: 1,
    activeFor: 1.2,
  },
  {
    ...p(72, -96),
    id: "turbo-piston-b",
    kind: "pusher",
    width: 2.8,
    depth: 1.2,
    height: 1,
    shaft: false,
    side: -1,
    reach: 7,
    period: 4.6,
    phase: 2.3,
    warning: 1,
    activeFor: 1.2,
  },
  {
    ...p(-24, -78),
    id: "garden-pad-a",
    kind: "jump-pad",
    width: 5,
    depth: 5,
    boost: 10.5,
    period: 1,
  },
  {
    ...p(-24, -98),
    id: "garden-pad-b",
    kind: "jump-pad",
    width: 5,
    depth: 5,
    boost: 10.5,
    period: 1,
  },
  {
    ...p(38, -149, 0.2),
    id: "carousel-a",
    kind: "rotating-disc",
    radius: 11,
    period: 28,
  },
  {
    ...p(57, -163, 0.2),
    id: "carousel-b",
    kind: "rotating-disc",
    radius: 12,
    period: 34,
  },
);
// Forgiving garden landings and optional elevated jumping islands, all physically real.
for (const [i, at] of [p(-24, -85, 0.6), p(-16, -111, 0.6)].entries())
  deck(`garden-island-${i}`, at, 10, 10, "main-floor-tile");
visuals.push(
  {
    id: "start-gate",
    ...p(0, 18),
    asset: "cosmic-start-gate",
    width: 24,
    depth: 6,
    yaw: Math.PI / 2,
    fit: "gate",
  },
  {
    id: "finish-gate",
    ...finish,
    asset: "star-finish-gate",
    width: 20,
    depth: 7,
    yaw: Math.PI / 2,
    fit: "gate",
  },
);
for (const [i, at] of checkpoints.entries())
  visuals.push({
    id: `checkpoint-${i}`,
    ...at,
    asset: "checkpoint-gate-marker",
    width: 9,
    depth: 3,
    yaw: Math.PI / 2,
    fit: "gate",
  });
for (const o of mechanisms) {
  const asset =
    o.kind === "sweeper"
      ? "giant-padded-hammer"
      : o.kind === "conveyor"
        ? "turbo-conveyor"
        : o.kind === "pusher"
          ? "sliding-bumper"
          : o.kind === "jump-pad"
            ? "inflatable-bounce-pad"
            : "rotating-carousel";
  visuals.push({
    id: `art-${o.id}`,
    asset,
    mechanismId: o.id,
    ...p(o.x, o.z, o.kind === "sweeper" ? 0 : o.y),
    width:
      o.kind === "sweeper"
        ? o.length
        : o.kind === "rotating-disc"
          ? o.radius * 2
          : "width" in o
            ? o.width
            : 7.6,
    depth:
      o.kind === "sweeper"
        ? o.length
        : o.kind === "rotating-disc"
          ? o.radius * 2
          : "depth" in o
            ? o.depth
            : 7.6,
    yaw:
      o.kind === "sweeper"
        ? Math.PI / 2
        : o.kind === "pusher"
          ? (o.side * Math.PI) / 2
          : o.yaw,
    fit: o.kind === "sweeper" || o.kind === "pusher" ? "prop" : "floor",
  });
}
for (const [i, at] of [
  p(-30, -25, -9),
  p(54, -28, -10),
  p(-45, -94, -10),
  p(103, -140, -13),
  p(55, -207, -8),
].entries())
  visuals.push({
    ...at,
    id: `space-prop-${i}`,
    asset: "space-decoration-kit",
    part: i % 7,
    width: 12,
    depth: 12,
    fit: "prop",
  });
export const cosmicSprint: ArenaConfig = {
  id: "cosmic-sprint",
  name: "Cosmic Sprint",
  subtitle: "GALACTIC FUN PARK",
  difficulty: "CADET",
  description:
    "A wide galactic party park. Cross Hammer Plaza, choose Turbo Lane or Bounce Garden, ride the Orbit Carousel and climb to Star Finish.",
  palette: {
    sky: "#101a38",
    deck: "#283f7d",
    alternate: "#7462ef",
    accent: "#48f5dc",
    hazard: "#ffb75b",
    planet: "#c87cff",
  },
  spawn,
  finish,
  checkpoints,
  platforms,
  obstacles: [],
  mechanisms,
  navigation,
  visuals,
  airControl: 0.8,
  expectedSeconds: [60, 90],
  sections: [
    {
      id: "star-launch",
      name: "01 · Star Launch",
      start: -40,
      end: 14,
      hint: "Spread out across the launch island. Hammer Plaza has several approaches.",
      cameraDistance: 3,
      cameraLift: 2,
    },
    {
      id: "hammer-plaza",
      name: "02 · Hammer Plaza",
      start: 14,
      end: 50,
      hint: "Read the three padded hammers; take the open outside arc or risk the direct cut.",
      cameraDistance: 3,
      cameraLift: 2,
    },
    {
      id: "branching-routes",
      name: "03 · Turbo Lane / Bounce Garden",
      start: 50,
      end: 126,
      hint: "Right: the quick conveyor route. Left: a wider bounce garden. Both rejoin at the gate.",
      cameraDistance: 2,
      cameraLift: 1.5,
    },
    {
      id: "orbit-carousel",
      name: "04 · Orbit Carousel",
      start: 126,
      end: 177,
      hint: "Ride the spinning floors, steer across their join and aim for the wide exit island.",
      cameraDistance: 3,
      cameraLift: 2,
    },
    {
      id: "star-finish",
      name: "05 · Star Finish",
      start: 177,
      end: 230,
      hint: "Jump onto the raised star step, turn left and finish under the star arch.",
      cameraDistance: 2,
      cameraLift: 1.5,
    },
  ],
  routes: navigation
    .filter((r) => r.stage === 2)
    .map((r) => ({ name: r.name, points: r.points })),
  branches: [
    {
      id: "turbo-lane",
      name: "Turbo Lane",
      tradeoff: "Shorter exposed conveyor route with timed piston bumpers",
      start: 50,
      end: 124,
      x: 76,
      skill: "hard",
    },
    {
      id: "bounce-garden",
      name: "Bounce Garden",
      tradeoff: "Longer, wide bounce route with forgiving lower landings",
      start: 50,
      end: 124,
      x: -24,
      skill: "easy",
    },
  ],
};
