"""Rig the approved static Meshy mesh without rebuilding its geometry.
Blender 4.x background automation; conservative anatomical masks, not heat weights.
"""

import argparse, hashlib, json, math, sys
from pathlib import Path
import bpy
from mathutils import Vector, Quaternion

sys.path.insert(0, str(Path(__file__).parent))
from optimize_meshy import stage

FPS = 30
CLIPS = {
    "Idle": (60, True),
    "Run": (18, True),
    "Jump": (12, False),
    "Fall": (24, True),
    "Land": (12, False),
    "Victory": (60, False),
}
BONES = {}


def add(name, head, tail, parent=None):
    b = ARM.data.edit_bones.new(name)
    b.head = head
    b.tail = tail
    if parent:
        b.parent = ARM.data.edit_bones[parent]
    BONES[name] = (Vector(head), Vector(tail))


def rig(mesh):
    global ARM
    bpy.ops.object.select_all(action="DESELECT")
    data = bpy.data.armatures.new("Minimorph_Skeleton")
    ARM = bpy.data.objects.new("Minimorph_Rig", data)
    bpy.context.scene.collection.objects.link(ARM)
    bpy.context.view_layer.objects.active = ARM
    ARM.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    add("Root", (0, 0, 0), (0, 0, 0.15))
    add("Pelvis", (0, 0, 0.50), (0, 0, 0.60), "Root")
    add("Spine", (0, 0, 0.60), (0, 0, 0.76), "Pelvis")
    add("Chest", (0, 0, 0.76), (0, 0, 0.94), "Spine")
    add("Neck", (0, 0, 0.94), (0, 0, 1.04), "Chest")
    add("Head", (0, 0, 1.04), (0, 0, 1.65), "Neck")
    for side, s in [("L", 1), ("R", -1)]:
        add("Shoulder." + side, (s * 0.21, 0, 0.91), (s * 0.36, 0, 0.88), "Chest")
        add(
            "UpperArm." + side,
            (s * 0.36, 0, 0.88),
            (s * 0.445, 0.015, 0.665),
            "Shoulder." + side,
        )
        add(
            "LowerArm." + side,
            (s * 0.445, 0.015, 0.665),
            (s * 0.46, 0.035, 0.475),
            "UpperArm." + side,
        )
        add(
            "Hand." + side,
            (s * 0.46, 0.035, 0.475),
            (s * 0.46, 0.07, 0.40),
            "LowerArm." + side,
        )
        add(
            "UpperLeg." + side, (s * 0.205, 0, 0.47), (s * 0.225, 0.015, 0.29), "Pelvis"
        )
        add(
            "LowerLeg." + side,
            (s * 0.225, 0.015, 0.29),
            (s * 0.225, 0.02, 0.12),
            "UpperLeg." + side,
        )
        add(
            "Foot." + side,
            (s * 0.225, 0.02, 0.12),
            (s * 0.225, 0.16, 0.06),
            "LowerLeg." + side,
        )
    bpy.ops.object.mode_set(mode="OBJECT")
    groups = {n: mesh.vertex_groups.new(name=n) for n in BONES}

    def blend(a, b, t):
        t = max(0, min(1, t))
        t = t * t * (3 - 2 * t)
        return {a: 1 - t, b: t}

    for v in mesh.data.vertices:
        x, y, z = v.co
        s = "L" if x >= 0 else "R"
        x = abs(x)
        if z >= 0.98:
            w = {"Head": 1}
        elif x > 0.365 and z > 0.40:
            if z > 0.75:
                w = {"UpperArm." + s: 1}
            elif z > 0.70:
                w = blend("LowerArm." + s, "UpperArm." + s, (z - 0.70) / 0.05)
            elif z > 0.51:
                w = {"LowerArm." + s: 1}
            elif z > 0.475:
                w = blend("Hand." + s, "LowerArm." + s, (z - 0.475) / 0.035)
            else:
                w = {"Hand." + s: 1}
        elif z < 0.50 and x > 0.095:
            if z > 0.345:
                w = {"UpperLeg." + s: 1}
            elif z > 0.315:
                w = blend("LowerLeg." + s, "UpperLeg." + s, (z - 0.315) / 0.030)
            elif z > 0.18:
                w = {"LowerLeg." + s: 1}
            elif z > 0.155:
                w = blend("Foot." + s, "LowerLeg." + s, (z - 0.155) / 0.025)
            else:
                w = {"Foot." + s: 1}
        elif z > 0.58:
            w = {"Chest": 1}
        elif z > 0.53:
            w = blend("Pelvis", "Chest", (z - 0.53) / 0.05)
        else:
            w = {"Pelvis": 1}
        for name, weight in w.items():
            if weight > 1e-6:
                groups[name].add([v.index], weight, "REPLACE")
    mesh.parent = ARM
    mod = mesh.modifiers.new("Minimorph skeletal deformation", "ARMATURE")
    mod.object = ARM
    for p in ARM.pose.bones:
        p.rotation_mode = "QUATERNION"
    return ARM


def rotate(name, x=0, y=0, z=0):
    bone = ARM.data.bones[name]
    inverse = bone.matrix_local.to_3x3().inverted()
    q = (
        Quaternion(inverse @ Vector((1, 0, 0)), math.radians(x))
        @ Quaternion(inverse @ Vector((0, 1, 0)), math.radians(y))
        @ Quaternion(inverse @ Vector((0, 0, 1)), math.radians(z))
    )
    ARM.pose.bones[name].rotation_quaternion = q


def translate(name, vector):
    ARM.pose.bones[name].location = ARM.data.bones[
        name
    ].matrix_local.to_3x3().inverted() @ Vector(vector)


def legs(bob, targets):
    for side in ["L", "R"]:
        head, knee = BONES["UpperLeg." + side]
        _, ankle = BONES["LowerLeg." + side]
        # Two-link sagittal IK; x offsets stay in the approved compact rest anatomy.
        a = math.hypot(knee.y - head.y, knee.z - head.z)
        b = math.hypot(ankle.y - knee.y, ankle.z - knee.z)
        hy, hz = head.y, head.z + bob
        ay, az = targets[side]
        dy, dz = ay - hy, az - hz
        dist = max(1e-5, min(math.hypot(dy, dz), a + b - 1e-6))
        length = math.hypot(dy, dz)
        uy, uz = dy / length, dz / length
        along = (a * a - b * b + dist * dist) / (2 * dist)
        height = math.sqrt(max(0, a * a - along * along))
        ky, kz = hy + uy * along - uz * height, hz + uz * along + uy * height
        upper = math.atan2(ky - hy, hz - kz) - math.atan2(
            knee.y - head.y, head.z - knee.z
        )
        lower = (
            math.atan2(ay - ky, kz - az)
            - math.atan2(ankle.y - knee.y, knee.z - ankle.z)
            - upper
        )
        rotate("UpperLeg." + side, math.degrees(upper))
        rotate("LowerLeg." + side, math.degrees(lower))
        rotate("Foot." + side, -math.degrees(upper + lower))


def pose(name, t):
    for p in ARM.pose.bones:
        p.location = (0, 0, 0)
        p.rotation_quaternion = (1, 0, 0, 0)
        p.scale = (1, 1, 1)
    phase = t * 2 * math.pi
    bob = 0
    targets = {s: (0.02, 0.12) for s in ["L", "R"]}
    if name == "Idle":
        bob = -0.003 * (1 - math.cos(phase))
        rotate("Spine", 0.7 * math.sin(phase))
    elif name == "Run":
        bob = -0.04 + 0.008 * math.cos(phase * 2)
        rotate("Spine", -5)
        for side, offset in [("L", 0), ("R", 0.5)]:
            u = (t + offset) % 1
            if u < 0.5:
                fy = 0.14 - 0.48 * u
                fz = 0.12
            else:
                v = (u - 0.5) * 2
                fy = -0.10 + 0.24 * v
                fz = 0.12 + 0.07 * math.sin(math.pi * v)
            targets[side] = (fy, fz)
            rotate(
                "UpperArm." + side, (-1 if side == "L" else 1) * 20 * math.cos(phase)
            )
            rotate("LowerArm." + side, -12)
    elif name == "Jump":
        bend = math.sin(math.pi * t)
        bob = -0.025 * (1 - t)
        rotate("Spine", -4 * bend)
        for side in ["L", "R"]:
            targets[side] = (0.02 - 0.04 * t, 0.12 + 0.035 * t)
            rotate("UpperArm." + side, 25 * t)
            rotate("LowerArm." + side, -12 * t)
    elif name == "Fall":
        for side, s in [("L", 1), ("R", -1)]:
            targets[side] = (-0.045, 0.16)
            rotate("UpperArm." + side, 15, -s * (18 + 2 * math.sin(phase)))
            rotate("LowerArm." + side, -18)
    elif name == "Land":
        envelope = math.sin(math.pi * t) * (1 - t)
        bob = -0.12 * envelope
        rotate("Spine", -12 * envelope)
        for side in ["L", "R"]:
            rotate("UpperArm." + side, 25 * envelope)
            rotate("LowerArm." + side, -12 * envelope)
    elif name == "Victory":
        envelope = math.sin(math.pi * t) ** 2
        bob = -0.015 * envelope
        rotate("Spine", -2 * envelope)
        for side, s in [("L", 1), ("R", -1)]:
            rotate("UpperArm." + side, 12 * envelope, -s * 65 * envelope)
            rotate("LowerArm." + side, -35 * envelope)
    translate("Root", (0, 0, bob))
    legs(bob, targets)
    bpy.context.view_layer.update()


def make_actions():
    result = []
    for name, (frames, loop) in CLIPS.items():
        ARM.animation_data_create()
        ARM.animation_data.action = None
        action = bpy.data.actions.new(name)
        ARM.animation_data.action = action
        previous = {}
        for frame in range(frames + 1):
            bpy.context.scene.frame_set(frame)
            pose(name, frame / frames)
            for p in ARM.pose.bones:
                q = p.rotation_quaternion
                if p.name in previous and q.dot(previous[p.name]) < 0:
                    q.negate()
                previous[p.name] = q.copy()
                p.keyframe_insert(data_path="rotation_quaternion", frame=frame)
                p.keyframe_insert(data_path="location", frame=frame)
        action.use_fake_user = True
        result.append(
            {
                "name": name,
                "duration": frames / FPS,
                "frames": frames,
                "fps": FPS,
                "loop": loop,
            }
        )
        ARM.animation_data.action = None
        track = ARM.animation_data.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 0, action)
        strip.action_frame_start = 0
        strip.action_frame_end = frames
        track.mute = True
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("assets/characters/minimorph/minimorph_v1.glb"),
    )
    parser.add_argument(
        "--output", type=Path, default=Path("assets/characters/minimorph/animation")
    )
    parser.add_argument("--renders", action="store_true")
    parser.add_argument("--save-source", type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1 :])
    args.output.mkdir(parents=True, exist_ok=True)
    source_hash = hashlib.sha256(args.input.read_bytes()).hexdigest()
    assert (
        source_hash
        == "52dff3dd1f96d7c7958f48a0a06013e2a0b1bb8f515183dabeed499fd584c851"
    ), "Approved model changed; anatomy/weights require review"
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS
    bpy.ops.import_scene.gltf(filepath=str(args.input))
    mesh = next(o for o in bpy.context.scene.objects if o.type == "MESH")
    mesh.parent = None
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.select_all(action="DESELECT")
    mesh.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for obj in list(bpy.context.scene.objects):
        if obj != mesh:
            bpy.data.objects.remove(obj, do_unlink=True)
    arm = rig(mesh)
    metadata = make_actions()
    # Neutral binding, no animation evaluated during export.
    arm.animation_data.action = None
    for p in arm.pose.bones:
        p.matrix_basis.identity()
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action="DESELECT")
    mesh.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(
        filepath=str(args.output / "minimorph_animated_v1.glb"),
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_nla_strips=True,
        export_skins=True,
        export_all_influences=False,
        export_morph=False,
        export_tangents=True,
        export_force_sampling=True,
        export_frame_range=False,
    )
    if args.save_source:
        args.save_source.parent.mkdir(parents=True, exist_ok=True)
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=str(args.save_source), compress=True)
    report = {
        "source_sha256": source_hash,
        "blender": bpy.app.version_string,
        "bones": list(BONES),
        "clips": metadata,
        "in_place": True,
        "run_reference_speed_units_per_second": 0.8,
        "status": "experimental, requires human deformation review",
        "weights": "Conservative anatomical rigid masks with smooth bands at elbows/knees/ankles/abdomen. No automatic heat weights. No semantic armor retopology.",
        "limitations": [
            "Unified mesh has no semantic joint loops; masks require artist weight-paint refinement.",
            "No independent head turns: avoids stressing shared neck/helmet boundary.",
            "No production gameplay integration or production-ready claim.",
        ],
    }
    (args.output / "animation-metadata.json").write_text(
        json.dumps(report, indent=2) + "\n"
    )
    if args.renders:
        camera = stage(32)
        camera.data.ortho_scale = 2.4
        camera.location = (2.5, 4, 1.15)
        camera.rotation_euler = (
            (Vector((0, 0, 0.9)) - camera.location).to_track_quat("-Z", "Y").to_euler()
        )
        # Capture evaluated skeletal geometry and measure helmet rigidity/ground placement.
        import numpy as np

        original = np.array([tuple(v.co) for v in mesh.data.vertices])
        head_indices = np.flatnonzero(original[:, 2] >= 0.99)
        mesh.data.calc_loop_triangles()
        triangles = np.array([tuple(t.vertices) for t in mesh.data.loop_triangles])
        edges = triangles[:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2)
        rest_lengths = np.linalg.norm(
            original[edges[:, 0]] - original[edges[:, 1]], axis=1
        )
        valid = rest_lengths > 1e-4
        rows = []
        for name, t, label in [
            ("Idle", 0, "idle-neutral"),
            ("Run", 0, "run-left"),
            ("Run", 0.5, "run-right"),
            ("Jump", 0.8, "jump"),
            ("Fall", 0.3, "fall"),
            ("Land", 0.35, "land"),
            ("Victory", 0.5, "victory"),
        ]:
            pose(name, t)
            evaluated = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
            data = evaluated.to_mesh()
            coords = [v.co for v in data.vertices]
            rows.append(
                {
                    "pose": label,
                    "minimum_z": min(v.z for v in coords),
                    "maximum_z": max(v.z for v in coords),
                }
            )
            deformed = np.array([tuple(v.co) for v in data.vertices])
            ratios = (
                np.linalg.norm(deformed[edges[:, 0]] - deformed[edges[:, 1]], axis=1)[
                    valid
                ]
                / rest_lengths[valid]
            )
            matrix = (
                ARM.pose.bones["Head"].matrix
                @ ARM.data.bones["Head"].matrix_local.inverted()
            )
            expected = np.array(
                [tuple(matrix @ Vector(v)) for v in original[head_indices]]
            )
            rows[-1]["head_rigid_max_error"] = float(
                np.max(np.linalg.norm(deformed[head_indices] - expected, axis=1))
            )
            rows[-1]["sampled_edge_stretch_max"] = float(ratios.max())
            rows[-1]["sampled_edge_compression_min"] = float(ratios.min())
            rows[-1]["ground_clearance_pass"] = rows[-1]["minimum_z"] >= -0.01
            evaluated.to_mesh_clear()
            bpy.context.scene.render.filepath = str(args.output / (label + ".png"))
            bpy.ops.render.render(write_still=True)
        (args.output / "deformation.json").write_text(json.dumps(rows, indent=2) + "\n")
    print("RIG_EXPORT_COMPLETE", args.output)


if __name__ == "__main__":
    main()
