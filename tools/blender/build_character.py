"""Build the approved orange-kitten Minimorph reference as an editable static model.

blender --background --factory-startup --python-exit-code 1 \
  --python tools/blender/build_character.py -- --renders
No rig/animation or external texture dependencies. Blender 4.3.2 reference runtime.
"""

import argparse
import json
import math
from pathlib import Path
import sys

import bpy
import bmesh
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[2]
TAU = math.tau
MODEL = None
PARTS = []
MATERIALS = {}


def rgb(hex_value):
    values = [int(hex_value[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(
        v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in values
    )


def material(name, color, metallic=0, roughness=0.45, emission=0, vertex=False):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    shader = result.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*rgb(color), 1)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    if emission:
        shader.inputs["Emission Color"].default_value = (*rgb(color), 1)
        shader.inputs["Emission Strength"].default_value = emission
    if vertex:
        colors = result.node_tree.nodes.new("ShaderNodeVertexColor")
        colors.layer_name = "FurColor"
        result.node_tree.links.new(colors.outputs["Color"], shader.inputs["Base Color"])
    MATERIALS[name] = result
    return result


def register(obj, name, mat):
    obj.name = name
    obj.parent = MODEL
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    PARTS.append(obj)
    return obj


def smooth(obj):
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def sphere(name, center, radii, mat, segments=16, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments, ring_count=rings, location=center
    )
    obj = bpy.context.object
    obj.scale = radii
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return smooth(register(obj, name, mat))


def mesh_object(name, vertices, faces, mat):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    return register(obj, name, mat)


def apply_modifier(obj, modifier):
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def bevel(obj, amount=0.012, segments=2):
    mod = obj.modifiers.new("Machined soft edges", "BEVEL")
    mod.width = amount
    mod.segments = segments
    apply_modifier(obj, mod)
    return obj


def fur_colors(obj, color=None, face=False, ear=False):
    attribute = obj.data.color_attributes.new(
        name="FurColor", type="BYTE_COLOR", domain="CORNER"
    )
    for polygon in obj.data.polygons:
        for index in polygon.loop_indices:
            vertex = (
                obj.matrix_world
                @ obj.data.vertices[obj.data.loops[index].vertex_index].co
            )
            x, y, z = vertex
            chosen = color or "D99448"
            if face:
                # Vertex-painted tabby markings: forehead M, side stripes, cream muzzle.
                cream = (
                    max(0, min(1, (1.245 - z) / 0.09))
                    * max(0, min(1, (y - 0.15) / 0.12))
                    * max(0, min(1, (0.28 - abs(x)) / 0.14))
                )
                base = rgb("E69435")
                pale = rgb("F7D5A3")
                dark = rgb("9D4B1C")
                distance = abs(abs(x) - (0.025 + (1.62 - z) * 0.40))
                stripe = (
                    max(0, 1 - distance / 0.035) if 1.43 < z < 1.65 and y > 0.09 else 0
                )
                if abs(x) > 0.28 and 1.2 < z < 1.44 and y > 0.04:
                    stripe = max(
                        stripe, max(0, math.cos(z * 90 + abs(x) * 8)) ** 8 * 0.6
                    )
                variation = 1.0
                value = tuple(
                    (base[i] * (1 - cream) + pale[i] * cream) * (1 - stripe * 0.82)
                    + dark[i] * stripe * 0.82
                    for i in range(3)
                )
                value = tuple(v * variation for v in value)
            elif ear:
                value = rgb("A85530" if y > 0.055 else "DD8D39")
            else:
                value = rgb(chosen)
            attribute.data[index].color = (*value, 1)


def panel(name, outline, front, depth, mat, edge=0.012):
    count = len(outline)
    vertices = [(x, front, z) for x, z in outline] + [
        (x, front - depth, z) for x, z in outline
    ]
    faces = [tuple(range(count - 1, -1, -1)), tuple(range(count, count * 2))]
    faces += [
        (i, (i + 1) % count, (i + 1) % count + count, i + count) for i in range(count)
    ]
    obj = bevel(mesh_object(name, vertices, faces, mat), edge)
    # Consistent normals for arbitrary mirrored outlines.
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    return obj


def tube(name, points, radius, mat):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 1
    curve.bevel_depth = radius
    curve.bevel_resolution = 1
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, coordinate in zip(spline.points, points):
        point.co = (*coordinate, 1)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    return smooth(register(bpy.context.object, name, mat))


def oval_ring(name, a, b, y, z, radius, mat, segments=48, sides=6):
    vertices = []
    for i in range(segments):
        angle = TAU * i / segments
        for j in range(sides):
            cross = TAU * j / sides
            vertices.append(
                (
                    (a + radius * math.cos(cross)) * math.cos(angle),
                    y + radius * math.sin(cross),
                    z + (b + radius * math.cos(cross)) * math.sin(angle),
                )
            )
    faces = [
        (
            i * sides + j,
            ((i + 1) % segments) * sides + j,
            ((i + 1) % segments) * sides + (j + 1) % sides,
            i * sides + (j + 1) % sides,
        )
        for i in range(segments)
        for j in range(sides)
    ]
    return smooth(mesh_object(name, vertices, faces, mat))


def cylinder_between(name, start, end, radius_a, radius_b, mat, vertices=16):
    vector = Vector(end) - Vector(start)
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius_a,
        radius2=radius_b,
        depth=vector.length,
        location=(Vector(start) + Vector(end)) / 2,
    )
    obj = bpy.context.object
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = vector.to_track_quat("Z", "Y")
    register(obj, name, mat)
    bevel(obj, min(0.013, vector.length / 7), segments=1)
    return smooth(obj)


def ear(side, fur):
    triangle = [
        Vector((side * 0.26, 1.565)),
        Vector((side * 0.465, 1.845)),
        Vector((side * 0.54, 1.565)),
    ]
    outline = []
    for i, vertex in enumerate(triangle):
        start = vertex.lerp(triangle[(i - 1) % 3], 0.15)
        end = vertex.lerp(triangle[(i + 1) % 3], 0.15)
        for j in range(6):
            t = j / 6
            outline.append(
                start * (1 - t) ** 2 + vertex * 2 * (1 - t) * t + end * t * t
            )
    count = len(outline)
    center = sum(outline, Vector((0, 0))) / count
    vertices = [(v.x, 0.015, v.y) for v in outline] + [
        (center.x, 0.12, center.y),
        (center.x, -0.065, center.y),
    ]
    faces = [(i, (i + 1) % count, count) for i in range(count)] + [
        ((i + 1) % count, i, count + 1) for i in range(count)
    ]
    obj = smooth(
        mesh_object(
            ("Left" if side < 0 else "Right") + " kitten ear", vertices, faces, fur
        )
    )
    mod = obj.modifiers.new("Rounded ear surface", "SUBSURF")
    mod.levels = 1
    apply_modifier(obj, mod)
    fur_colors(obj, ear=True)


def build():
    global MODEL
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.object.empty_add()
    MODEL = bpy.context.object
    MODEL.name = "Minimorph_Source"
    silver = material("Silver_PBR", "DDE4EB", 0.55, 0.32)
    dark = material("Armor_Dark", "3A4048", 0.3, 0.42)
    cyan = material("Cyan_Illumination", "00D8FF", 0.15, 0.25, 2.2)
    fur = material("Kitten_VertexFur", "FFFFFF", 0, 0.8, vertex=True)
    iris = material("Blue_Iris", "239AC2", 0.08, 0.17)
    pupil = material("Pupil_And_Gasket", "081B2B", 0.05, 0.2)
    white = material("Eye_Catchlight", "FFFFFF", 0, 0.18, 0.12)
    nose = material("Nose_And_Mouth", "9C4E33", 0, 0.45)

    # Continuous sculpt-like facial surface, not floating cheek primitives.
    head = sphere("Kitten face", (0, 0.045, 1.31), (0.395, 0.265, 0.34), fur, 40, 24)
    cheeks = [
        sphere("Muzzle cheek", (side * 0.075, 0.285, 1.175), (0.12, 0.075, 0.078), fur)
        for side in [-1, 1]
    ]
    cheeks.append(sphere("Soft chin", (0, 0.263, 1.115), (0.126, 0.056, 0.05), fur))
    bpy.ops.object.select_all(action="DESELECT")
    for obj in [head] + cheeks:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = head
    bpy.ops.object.join()
    for obj in cheeks:
        PARTS.remove(obj)
    mod = head.modifiers.new("Joined muzzle sculpt", "REMESH")
    mod.mode = "VOXEL"
    mod.voxel_size = 0.016
    mod.use_smooth_shade = True
    apply_modifier(head, mod)
    mod = head.modifiers.new("Soft facial transitions", "SMOOTH")
    mod.factor = 0.75
    mod.iterations = 3
    apply_modifier(head, mod)
    mod = head.modifiers.new("Mobile facial topology", "DECIMATE")
    mod.ratio = 0.18
    apply_modifier(head, mod)
    smooth(head)
    fur_colors(head, face=True)
    for side in [-1, 1]:
        ear(side, fur)
        lid = sphere(
            "Cream eyelid surround",
            (side * 0.163, 0.264, 1.362),
            (0.123, 0.026, 0.139),
            fur,
            20,
            10,
        )
        fur_colors(lid, "BE792F")
        sphere(
            "Dark eyelid",
            (side * 0.163, 0.28, 1.362),
            (0.111, 0.026, 0.125),
            pupil,
            24,
            12,
        )
        sphere(
            "Blue eye iris",
            (side * 0.163, 0.30, 1.362),
            (0.094, 0.018, 0.109),
            iris,
            24,
            12,
        )
        sphere(
            "Large glossy pupil",
            (side * 0.163, 0.316, 1.37),
            (0.079, 0.01, 0.094),
            pupil,
            20,
            10,
        )
        sphere(
            "Primary eye reflection",
            (side * 0.163 - 0.026, 0.327, 1.414),
            (0.025, 0.007, 0.026),
            white,
            12,
            8,
        )
        sphere(
            "Secondary eye reflection",
            (side * 0.163 + 0.029, 0.327, 1.335),
            (0.01, 0.004, 0.01),
            white,
            10,
            6,
        )
    # A softened triangular nose and short expressive split muzzle line.
    nose_obj = panel(
        "Kitten nose",
        [(-0.036, 1.23), (0.036, 1.23), (0, 1.194)],
        0.373,
        0.033,
        nose,
        0.012,
    )
    smooth(nose_obj)
    tube("Muzzle center line", [(0, 0.365, 1.198), (0, 0.365, 1.176)], 0.0035, nose)
    for side in [-1, 1]:
        tube(
            "Muzzle smile",
            [
                (0, 0.365, 1.176),
                (side * 0.021, 0.361, 1.165),
                (side * 0.05, 0.351, 1.17),
            ],
            0.003,
            nose,
        )

    for side in [-1, 1]:
        for offset in [-0.025, 0, 0.025]:
            tube(
                "Fine attached whisker",
                [
                    (side * 0.15, 0.34, 1.175 + offset * 0.4),
                    (side * 0.22, 0.345, 1.175 + offset),
                    (side * 0.29, 0.326, 1.18 + offset * 1.3),
                ],
                0.0012,
                white,
            )

    # Genuine open helmet shell with a solid inner rim; no transparent full sphere.
    theta_open, segments, rings = 1.0, 48, 12

    def helmet_point(theta, angle, lift=0):
        return (
            (0.50 + lift) * math.sin(theta) * math.cos(angle),
            (0.43 + lift) * math.cos(theta),
            1.31 + (0.41 + lift) * math.sin(theta) * math.sin(angle),
        )

    vertices = [
        helmet_point(
            theta_open + (math.pi - theta_open) * j / rings, TAU * i / segments
        )
        for j in range(rings)
        for i in range(segments)
    ]
    vertices.append((0, -0.43, 1.31))
    pole = len(vertices) - 1
    faces = [
        (
            j * segments + i,
            j * segments + (i + 1) % segments,
            (j + 1) * segments + (i + 1) % segments,
            (j + 1) * segments + i,
        )
        for j in range(rings - 1)
        for i in range(segments)
    ]
    faces += [
        ((rings - 1) * segments + i, (rings - 1) * segments + (i + 1) % segments, pole)
        for i in range(segments)
    ]
    helmet = smooth(mesh_object("Silver open helmet shell", vertices, faces, silver))
    mod = helmet.modifiers.new("Helmet wall thickness", "SOLIDIFY")
    mod.thickness = 0.015
    apply_modifier(helmet, mod)
    oval_ring("Outer silver face frame", 0.433, 0.357, 0.24, 1.31, 0.019, silver)
    oval_ring("Visor dark seal", 0.414, 0.344, 0.261, 1.31, 0.018, pupil)
    oval_ring("Continuous cyan visor rim", 0.407, 0.337, 0.28, 1.31, 0.009, cyan)
    for angle in [0.9, 2.24, 4.18, 5.25]:
        tube(
            "Helmet panel seam",
            [helmet_point(theta_open + j / 24 * 1.92, angle, 0.003) for j in range(25)],
            0.0035,
            dark,
        )
    tube(
        "Rear helmet panel seam",
        [helmet_point(2.18, TAU * i / 48, 0.003) for i in range(49)],
        0.0035,
        dark,
    )
    for side in [-1, 1]:
        cylinder_between(
            "Comms outer gasket",
            (side * 0.477, -0.005, 1.295),
            (side * 0.509, -0.005, 1.295),
            0.123,
            0.123,
            pupil,
            28,
        )
        cylinder_between(
            "Silver comms housing",
            (side * 0.51, -0.005, 1.295),
            (side * 0.535, -0.005, 1.295),
            0.107,
            0.107,
            silver,
            28,
        )
        cylinder_between(
            "Comms cyan ring",
            (side * 0.536, -0.005, 1.295),
            (side * 0.54, -0.005, 1.295),
            0.084,
            0.084,
            cyan,
            24,
        )
        cylinder_between(
            "Comms inset face",
            (side * 0.541, -0.005, 1.295),
            (side * 0.548, -0.005, 1.295),
            0.072,
            0.072,
            silver,
            24,
        )

    cylinder_between(
        "Sealed neck collar", (0, -0.01, 0.84), (0, -0.01, 0.96), 0.166, 0.19, dark, 32
    )
    torso = sphere(
        "Flexible body under armor",
        (0, -0.015, 0.695),
        (0.225, 0.147, 0.245),
        fur,
        20,
        10,
    )
    fur_colors(torso, "C18A50")
    # Armor is supported by the continuous undersuit; front and back are finished.
    panel(
        "Chest armor",
        [
            (-0.225, 0.92),
            (0.225, 0.92),
            (0.20, 0.7),
            (0.125, 0.6),
            (-0.125, 0.6),
            (-0.20, 0.7),
        ],
        0.15,
        0.19,
        silver,
        0.026,
    )
    panel(
        "Chest dark inset",
        [
            (-0.125, 0.895),
            (0.125, 0.895),
            (0.145, 0.7),
            (0.08, 0.655),
            (-0.08, 0.655),
            (-0.145, 0.7),
        ],
        0.181,
        0.035,
        dark,
        0.018,
    )
    panel(
        "Chest core bezel",
        [(-0.082, 0.85), (0.082, 0.85), (0.082, 0.71), (-0.082, 0.71)],
        0.208,
        0.025,
        silver,
    )
    panel(
        "Illuminated chest core",
        [(-0.058, 0.828), (0.058, 0.828), (0.058, 0.735), (-0.058, 0.735)],
        0.224,
        0.018,
        cyan,
        0.009,
    )
    tube(
        "Core M identity",
        [
            (-0.032, 0.237, 0.754),
            (-0.032, 0.237, 0.81),
            (0, 0.237, 0.775),
            (0.032, 0.237, 0.81),
            (0.032, 0.237, 0.754),
        ],
        0.005,
        white,
    )
    for side in [-1, 1]:
        tube(
            "Chest cyan circuit",
            [
                (side * 0.172, 0.184, 0.88),
                (side * 0.159, 0.19, 0.8),
                (side * 0.19, 0.185, 0.724),
                (side * 0.115, 0.193, 0.675),
            ],
            0.007,
            cyan,
        )
    panel(
        "Pelvis gasket",
        [
            (-0.17, 0.65),
            (0.17, 0.65),
            (0.185, 0.54),
            (0.11, 0.49),
            (-0.11, 0.49),
            (-0.185, 0.54),
        ],
        0.137,
        0.185,
        dark,
        0.02,
    )
    panel(
        "Belt lower silver plate",
        [(-0.12, 0.59), (0.12, 0.59), (0.095, 0.535), (-0.095, 0.535)],
        0.16,
        0.035,
        silver,
    )
    # Small integrated life-support unit follows the back contour, no floating pack.
    panel(
        "Back armor",
        [(-0.19, 0.9), (0.19, 0.9), (0.18, 0.65), (-0.18, 0.65)],
        -0.115,
        0.075,
        silver,
        0.025,
    )
    panel(
        "Life support housing",
        [(-0.125, 0.855), (0.125, 0.855), (0.125, 0.69), (-0.125, 0.69)],
        -0.18,
        0.055,
        dark,
        0.018,
    )
    panel(
        "Back status lamp",
        [(-0.044, 0.79), (0.044, 0.79), (0.044, 0.735), (-0.044, 0.735)],
        -0.236,
        -0.012,
        cyan,
        0.006,
    )
    for side in [-1, 1]:
        arm = cylinder_between(
            "Orange upper arm",
            (side * 0.25, 0, 0.88),
            (side * 0.325, 0.012, 0.705),
            0.077,
            0.066,
            fur,
        )
        fur_colors(arm, "D69B58")
        sphere(
            "Shoulder dark joint", (side * 0.263, 0, 0.88), (0.114, 0.116, 0.105), dark
        )
        panel(
            "Contoured shoulder pauldron",
            [
                (side * 0.215, 0.94),
                (side * 0.31, 0.975),
                (side * 0.395, 0.91),
                (side * 0.347, 0.82),
                (side * 0.27, 0.85),
            ],
            0.096,
            0.18,
            silver,
            0.025,
        )
        cylinder_between(
            "Elbow gasket",
            (side * 0.325, 0.01, 0.72),
            (side * 0.345, 0.022, 0.67),
            0.075,
            0.078,
            dark,
        )
        cylinder_between(
            "Silver forearm guard",
            (side * 0.333, 0.018, 0.7),
            (side * 0.375, 0.025, 0.555),
            0.102,
            0.087,
            silver,
        )
        tube(
            "Forearm light channel",
            [(side * 0.345, 0.121, 0.677), (side * 0.365, 0.119, 0.592)],
            0.009,
            cyan,
        )
        paw = sphere(
            "Rounded kitten hand",
            (side * 0.378, 0.029, 0.509),
            (0.075, 0.073, 0.077),
            fur,
        )
        fur_colors(paw, "E2A25E")
        thumb = sphere(
            "Attached thumb",
            (side * 0.323, 0.067, 0.524),
            (0.036, 0.045, 0.043),
            fur,
            16,
            8,
        )
        fur_colors(thumb, "E8AC69")
        x = side * 0.132
        cylinder_between(
            "Leg undersuit", (x, 0, 0.10), (x, 0, 0.53), 0.078, 0.083, dark
        )
        sphere(
            "Contoured thigh armor",
            (x, -0.005, 0.422),
            (0.11, 0.105, 0.116),
            silver,
            20,
            10,
        )
        sphere(
            "Knee articulated socket", (x, 0.077, 0.306), (0.097, 0.055, 0.086), dark
        )
        sphere(
            "Rounded silver kneecap", (x, 0.117, 0.31), (0.075, 0.039, 0.061), silver
        )
        cylinder_between(
            "Shin armor", (x, -0.005, 0.115), (x, -0.005, 0.26), 0.102, 0.09, silver
        )
        tube(
            "Shin seam",
            [
                (x - 0.075, 0.065, 0.145),
                (x - 0.07, 0.065, 0.21),
                (x, 0.088, 0.235),
                (x + 0.07, 0.065, 0.21),
            ],
            0.004,
            dark,
        )
        sphere("Boot heel armor", (x, -0.037, 0.097), (0.115, 0.104, 0.085), silver)
        paw = sphere(
            "Exposed rounded toe paw",
            (x, 0.087, 0.075),
            (0.112, 0.133, 0.075),
            fur,
            20,
            10,
        )
        fur_colors(paw, "E8AD6B")
        for offset in [-0.033, 0.033]:
            tube(
                "Toe crease",
                [
                    (x + offset, 0.209, 0.066),
                    (x + offset, 0.209, 0.095),
                    (x + offset, 0.197, 0.118),
                ],
                0.0025,
                nose,
            )

    # Repair coincident bevel/curve endpoints and triangulate before budgeting.
    for obj in PARTS:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-6)
        bmesh.ops.dissolve_degenerate(bm, edges=list(bm.edges), dist=1e-7)
        bmesh.ops.triangulate(bm, faces=list(bm.faces))
        invalid = [face for face in bm.faces if face.calc_area() < 1e-12]
        if invalid:
            bmesh.ops.delete(bm, geom=invalid, context="FACES")
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(obj.data)
        bm.free()
        obj.data.update()
    # Bake modifiers/transforms into editable geometry and normalize exact feet/height.
    for obj in PARTS:
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    low = min((obj.matrix_world @ v.co).z for obj in PARTS for v in obj.data.vertices)
    high = max((obj.matrix_world @ v.co).z for obj in PARTS for v in obj.data.vertices)
    factor = 1.8 / (high - low)
    for obj in PARTS:
        for vertex in obj.data.vertices:
            vertex.co.z -= low
            vertex.co *= factor
        obj.data.update()
    return MODEL


def export_asset(output):
    # Merge copies by material: eight draw primitives, while .blend keeps editable parts.
    export_collection = bpy.data.collections.new("EXPORT_ONLY")
    bpy.context.scene.collection.children.link(export_collection)
    root = bpy.data.objects.new("Minimorph_v1", None)
    export_collection.objects.link(root)
    objects = [root]
    for mat in MATERIALS.values():
        copies = []
        for obj in PARTS:
            if obj.data.materials[0] != mat:
                continue
            copy = obj.copy()
            copy.data = obj.data.copy()
            copy.parent = None
            export_collection.objects.link(copy)
            copies.append(copy)
        if not copies:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for copy in copies:
            copy.select_set(True)
        bpy.context.view_layer.objects.active = copies[0]
        bpy.ops.object.join()
        result = copies[0]
        result.name = "Mesh_" + mat.name
        # Keep the editable source intact; lightly simplify the runtime copy.
        mod = result.modifiers.new("Runtime mobile reduction", "DECIMATE")
        mod.ratio = 0.85
        mod.use_collapse_triangulate = True
        apply_modifier(result, mod)
        result.parent = root
        result.matrix_world = Matrix.Identity(4)
        objects.append(result)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(output / "minimorph_v1.glb"),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_vertex_color="MATERIAL",
        export_all_vertex_colors=False,
    )
    for obj in objects:
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(export_collection)


def stage():
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 128
    scene.cycles.use_denoising = False
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 4
    scene.render.resolution_x = 640
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.world = bpy.data.worlds.new("Studio World")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs[0].default_value = (
        0.055,
        0.08,
        0.115,
        1,
    )
    scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.45
    scene.view_settings.view_transform = "AgX"

    def light(name, position, energy, size, color):
        bpy.ops.object.light_add(type="AREA", location=position)
        obj = bpy.context.object
        obj.name = name
        obj.data.energy = energy
        obj.data.shape = "DISK"
        obj.data.size = size
        obj.data.color = color
        obj.rotation_euler = (
            (Vector((0, 0, 1)) - obj.location).to_track_quat("-Z", "Y").to_euler()
        )

    light("Warm key", (-3, 4, 5), 430, 4, (1, 0.87, 0.73))
    light("Cool fill", (3, 2, 3), 300, 3, (0.63, 0.83, 1))
    light("Silver rim", (0, -3, 4), 650, 3, (0.66, 0.86, 1))
    bpy.ops.mesh.primitive_plane_add(size=200)
    ground = bpy.context.object
    ground.name = "Studio floor — not exported"
    floor = bpy.data.materials.new("Studio floor")
    floor.diffuse_color = (0.008, 0.016, 0.025, 1)
    ground.data.materials.append(floor)
    bpy.ops.object.camera_add(location=(0, 4, 1.2))
    camera = bpy.context.object
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 2.24
    scene.camera = camera
    camera.rotation_euler = (
        (Vector((0, 0, 0.9)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    )
    return camera


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output", type=Path, default=ROOT / "assets/characters/minimorph"
    )
    parser.add_argument("--renders", action="store_true")
    args = parser.parse_args(
        sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    )
    args.output.mkdir(parents=True, exist_ok=True)
    build()
    export_asset(args.output)
    sys.path.insert(0, str(Path(__file__).parent))
    from inspect_character import inspect

    report = inspect(args.output / "minimorph_v1.glb")
    (args.output / "validation.json").write_text(json.dumps(report, indent=2) + "\n")
    camera = stage()
    bpy.data.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output / "minimorph_v1.blend"))
    if args.renders:
        # Verify the exact optimized export in beauty renders, not a denser source.
        for obj in PARTS:
            obj.hide_render = True
        bpy.ops.import_scene.gltf(
            filepath=str((args.output / "minimorph_v1.glb").resolve())
        )
        folder = args.output / "renders"
        folder.mkdir(exist_ok=True)
        for name, position in [
            ("front", (0, 4, 1.22)),
            ("three-quarter", (3, 4, 1.6)),
            ("side", (4, 0, 1.25)),
            ("back", (0, -4, 1.3)),
        ]:
            camera.location = position
            camera.rotation_euler = (
                (Vector((0, 0, 0.9)) - camera.location)
                .to_track_quat("-Z", "Y")
                .to_euler()
            )
            bpy.context.scene.render.filepath = str(folder / (name + ".png"))
            bpy.ops.render.render(write_still=True)
    print("CHARACTER_EXPORT_COMPLETE", args.output)


if __name__ == "__main__":
    main()
