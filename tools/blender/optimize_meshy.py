"""Optimize the official Meshy mesh; never construct a replacement character.

Blender 4.3.2 background mode. Source files stay untouched outside the repo.
"""

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys
import bpy
import bmesh
import numpy as np
from mathutils import Vector, Matrix

sys.path.insert(0, str(Path(__file__).parent))
from download_meshy import verify


def image_pixels(image):
    values = np.empty(image.size[0] * image.size[1] * 4, dtype=np.float32)
    image.pixels.foreach_get(values)
    return values.reshape(image.size[1], image.size[0], 4)


def material_from_source(folder, output):
    mat = next(m for m in bpy.data.materials if m.use_nodes)
    old = {
        node.image.name: node.image
        for node in mat.node_tree.nodes
        if node.type == "TEX_IMAGE"
    }
    images = {}
    for key, filename, color in [
        ("base", "texture_0.png", "sRGB"),
        ("normal", "texture_0_normal.png", "Non-Color"),
        ("roughness", "texture_0_roughness.png", "Non-Color"),
        ("metallic", "texture_0_metallic.png", "Non-Color"),
    ]:
        image = bpy.data.images.load(str(folder / filename), check_existing=False)
        image.colorspace_settings.name = color
        images[key] = image
    # Read sRGB maps in their stored space to compare their pixels to embedded JPEGs.
    old["Image_0"].colorspace_settings.name = "Non-Color"
    images["base"].colorspace_settings.name = "Non-Color"
    metrics = {}
    pairs = [
        ("base", old["Image_0"], images["base"], slice(0, 3), slice(0, 3)),
        ("normal", old["Image_2"], images["normal"], slice(0, 3), slice(0, 3)),
        ("roughness", old["Image_1"], images["roughness"], 1, 0),
        ("metallic", old["Image_1"], images["metallic"], 2, 0),
    ]
    for name, a, b, ca, cb in pairs:
        diff = np.abs(image_pixels(a)[:, :, ca] - image_pixels(b)[:, :, cb])
        metrics[name] = {
            "mean_absolute_difference_0_1": float(diff.mean()),
            "max_absolute_difference_0_1": float(diff.max()),
        }
    old["Image_0"].colorspace_settings.name = "sRGB"
    images["base"].colorspace_settings.name = "sRGB"
    # glTF uses roughness in G and metallic in B; preserve supplied scalar values.
    packed = bpy.data.images.new("Meshy_metallic_roughness", 2048, 2048, alpha=False)
    packed.colorspace_settings.name = "Non-Color"
    pixels = np.ones((2048, 2048, 4), dtype=np.float32)
    pixels[:, :, 1] = image_pixels(images["roughness"])[:, :, 0]
    pixels[:, :, 2] = image_pixels(images["metallic"])[:, :, 0]
    packed.pixels.foreach_set(pixels.ravel())
    packed.filepath_raw = str(output / "metallic-roughness.png")
    packed.file_format = "PNG"
    packed.save()
    packed.pack()
    mat.name = "Meshy_PBR"
    tree = mat.node_tree
    tree.nodes.clear()
    shader = tree.nodes.new("ShaderNodeBsdfPrincipled")
    destination = tree.nodes.new("ShaderNodeOutputMaterial")
    tree.links.new(shader.outputs["BSDF"], destination.inputs["Surface"])

    def texture(image):
        node = tree.nodes.new("ShaderNodeTexImage")
        node.image = image
        return node

    tree.links.new(
        texture(images["base"]).outputs["Color"], shader.inputs["Base Color"]
    )
    normal = tree.nodes.new("ShaderNodeNormalMap")
    tree.links.new(texture(images["normal"]).outputs["Color"], normal.inputs["Color"])
    tree.links.new(normal.outputs["Normal"], shader.inputs["Normal"])
    separate = tree.nodes.new("ShaderNodeSeparateColor")
    separate.mode = "RGB"
    tree.links.new(texture(packed).outputs["Color"], separate.inputs["Color"])
    tree.links.new(separate.outputs["Green"], shader.inputs["Roughness"])
    tree.links.new(separate.outputs["Blue"], shader.inputs["Metallic"])
    # Source is opaque and double-sided, with no emissive channel. Preserve that.
    mat.use_backface_culling = False
    for image in [images["base"], images["normal"], packed]:
        image.pack()
    return metrics


def topology(obj):
    mesh = obj.data
    mesh.calc_loop_triangles()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    boundary = sum(e.is_boundary for e in bm.edges)
    nonmanifold = sum(not e.is_manifold for e in bm.edges)
    # Components are topological islands, not semantic body parts or a rig.
    bm.verts.ensure_lookup_table()
    seen = set()
    components = []
    for vert in bm.verts:
        if vert.index in seen:
            continue
        todo = [vert]
        seen.add(vert.index)
        size = 0
        while todo:
            current = todo.pop()
            size += 1
            for edge in current.link_edges:
                other = edge.other_vert(current)
                if other.index not in seen:
                    seen.add(other.index)
                    todo.append(other)
        components.append(size)
    result = {
        "vertices": len(mesh.vertices),
        "triangles": len(mesh.loop_triangles),
        "uv_layers": [u.name for u in mesh.uv_layers],
        "boundary_edges": boundary,
        "nonmanifold_edges": nonmanifold,
        "components": len(components),
        "largest_components_vertices": sorted(components, reverse=True)[:12],
        "zero_area_triangles": sum(t.area < 1e-12 for t in mesh.loop_triangles),
    }
    bm.free()
    return result


def normalize(obj):
    # Source faces glTF +Z (Blender -Y); rotate to game-local -Z (Blender +Y).
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    obj.parent = None
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    rotation = Matrix.Rotation(math.pi, 4, "Z")
    for v in obj.data.vertices:
        v.co = rotation @ v.co
    low = Vector(tuple(min(v.co[i] for v in obj.data.vertices) for i in range(3)))
    high = Vector(tuple(max(v.co[i] for v in obj.data.vertices) for i in range(3)))
    center = Vector(((low.x + high.x) / 2, (low.y + high.y) / 2, low.z))
    scale = 1.8 / (high.z - low.z)
    for v in obj.data.vertices:
        v.co = (v.co - center) * scale
    obj.data.update()
    return {
        "source_blender_min": list(low),
        "source_blender_max": list(high),
        "uniform_scale": scale,
        "rotation_degrees_about_up": 180,
        "target_height": 1.8,
    }


def stage(samples):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 4
    scene.render.resolution_x = 640
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.world = bpy.data.worlds.new("Meshy comparison studio")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs[0].default_value = (
        0.08,
        0.10,
        0.14,
        1,
    )
    scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.5
    for name, location, energy, size, color in [
        ("Key", (-3, 4, 5), 430, 4, (1, 0.95, 0.9)),
        ("Fill", (3, 2, 3), 300, 3, (0.75, 0.86, 1)),
        ("Rim", (0, -3, 4), 500, 3, (0.75, 0.86, 1)),
    ]:
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.size = size
        light.data.color = color
        light.rotation_euler = (
            (Vector((0, 0, 1)) - light.location).to_track_quat("-Z", "Y").to_euler()
        )
    bpy.ops.object.camera_add()
    camera = bpy.context.object
    camera.data.type = "ORTHO"
    scene.camera = camera
    return camera


def renders(folder, camera):
    folder.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    views = {
        "front": (0, 4, 1.1),
        "three-quarter": (2.7, 4, 1.15),
        "side": (4, 0, 1.1),
        "back": (0, -4, 1.1),
        "face-front": (0, 4, 1.43),
        "face-three-quarter": (2.7, 4, 1.43),
    }
    for name, position in views.items():
        close = name.startswith("face")
        target = Vector((0, 0, 1.4 if close else 0.9))
        camera.data.ortho_scale = 1.04 if close else 2.16
        camera.location = position
        camera.rotation_euler = (
            (target - camera.location).to_track_quat("-Z", "Y").to_euler()
        )
        scene.render.filepath = str(folder / (name + ".png"))
        bpy.ops.render.render(write_still=True)


def bake_source_normals(obj, reference, output):
    """Reproject original detail into the reduced mesh tangent basis."""
    original_material = obj.data.materials[0]
    original_material.name = "Meshy_source_PBR"
    material = original_material.copy()
    material.name = "Meshy_PBR"
    obj.data.materials[0] = material
    image = bpy.data.images.new("Meshy_reprojected_normal", 2048, 2048, alpha=False)
    image.colorspace_settings.name = "Non-Color"
    image.generated_color = (0.5, 0.5, 1.0, 1.0)
    node = material.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = image
    material.node_tree.nodes.active = node
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 1
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 4
    scene.render.bake.use_selected_to_active = True
    scene.render.bake.cage_extrusion = 0.02
    scene.render.bake.max_ray_distance = 0.04
    scene.render.bake.normal_space = "TANGENT"
    scene.render.bake.margin = 8
    scene.render.bake.use_clear = False
    bpy.ops.object.select_all(action="DESELECT")
    reference.hide_render = False
    reference.select_set(True)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.bake(type="NORMAL")
    image.filepath_raw = str(output / "reprojected-normal.png")
    image.file_format = "PNG"
    image.save()
    image.pack()
    normal_node = next(n for n in material.node_tree.nodes if n.type == "NORMAL_MAP")
    texture_node = material.node_tree.nodes.new("ShaderNodeTexImage")
    texture_node.image = image
    material.node_tree.links.new(
        texture_node.outputs["Color"], normal_node.inputs["Color"]
    )
    reference.hide_render = True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--triangles", type=int, default=40000)
    parser.add_argument("--preserve-seams", action="store_true")
    parser.add_argument("--bake-normals", action="store_true")
    parser.add_argument("--renders", action="store_true")
    parser.add_argument("--source-renders", action="store_true")
    parser.add_argument("--samples", type=int, default=48)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1 :])
    verify(args.source)
    args.output.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.source / "meshy-model.glb"))
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    assert len(meshes) == 1, "Source structure changed; review required"
    obj = meshes[0]
    before = topology(obj)
    transforms = normalize(obj)
    metrics = material_from_source(args.source, args.output)
    if args.source_renders:
        camera = stage(args.samples)
        renders(args.output / "renders/source", camera)
    # UV seams in the imported GLB duplicate positions. Weld only coincident
    # positions on the runtime copy, retaining per-loop UVs; otherwise independent
    # island collapse opens visible seams and damages silver highlights.
    reference = obj.copy()
    reference.data = obj.data.copy()
    bpy.context.scene.collection.objects.link(reference)
    reference.name = "Original_normal_reference"
    reference.hide_render = True
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    seam_positions = {
        tuple(v.co) for edge in bm.edges if edge.is_boundary for v in edge.verts
    }
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-7)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    welded = topology(obj)
    obj.data.calc_loop_triangles()
    count = len(obj.data.loop_triangles)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    mod = obj.modifiers.new("Meshy UV-preserving collapse", "DECIMATE")
    mod.ratio = min(1, args.triangles / count)
    mod.use_collapse_triangulate = True
    if args.preserve_seams:
        group = obj.vertex_groups.new(name="Preserve source UV seam positions")
        group.add(
            [v.index for v in obj.data.vertices if tuple(v.co) in seam_positions],
            1.0,
            "REPLACE",
        )
        mod.vertex_group = group.name
        mod.vertex_group_factor = 1.0
        mod.invert_vertex_group = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
    # Retain high-resolution shading rather than deriving lumpy low-poly normals.
    transfer = obj.modifiers.new("Preserve Meshy surface normals", "DATA_TRANSFER")
    transfer.object = reference
    transfer.use_loop_data = True
    transfer.data_types_loops = {"CUSTOM_NORMAL"}
    transfer.loop_mapping = "POLYINTERP_NEAREST"
    bpy.ops.object.modifier_apply(modifier=transfer.name)
    if args.bake_normals:
        bake_source_normals(obj, reference, args.output)
    bpy.data.objects.remove(reference, do_unlink=True)
    after = topology(obj)
    assert (
        after["triangles"] <= args.triangles * 1.01
    ), "Reduction stalled above requested target; review seam constraints before exporting"
    # Scale after reduction can shift ground bounds slightly; ground precisely without reshaping.
    low = min(v.co.z for v in obj.data.vertices)
    high = max(v.co.z for v in obj.data.vertices)
    scale = 1.8 / (high - low)
    for v in obj.data.vertices:
        v.co.z -= low
        v.co *= scale
    obj.data.update()
    obj.name = "Minimorph_Meshy"
    obj.data.name = "Meshy_optimized_mesh"
    root = bpy.data.objects.new("Minimorph_v1", None)
    bpy.context.scene.collection.objects.link(root)
    obj.parent = root
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    root.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(args.output / "minimorph_v1.glb"),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_image_format="AUTO",
        export_tangents=True,
    )
    report = {
        "blender": bpy.app.version_string,
        "source_sha256": hashlib.sha256(
            (args.source / "meshy-model.glb").read_bytes()
        ).hexdigest(),
        "requested_triangles": args.triangles,
        "preserve_seams": args.preserve_seams,
        "normal_reprojection": args.bake_normals,
        "source": before,
        "welded_before_collapse": welded,
        "weld_distance": 1e-7,
        "normal_transfer": "Nearest source polygon interpolated corner normals",
        "optimized_blender": after,
        "normalization": transforms,
        "embedded_vs_external_texture_difference": metrics,
        "materials": "Supplied base PNG; supplied tangent normals reprojected to low mesh when normal_reprojection is true; external roughness G and metallic B packed losslessly. No emission added. Opaque, double-sided as source.",
        "rigging": "Single textured mesh, no skeleton; semantic joints/parts are not separated. Requires manual segmentation, retopology/weights and deformation tests; not rig-ready.",
    }
    (args.output / "optimization.json").write_text(json.dumps(report, indent=2) + "\n")
    if args.renders:
        # Show the actual exported/reimported GLB, not an unexported modifier result.
        for item in list(bpy.context.scene.objects):
            bpy.data.objects.remove(item, do_unlink=True)
        bpy.ops.import_scene.gltf(filepath=str(args.output / "minimorph_v1.glb"))
        camera = stage(args.samples)
        renders(args.output / "renders", camera)
    print("MESHY_OPTIMIZATION_COMPLETE", args.output)


if __name__ == "__main__":
    main()
