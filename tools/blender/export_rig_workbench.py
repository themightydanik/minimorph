"""Export an artist-edited workbench without regenerating or overwriting its weights."""

import argparse, sys
from pathlib import Path
import bpy

p = argparse.ArgumentParser(description=__doc__)
p.add_argument("--project", type=Path, required=True)
p.add_argument("--output", type=Path, required=True)
a = p.parse_args(sys.argv[sys.argv.index("--") + 1 :])
bpy.ops.wm.open_mainfile(filepath=str(a.project.resolve()))
rig = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
if rig.animation_data:
    rig.animation_data.action = None
    for track in rig.animation_data.nla_tracks:
        track.mute = True
for bone in rig.pose.bones:
    bone.matrix_basis.identity()
bpy.context.view_layer.update()
bpy.ops.object.select_all(action="DESELECT")
rig.select_set(True)
for obj in bpy.context.scene.objects:
    if obj.type == "MESH" and (
        obj.parent == rig
        or any(m.type == "ARMATURE" and m.object == rig for m in obj.modifiers)
    ):
        obj.select_set(True)
bpy.context.view_layer.objects.active = rig
a.output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=str(a.output),
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
print("Exported artist weights/actions without rebuilding:", a.output)
