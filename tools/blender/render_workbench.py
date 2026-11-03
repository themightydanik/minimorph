"""Render existing authored actions without calling the animation generator."""

import argparse, sys
from pathlib import Path
import bpy
from mathutils import Vector

p = argparse.ArgumentParser(description=__doc__)
p.add_argument("--project", type=Path, required=True)
p.add_argument("--output", type=Path, required=True)
a = p.parse_args(sys.argv[sys.argv.index("--") + 1 :])
bpy.ops.wm.open_mainfile(filepath=str(a.project.resolve()))
rig = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
for track in rig.animation_data.nla_tracks:
    track.mute = True
camera = bpy.context.scene.camera
camera.location = (2.5, 4, 1.15)
camera.rotation_euler = (
    (Vector((0, 0, 0.9)) - camera.location).to_track_quat("-Z", "Y").to_euler()
)
camera.data.ortho_scale = 2.4
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 32
scene.render.resolution_x = 512
scene.render.resolution_y = 640
scene.render.resolution_percentage = 100
# Actual seconds selected from the full-frame worst-edge diagnostics. No pose regeneration.
for name, t, label in [
    ("Idle", 0, "idle-neutral"),
    ("Run", 0.4, "run-left"),
    ("Run", 4 / 15, "run-right"),
    ("Jump", 0.4, "jump"),
    ("Fall", 0, "fall"),
    ("Land", 1 / 6, "land"),
    ("Victory", 1, "victory"),
]:
    rig.animation_data.action = bpy.data.actions[name]
    scene.frame_set(int(t * scene.render.fps), subframe=t * scene.render.fps % 1)
    bpy.context.view_layer.update()
    scene.render.filepath = str(a.output.resolve() / (label + ".png"))
    bpy.ops.render.render(write_still=True)
