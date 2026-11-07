import * as pc from "playcanvas";
import type { ArenaConfig } from "@minimorph/game-content";
import { sampleMechanism } from "./obstacles";
export function createColliderOverlays(app: pc.Application) {
  const root = new pc.Entity("Authoritative collider overlays", app);
  app.root.addChild(root);
  root.enabled = false;
  const materials = ["#55ff88", "#ff5577", "#55ddff", "#ffee55"].map((hex) => {
    const m = new pc.StandardMaterial();
    m.diffuse = new pc.Color().fromString(hex);
    m.emissive.copy(m.diffuse);
    m.useLighting = false;
    m.opacity = 0.12;
    m.blendType = pc.BLEND_NORMAL;
    m.depthWrite = false;
    m.update();
    return m;
  });
  const entries: {
    entity: pc.Entity;
    ownerId: string;
    localId: string;
    color: pc.Color;
    points: pc.Vec3[];
    world: pc.Vec3[];
  }[] = [];
  function build(arena: ArenaConfig) {
    for (const entry of entries) entry.entity.destroy();
    entries.length = 0;
    const add = (
      id: string,
      x: number,
      y: number,
      z: number,
      width: number,
      depth: number,
      height: number,
      yaw: number,
      color: number,
      radius?: number,
    ) => {
      const binding = arena.colliderOwners?.[id] ?? {
          ownerId: id,
          localId: "body",
        },
        entity = new pc.Entity(`Collider ${id}`, app);
      root.addChild(entity);
      entity.addComponent("render", {
        type: radius === undefined ? "box" : "cylinder",
        castShadows: false,
        receiveShadows: false,
      });
      entity.render!.meshInstances[0].material = materials[color];
      entity.setPosition(x, y + height / 2, z);
      entity.setEulerAngles(0, (yaw * 180) / Math.PI, 0);
      entity.setLocalScale(
        radius === undefined ? width : radius * 2,
        Math.max(0.04, height),
        radius === undefined ? depth : radius * 2,
      );
      const points =
        radius === undefined
          ? Array.from(
              { length: 8 },
              (_, i) =>
                new pc.Vec3(
                  i & 1 ? 0.5 : -0.5,
                  i & 2 ? 0.5 : -0.5,
                  i & 4 ? 0.5 : -0.5,
                ),
            )
          : Array.from(
              { length: 24 },
              (_, i) =>
                new pc.Vec3(
                  Math.cos((i / 24) * Math.PI * 2) * 0.5,
                  0.5,
                  Math.sin((i / 24) * Math.PI * 2) * 0.5,
                ),
            );
      entries.push({
        entity,
        ...binding,
        color: materials[color].diffuse,
        points,
        world: points.map(() => new pc.Vec3()),
      });
    };
    for (const p of arena.platforms)
      add(p.id!, p.x, p.y, p.z, p.width, p.depth, 0, p.yaw ?? 0, 0, p.radius);
    for (const m of arena.mechanisms) {
      const p = sampleMechanism(m, 0),
        width =
          "length" in m
            ? m.length
            : "radius" in m
              ? m.radius * 2
              : "width" in m
                ? m.width
                : 1,
        depth =
          m.kind === "sweeper"
            ? m.width
            : "radius" in m
              ? m.radius * 2
              : "depth" in m
                ? m.depth
                : 1;
      const interactive = m.kind === "jump-pad" || m.kind === "conveyor",
        surface = m.kind === "rotating-disc";
      add(
        m.id,
        p.x,
        p.y,
        p.z,
        width,
        depth,
        surface
          ? 0
          : "height" in m
            ? m.height
            : interactive
              ? m.kind === "conveyor"
                ? (m.triggerHeight ?? 0.35)
                : 0.35
              : 0.35,
        (m.yaw ?? 0) + (m.kind === "sweeper" ? p.angle : 0),
        surface || m.kind === "solid-box" ? 0 : interactive ? 2 : 1,
        m.kind === "rotating-disc" ? m.radius : undefined,
      );
    }
    arena.checkpoints.forEach((p, i) =>
      p.enabled === false
        ? undefined
        : add(
            `checkpoint-${i}`,
            p.x,
            p.y,
            p.z,
            p.radius * 2,
            p.radius * 2,
            0,
            0,
            3,
            p.radius,
          ),
    );
    const p = arena.finish;
    add(
      "finish-gate",
      p.x,
      p.y,
      p.z,
      p.radius * 2,
      p.radius * 2,
      0,
      0,
      3,
      p.radius,
    );
  }
  return {
    root,
    build,
    pick(ray: pc.Ray) {
      let best = Infinity,
        found: (typeof entries)[number] | undefined;
      const hit = new pc.Vec3();
      for (const entry of entries)
        if (
          entry.entity.render!.meshInstances[0].aabb.intersectsRay(ray, hit)
        ) {
          const d = ray.origin.distance(hit);
          if (d < best) {
            best = d;
            found = entry;
          }
        }
      return found;
    },
    draw() {
      if (!root.enabled) return;
      for (const entry of entries) {
        const matrix = entry.entity.getWorldTransform();
        for (let i = 0; i < entry.points.length; i++)
          matrix.transformPoint(entry.points[i], entry.world[i]);
        if (entry.points.length === 8) {
          for (let i = 0; i < 8; i++)
            for (const bit of [1, 2, 4])
              if (!(i & bit))
                app.drawLine(entry.world[i], entry.world[i | bit], entry.color);
        } else
          for (let i = 0; i < entry.world.length; i++)
            app.drawLine(
              entry.world[i],
              entry.world[(i + 1) % entry.world.length],
              entry.color,
            );
      }
    },
    destroy() {
      root.destroy();
      materials.forEach((m) => m.destroy());
    },
  };
}
