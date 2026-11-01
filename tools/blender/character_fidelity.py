"""Reference-led surface construction and portable baked PBR maps.

This module produces a review candidate, never a visual-approval decision.
Blender + bundled NumPy only. No image-generation stand-ins for actual renders.
"""

import math
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector

TAU = math.tau


def image_file(folder, name, values, color=True):
    height, width = values.shape[:2]
    image = bpy.data.images.new(name, width=width, height=height, alpha=False)
    image.colorspace_settings.name = "sRGB" if color else "Non-Color"
    rgb = np.clip(values, 0, 1).astype(np.float32)
    if rgb.ndim == 2:
        rgb = np.repeat(rgb[..., None], 3, axis=2)
    rgba = np.concatenate([rgb, np.ones((height, width, 1), np.float32)], axis=2)
    image.pixels.foreach_set(rgba.ravel())
    image.filepath_raw = str((folder / (name + ".png")).resolve())
    image.file_format = "PNG"
    image.save()
    image.pack()
    return image


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def texture_maps(folder):
    folder.mkdir(parents=True, exist_ok=True)
    n = 2048
    v, u = np.mgrid[0:n, 0:n].astype(np.float32) / (n - 1)
    angle = (u - 0.5) * TAU
    latitude = (v - 0.5) * math.pi
    x = 0.38 * np.sin(angle) * np.cos(latitude)
    z = 1.355 + 0.31 * np.sin(latitude)
    front = smoothstep(0.05, 0.5, np.cos(angle))
    # Painted volumes follow muzzle/cheeks instead of turning the lower face white.
    muzzle = np.exp(-((x / 0.175) ** 4 + ((z - 1.18) / 0.089) ** 4)) * front
    chin = np.exp(-((x / 0.125) ** 4 + ((z - 1.105) / 0.045) ** 2)) * front
    cream = np.maximum(muzzle, chin) * 0.94
    orange = np.empty((n, n, 3), np.float32)
    orange[:] = [0.956, 0.718, 0.471]
    warm = smoothstep(1.25, 1.63, z)
    orange[..., 0] -= 0.045 * warm
    orange[..., 1] -= 0.07 * warm
    orange[..., 2] -= 0.028 * warm
    pale = np.array([0.98, 0.85, 0.66], np.float32)
    # Curved tabby forehead stripes/M and short radiating temple bars.
    marks = np.zeros_like(u)
    crown = smoothstep(1.40, 1.48, z) * (1 - smoothstep(1.63, 1.69, z)) * front
    for offset in [0.018, 0.087, 0.16]:
        line = offset + (1.63 - z) * (0.24 if offset < 0.06 else 0.40)
        stripe = np.exp(
            -(((np.abs(x) - line) / (0.012 if offset < 0.06 else 0.016)) ** 2)
        )
        marks = np.maximum(marks, stripe * crown)
    temple = smoothstep(0.22, 0.30, np.abs(x)) * front
    marks = np.maximum(
        marks,
        np.maximum(0, np.cos((z - 1.30) * 74 + np.abs(x) * 9)) ** 12 * temple * 0.7,
    )
    base = orange * (1 - cream[..., None]) + pale * cream[..., None]
    stripe_color = np.array([0.65, 0.39, 0.19], np.float32)
    base = base * (1 - marks[..., None] * 0.46) + stripe_color * marks[..., None] * 0.46
    # Advected fine directional strands, not visible low-frequency polygon noise.
    direction = x + 0.045 * np.sin((z - 1.17) * 7) * np.tanh(x * 12)
    fiber_coordinate = direction * 1200
    fiber_index = np.floor(fiber_coordinate)
    random = (np.sin(fiber_index * 127.1) * 43758.5453) % 1
    strand = np.exp(-((((fiber_coordinate - fiber_index) - 0.5) / 0.14) ** 2)) - 0.22
    longitudinal = (0.5 + 0.5 * np.sin(z * (500 + random * 300) + random * TAU)) ** 2
    detail = 0.065 * strand * (0.3 + 0.7 * random) * longitudinal + 0.008 * np.sin(
        x * 2300 + z * 1500
    )
    base = np.clip(base + detail[..., None], 0, 1)
    # Dedicated ear island occupies hidden rear-head UVs, not the front face.
    ear_region = (u > 0.015) & (u < 0.19) & (v > 0.57) & (v < 0.97)
    eu = (u - 0.015) / 0.175
    ev = (v - 0.57) / 0.4
    inner = np.exp(-(((eu - 0.5) / 0.30) ** 4 + ((ev - 0.48) / 0.44) ** 4))
    ear_tint = np.array([0.69, 0.36, 0.23], np.float32)
    base = np.where(
        ear_region[..., None],
        orange * (1 - inner[..., None] * 0.8)
        + ear_tint * inner[..., None] * 0.8
        + detail[..., None] * 0.3,
        base,
    )
    body_region = (u < 0.2) & (v < 0.48)
    body_base = np.zeros_like(base)
    body_base[:] = [0.815, 0.537, 0.333]
    body_base = np.where(
        (v > 0.35)[..., None], np.array([0.956, 0.718, 0.471]), body_base
    )
    base = np.where(body_region[..., None], body_base + detail[..., None], base)
    albedo = image_file(folder, "fur_albedo_2k", base)
    # Normal field at 1k, sampled from the same analytic strand direction.
    height = (strand * (0.4 + 0.6 * longitudinal) + 0.3 * np.sin(x * 1000 + z * 2100))[
        ::2, ::2
    ]
    dy, dx = np.gradient(height)
    normal = np.stack([-dx * 0.10, -dy * 0.10, np.ones_like(dx)], axis=2)
    normal /= np.linalg.norm(normal, axis=2)[..., None]
    normal = image_file(folder, "fur_normal_1k", normal * 0.5 + 0.5, False)
    rough = image_file(
        folder,
        "fur_roughness_1k",
        np.clip(0.78 + detail[::2, ::2] * 1.2, 0.65, 0.92),
        False,
    )
    # One continuous glossy eye surface; iris fibers are in its own portable map.
    n = 1024
    v, u = np.mgrid[0:n, 0:n].astype(np.float32) / (n - 1)
    a = (u - 0.5) * TAU
    lat = (v - 0.5) * math.pi
    ex = np.sin(a) * np.cos(lat)
    ez = np.sin(lat)
    r = np.sqrt((ex / 0.76) ** 2 + (ez / 0.80) ** 2)
    theta = np.arctan2(ez, ex)
    iris_mask = (
        (1 - smoothstep(0.90, 1.0, r))
        * smoothstep(0.83, 0.90, r)
        * smoothstep(0, 0.4, np.cos(a))
    )
    fibers = (
        0.55 + 0.22 * np.sin(theta * 163 + r * 23) + 0.12 * np.sin(theta * 307 - r * 41)
    )
    eye = np.zeros((n, n, 3), np.float32)
    eye[:] = [0.014, 0.041, 0.052]
    blue = np.stack(
        [0.08 + fibers * 0.08, 0.30 + fibers * 0.23, 0.38 + fibers * 0.25], axis=2
    )
    eye = eye * (1 - iris_mask[..., None]) + blue * iris_mask[..., None]
    eye_image = image_file(folder, "eye_iris_1k", eye)
    n = 512
    v, u = np.mgrid[0:n, 0:n].astype(np.float32) / (n - 1)
    grain = (
        np.sin(u * 1300 + np.sin(v * 18) * 0.7) * 0.017
        + np.sin(u * 3900 + v * 11) * 0.006
    )
    silver_rough = image_file(folder, "silver_roughness_512", 0.32 + grain, False)
    dx = np.gradient(grain, axis=1)
    metal_normal = np.stack([-dx * 0.22, np.zeros_like(dx), np.ones_like(dx)], axis=2)
    metal_normal /= np.linalg.norm(metal_normal, axis=2)[..., None]
    silver_normal = image_file(
        folder, "silver_normal_512", metal_normal * 0.5 + 0.5, False
    )
    return albedo, normal, rough, eye_image, silver_rough, silver_normal


def bind_image(material, image, input_name, normal=False):
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader = nodes.get("Principled BSDF")
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = image
    if normal:
        mapper = nodes.new("ShaderNodeNormalMap")
        mapper.inputs["Strength"].default_value = 0.4
        links.new(texture.outputs["Color"], mapper.inputs["Color"])
        links.new(mapper.outputs["Normal"], shader.inputs["Normal"])
    else:
        links.new(texture.outputs["Color"], shader.inputs[input_name])


def setup_materials(materials, folder):
    albedo, normal, rough, eye, silver_rough, silver_normal = texture_maps(folder)
    fur = materials["Kitten_Fur_PBR"]
    shader = fur.node_tree.nodes.get("Principled BSDF")
    for node in list(fur.node_tree.nodes):
        if node.type == "VERTEX_COLOR":
            fur.node_tree.nodes.remove(node)
    shader.inputs["Base Color"].default_value = (1, 1, 1, 1)
    shader.inputs["Roughness"].default_value = 0.8
    bind_image(fur, albedo, "Base Color")
    bind_image(fur, normal, "Normal", True)
    bind_image(fur, rough, "Roughness")
    bind_image(materials["Silver_PBR"], silver_rough, "Roughness")
    bind_image(materials["Silver_PBR"], silver_normal, "Normal", True)
    iris = materials["Blue_Iris"]
    shader = iris.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Metallic"].default_value = 0
    shader.inputs["Roughness"].default_value = 0.11
    shader.inputs["Coat Weight"].default_value = 0.35
    shader.inputs["Coat Roughness"].default_value = 0.055
    bind_image(iris, eye, "Base Color")


def map_spherical(obj, center, radii):
    uv = obj.data.uv_layers.get("UVMap") or obj.data.uv_layers.new(name="UVMap")
    for poly in obj.data.polygons:
        values = []
        for loop in poly.loop_indices:
            co = (
                obj.matrix_world
                @ obj.data.vertices[obj.data.loops[loop].vertex_index].co
            )
            x, y, z = [(co[i] - center[i]) / radii[i] for i in range(3)]
            values.append(
                (
                    loop,
                    0.5 + math.atan2(x, y) / TAU,
                    0.5 + math.asin(max(-1, min(1, z))) / math.pi,
                )
            )
        wrap = max(v[1] for v in values) - min(v[1] for v in values) > 0.5
        for loop, u, v in values:
            uv.data[loop].uv = (u + 1 if wrap and u < 0.5 else u, v)
    obj["fidelity_uv"] = True


def rounded_ear(api, side, fur):
    # Two curved surfaces and a thick rim. The inner bowl recedes rather than
    # appearing as a flat painted triangular fan.
    vertices = []
    faces = []
    rings = 12
    across = 16
    for back in [False, True]:
        for j in range(rings + 1):
            t = j / rings
            center = side * (0.325 + 0.10 * t)
            width = 0.135 * (1 - t) ** 0.65 + 0.006
            z = 1.60 + 0.255 * t
            for i in range(across + 1):
                s = -1 + 2 * i / across
                x = center + width * s
                bowl = (1 - s * s) * math.sin(math.pi * t) ** 0.7
                y = (-0.045 + 0.025 * bowl) if back else (0.103 - 0.075 * bowl)
                vertices.append((x, y, z - 0.035 * s * s * (1 - t)))
    count = (rings + 1) * (across + 1)
    for back in [0, 1]:
        for j in range(rings):
            for i in range(across):
                a = back * count + j * (across + 1) + i
                face = (a, a + 1, a + across + 2, a + across + 1)
                faces.append(face[::-1] if back else face)
    for j in range(rings):
        for i in [0, across]:
            a = j * (across + 1) + i
            b = a + across + 1
            faces.append((a, b, b + count, a + count))
    for i in range(across):
        for j in [0, rings]:
            a = j * (across + 1) + i
            faces.append((a, a + count, a + count + 1, a + 1))
    obj = api.smooth(api.mesh_object("Shaped ear pinna", vertices, faces, fur))
    uv = obj.data.uv_layers.new(name="UVMap")
    for poly in obj.data.polygons:
        for loop in poly.loop_indices:
            index = obj.data.loops[loop].vertex_index
            back = index >= count
            index %= count
            j, i = divmod(index, across + 1)
            uv.data[loop].uv = (
                (0.015 + 0.175 * i / across, 0.57 + 0.40 * j / rings)
                if not back
                else (0.02 + 0.12 * i / across, 0.10 + 0.3 * j / rings)
            )
    obj["fidelity_uv"] = True
    return obj


def build_face(api, materials):
    fur = materials["Kitten_Fur_PBR"]
    eye = materials["Blue_Iris"]
    nose = materials["Nose_And_Mouth"]
    head = api.sphere(
        "Continuous kitten facial sculpt",
        (0, 0.015, 1.355),
        (0.38, 0.285, 0.31),
        fur,
        96,
        64,
    )
    pieces = [head]
    for side in [-1, 1]:
        pieces.append(
            api.sphere(
                "Anatomical cheek",
                (side * 0.225, 0.185, 1.255),
                (0.14, 0.065, 0.113),
                fur,
                48,
                32,
            )
        )
        pieces.append(
            api.sphere(
                "Muzzle pad",
                (side * 0.064, 0.309, 1.185),
                (0.112, 0.065, 0.072),
                fur,
                48,
                32,
            )
        )
    pieces.append(
        api.sphere("Chin volume", (0, 0.285, 1.115), (0.125, 0.060, 0.045), fur, 48, 24)
    )
    pieces.append(
        api.sphere(
            "Nasal bridge", (0, 0.278, 1.285), (0.052, 0.052, 0.105), fur, 48, 32
        )
    )
    bpy.ops.object.select_all(action="DESELECT")
    for obj in pieces:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = head
    bpy.ops.object.join()
    for obj in pieces[1:]:
        api.parts.remove(obj)
    mod = head.modifiers.new("Unified facial tissue", "REMESH")
    mod.mode = "VOXEL"
    mod.voxel_size = 0.006
    mod.use_smooth_shade = True
    api.apply_modifier(head, mod)
    mod = head.modifiers.new("Smooth facial flow", "SMOOTH")
    mod.factor = 0.65
    mod.iterations = 3
    api.apply_modifier(head, mod)
    # Continuous recessed socket tissue: a concave sculpted surface, not a
    # through-hole or a separate ring. The eyeball intersects this skin naturally.
    bpy.context.view_layer.update()
    for vertex in head.data.vertices:
        world = head.matrix_world @ vertex.co
        if world.y < 0.12:
            continue
        amount = 0.0
        for side in [-1, 1]:
            dx = (world.x - side * 0.151) / 0.099
            dz = (world.z - 1.392) / 0.081
            amount -= 0.064 * math.exp(-(dx**4 + dz**4))
            amount += 0.015 * math.exp(
                -(((world.x - side * 0.151) / 0.122) ** 4)
                - ((world.z - 1.477) / 0.022) ** 2
            )
            amount += 0.006 * math.exp(
                -(((world.x - side * 0.151) / 0.122) ** 4)
                - ((world.z - 1.301) / 0.019) ** 2
            )
        vertex.co.y += amount
    head.data.update()
    api.smooth(head)
    map_spherical(head, (0, 0.015, 1.355), (0.38, 0.285, 0.31))
    for side in [-1, 1]:
        orb = api.sphere(
            "Continuous glossy kitten eye",
            (side * 0.151, 0.16, 1.392),
            (0.125, 0.14, 0.12),
            eye,
            64,
            48,
        )
        map_spherical(orb, (side * 0.151, 0.16, 1.392), (0.125, 0.14, 0.12))
        rounded_ear(api, side, fur)
    # Soft triangular nose with actual nostril recesses, supported by nasal tissue.
    nose_obj = api.panel(
        "Rounded kitten nose",
        [
            (-0.041, 1.237),
            (-0.027, 1.252),
            (0.027, 1.252),
            (0.041, 1.237),
            (0.016, 1.210),
            (0, 1.207),
            (-0.016, 1.210),
        ],
        0.395,
        0.03,
        nose,
        0.012,
    )
    api.smooth(nose_obj)
    for side in [-1, 1]:
        api.sphere(
            "Nostril",
            (side * 0.026, 0.398, 1.234),
            (0.005, 0.003, 0.0035),
            materials["Pupil_And_Gasket"],
            16,
            8,
        )
        api.tube(
            "Subtle mouth line",
            [
                (0, 0.379, 1.211),
                (0, 0.379, 1.19),
                (side * 0.017, 0.375, 1.181),
                (side * 0.041, 0.364, 1.186),
            ],
            0.0018,
            nose,
        )
        for off in [-0.022, 0, 0.022]:
            api.tube(
                "Fine whisker",
                [
                    (side * 0.145, 0.345, 1.18 + off * 0.4),
                    (side * 0.21, 0.35, 1.18 + off),
                    (side * 0.28, 0.325, 1.19 + off * 1.4),
                ],
                0.0008,
                materials["Eye_Catchlight"],
            )
    return head


def shell_point(t, a):
    # A shallow fitted shell, not a sphere. Cubic rings close the rear smoothly.
    stations = [
        (0.31, 0.455, 0.365),
        (0.14, 0.471, 0.399),
        (-0.06, 0.458, 0.396),
        (-0.235, 0.359, 0.309),
        (-0.31, 0.17, 0.15),
        (-0.329, 0.005, 0.005),
    ]
    scaled = t * (len(stations) - 1)
    i = min(len(stations) - 2, int(scaled))
    f = scaled - i
    y, rx, rz = [stations[i][j] * (1 - f) + stations[i + 1][j] * f for j in range(3)]
    return (rx * math.cos(a), y, 1.355 + rz * math.sin(a))


def build_helmet(api, materials):
    silver = materials["Silver_PBR"]
    dark = materials["Pupil_And_Gasket"]
    cyan = materials["Cyan_Illumination"]
    segments = 96
    rows = 32
    # Dark pressure liner remains closed beneath the independently fitted plates.
    vertices = [
        shell_point(j / rows, TAU * i / segments)
        for j in range(rows + 1)
        for i in range(segments)
    ]
    faces = [
        (
            j * segments + i,
            j * segments + (i + 1) % segments,
            (j + 1) * segments + (i + 1) % segments,
            (j + 1) * segments + i,
        )
        for j in range(rows)
        for i in range(segments)
    ]
    liner = api.smooth(
        api.mesh_object("Continuous helmet pressure liner", vertices, faces, dark)
    )
    # Six broad shell plates with actual narrow gaps and solid edges.
    for sector in range(6):
        vertices = []
        faces = []
        cross = 18
        long = 28
        for j in range(long + 1):
            t = j / long * 0.88
            for i in range(cross + 1):
                a = (sector + (i / cross * 0.976 + 0.012)) * TAU / 6
                p = Vector(shell_point(t, a))
                p.x *= 1.006
                p.z = 1.355 + (p.z - 1.355) * 1.006
                vertices.append(tuple(p))
        for j in range(long):
            for i in range(cross):
                a = j * (cross + 1) + i
                faces.append((a, a + 1, a + cross + 2, a + cross + 1))
        plate = api.smooth(
            api.mesh_object(
                "Segmented helmet plate %02d" % sector, vertices, faces, silver
            )
        )
        mod = plate.modifiers.new("Machined shell wall", "SOLIDIFY")
        mod.thickness = 0.014
        api.apply_modifier(plate, mod)
        # Ear channels are sculpted through the corresponding crown plates.
        if sector in [0, 1, 2]:
            for side in [-1, 1]:
                cutter = api.sphere(
                    "Ear channel cutter",
                    (side * 0.34, 0.065, 1.68),
                    (0.092, 0.13, 0.10),
                    silver,
                    32,
                    24,
                )
                mod = plate.modifiers.new("Fitted ear exit", "BOOLEAN")
                mod.operation = "DIFFERENCE"
                mod.solver = "EXACT"
                mod.object = cutter
                api.apply_modifier(plate, mod)
                api.parts.remove(cutter)
                bpy.data.objects.remove(cutter, do_unlink=True)
    # Thick shaped front annulus. Profile changes make real layered bevels.
    profile = [
        (0.457, 0.365, 0.307),
        (0.465, 0.370, 0.325),
        (0.453, 0.359, 0.355),
        (0.414, 0.319, 0.371),
        (0.397, 0.300, 0.372),
        (0.391, 0.294, 0.356),
    ]
    vertices = [
        (
            rx * math.cos(TAU * i / segments),
            y,
            1.355 + rz * math.sin(TAU * i / segments),
        )
        for rx, rz, y in profile
        for i in range(segments)
    ]
    faces = [
        (
            r * segments + i,
            r * segments + (i + 1) % segments,
            (r + 1) * segments + (i + 1) % segments,
            (r + 1) * segments + i,
        )
        for r in range(len(profile) - 1)
        for i in range(segments)
    ]
    api.smooth(api.mesh_object("Shaped oval face bezel", vertices, faces, silver))
    api.oval_ring("Recessed visor seal", 0.392, 0.295, 0.372, 1.355, 0.010, dark, 96, 8)
    api.oval_ring(
        "Bright continuous cyan rim", 0.385, 0.287, 0.382, 1.355, 0.008, cyan, 96, 8
    )
    # Rear crown patch covers the plate convergence without crossing X seams.
    api.sphere(
        "Rear crown access plate",
        (0, -0.326, 1.355),
        (0.15, 0.014, 0.135),
        silver,
        48,
        32,
    )
    for side in [-1, 1]:
        api.cylinder_between(
            "Comms gasket",
            (side * 0.454, -0.03, 1.34),
            (side * 0.478, -0.03, 1.34),
            0.113,
            0.113,
            dark,
            40,
        )
        api.cylinder_between(
            "Comms silver housing",
            (side * 0.478, -0.03, 1.34),
            (side * 0.505, -0.03, 1.34),
            0.104,
            0.099,
            silver,
            40,
        )
        api.cylinder_between(
            "Comms cyan inset",
            (side * 0.506, -0.03, 1.34),
            (side * 0.511, -0.03, 1.34),
            0.079,
            0.079,
            cyan,
            40,
        )
        api.cylinder_between(
            "Comms center plate",
            (side * 0.512, -0.03, 1.34),
            (side * 0.519, -0.03, 1.34),
            0.067,
            0.067,
            silver,
            40,
        )


def finish_uvs(parts, materials):
    fur = materials["Kitten_Fur_PBR"]
    silver = materials["Silver_PBR"]
    for obj in parts:
        if obj.get("fidelity_uv"):
            continue
        material = obj.data.materials[0]
        if material not in [fur, silver]:
            continue
        uv = obj.data.uv_layers.get("UVMap") or obj.data.uv_layers.new(name="UVMap")
        for poly in obj.data.polygons:
            axis = max(range(3), key=lambda i: abs(poly.normal[i]))
            axes = [i for i in range(3) if i != axis]
            for loop in poly.loop_indices:
                p = (
                    obj.matrix_world
                    @ obj.data.vertices[obj.data.loops[loop].vertex_index].co
                )
                if material == fur:
                    uv.data[loop].uv = (
                        0.02 + (p.x + 0.5) * 0.12,
                        (
                            (0.37 + 0.07 * (p.z % 1))
                            if "paw" in obj.name.lower()
                            else (0.10 + (p.z % 1) * 0.22)
                        ),
                    )
                else:
                    uv.data[loop].uv = (p[axes[0]] * 7, p[axes[1]] * 7)


def remove_parts(api, prefixes):
    for obj in list(api.parts):
        if any(obj.name.startswith(name) for name in prefixes):
            api.parts.remove(obj)
            bpy.data.objects.remove(obj, do_unlink=True)


def curved_plate(api, name, outline, front, depth, material, edge=0.012):
    # Nonplanar plate follows the chest/limb contour, with real return walls.
    count = len(outline)
    vertices = [
        (x, front - 0.65 * x * x + 0.012 * math.cos(z * 5), z) for x, z in outline
    ]
    vertices += [(x, y - depth, z) for x, y, z in vertices]
    faces = [tuple(range(count - 1, -1, -1)), tuple(range(count, count * 2))]
    faces += [
        (i, (i + 1) % count, (i + 1) % count + count, i + count) for i in range(count)
    ]
    obj = api.mesh_object(name, vertices, faces, material)
    api.bevel(obj, edge, 3)
    return obj


def shell_patch(api, name, center, radii, material):
    segments = 48
    rows = 14
    vertices = []
    faces = []
    for j in range(rows + 1):
        theta = 0.08 + j / rows * 1.65
        for i in range(segments):
            phi = TAU * i / segments
            vertices.append(
                (
                    center[0] + radii[0] * math.sin(theta) * math.cos(phi),
                    center[1] + radii[1] * math.sin(theta) * math.sin(phi),
                    center[2] + radii[2] * math.cos(theta),
                )
            )
    for j in range(rows):
        for i in range(segments):
            faces.append(
                (
                    j * segments + i,
                    (j + 1) * segments + i,
                    (j + 1) * segments + (i + 1) % segments,
                    j * segments + (i + 1) % segments,
                )
            )
    obj = api.smooth(api.mesh_object(name, vertices, faces, material))
    mod = obj.modifiers.new("Fitted armor wall", "SOLIDIFY")
    mod.thickness = 0.016
    api.apply_modifier(obj, mod)
    return obj


def unified_fur(api, name, pieces, fur, voxel=0.007):
    objects = [
        api.sphere(name + " volume", center, radii, fur, 32, 24)
        for center, radii in pieces
    ]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    for obj in objects[1:]:
        api.parts.remove(obj)
    obj = objects[0]
    obj.name = name
    mod = obj.modifiers.new("Continuous paw tissue", "REMESH")
    mod.mode = "VOXEL"
    mod.voxel_size = voxel
    mod.use_smooth_shade = True
    api.apply_modifier(obj, mod)
    mod = obj.modifiers.new("Soft paw contours", "SMOOTH")
    mod.factor = 0.5
    mod.iterations = 2
    api.apply_modifier(obj, mod)
    return api.smooth(obj)


def refine_armor(api, materials):
    silver = materials["Silver_PBR"]
    dark = materials["Armor_Dark"]
    cyan = materials["Cyan_Illumination"]
    fur = materials["Kitten_Fur_PBR"]
    remove_parts(
        api,
        [
            "Chest armor",
            "Chest dark inset",
            "Chest core bezel",
            "Illuminated chest core",
            "Core M identity",
            "Chest cyan circuit",
            "Contoured shoulder pauldron",
            "Silver forearm guard",
            "Forearm light channel",
            "Contoured thigh armor",
            "Rounded silver kneecap",
            "Shin armor",
            "Shin seam",
            "Boot heel armor",
            "Exposed rounded toe paw",
            "Toe crease",
            "Rounded kitten hand",
            "Attached thumb",
            "Back armor",
            "Life support housing",
            "Back status lamp",
        ],
    )
    curved_plate(
        api,
        "Graphite chest undershell",
        [
            (-0.20, 0.97),
            (0.20, 0.97),
            (0.23, 0.73),
            (0.13, 0.61),
            (-0.13, 0.61),
            (-0.23, 0.73),
        ],
        0.165,
        0.13,
        dark,
        0.022,
    )
    for side in [-1, 1]:
        outline = [
            (side * 0.096, 0.96),
            (side * 0.20, 0.97),
            (side * 0.267, 0.88),
            (side * 0.232, 0.67),
            (side * 0.137, 0.615),
            (side * 0.102, 0.685),
            (side * 0.15, 0.77),
        ]
        curved_plate(api, "Layered side cuirass", outline, 0.214, 0.037, silver, 0.016)
        api.tube(
            "Recessed chest cyan trace",
            [
                (side * 0.173, 0.224 - 0.65 * 0.173**2, 0.91),
                (side * 0.157, 0.226 - 0.65 * 0.157**2, 0.815),
                (side * 0.178, 0.22 - 0.65 * 0.178**2, 0.735),
                (side * 0.128, 0.223 - 0.65 * 0.128**2, 0.674),
            ],
            0.0055,
            cyan,
        )
    curved_plate(
        api,
        "Raised core silver frame",
        [(-0.101, 0.925), (0.101, 0.925), (0.094, 0.724), (-0.094, 0.724)],
        0.235,
        0.028,
        silver,
        0.017,
    )
    curved_plate(
        api,
        "Core inset graphite gasket",
        [(-0.071, 0.897), (0.071, 0.897), (0.068, 0.754), (-0.068, 0.754)],
        0.263,
        0.010,
        dark,
        0.010,
    )
    curved_plate(
        api,
        "Cyan illuminated chest window",
        [(-0.052, 0.878), (0.052, 0.878), (0.05, 0.775), (-0.05, 0.775)],
        0.274,
        0.006,
        cyan,
        0.007,
    )
    api.tube(
        "Core identity M",
        [
            (-0.031, 0.28, 0.794),
            (-0.031, 0.28, 0.856),
            (0, 0.28, 0.819),
            (0.031, 0.28, 0.856),
            (0.031, 0.28, 0.794),
        ],
        0.003,
        materials["Eye_Catchlight"],
    )
    # Back is fitted armor, not a single floating rectangular backpack.
    curved_plate(
        api,
        "Back fitted silver shell",
        [
            (-0.20, 0.94),
            (0.20, 0.94),
            (0.204, 0.71),
            (0.14, 0.635),
            (-0.14, 0.635),
            (-0.204, 0.71),
        ],
        -0.085,
        0.055,
        silver,
        0.019,
    )
    curved_plate(
        api,
        "Back unit graphite recess",
        [(-0.112, 0.885), (0.112, 0.885), (0.118, 0.72), (-0.118, 0.72)],
        -0.158,
        0.025,
        dark,
        0.012,
    )
    curved_plate(
        api,
        "Back unit silver service panel",
        [(-0.084, 0.862), (0.084, 0.862), (0.083, 0.745), (-0.083, 0.745)],
        -0.19,
        0.012,
        silver,
        0.010,
    )
    curved_plate(
        api,
        "Back cyan status window",
        [(-0.034, 0.825), (0.034, 0.825), (0.034, 0.785), (-0.034, 0.785)],
        -0.212,
        -0.006,
        cyan,
        0.004,
    )
    for side in [-1, 1]:
        shell_patch(
            api,
            "Shaped shoulder shell",
            (side * 0.287, 0.002, 0.858),
            (0.123, 0.137, 0.139),
            silver,
        )
        api.cylinder_between(
            "Forearm fitted cuff",
            (side * 0.333, 0.018, 0.70),
            (side * 0.375, 0.025, 0.554),
            0.09,
            0.078,
            silver,
            40,
        )
        curved_plate(
            api,
            "Forearm graphite channel",
            [
                (side * 0.326, 0.68),
                (side * 0.365, 0.68),
                (side * 0.389, 0.574),
                (side * 0.345, 0.574),
            ],
            0.178,
            0.010,
            dark,
            0.006,
        )
        api.tube(
            "Forearm inset cyan strip",
            [
                (side * 0.348, 0.18 - 0.65 * 0.348**2, 0.657),
                (side * 0.369, 0.18 - 0.65 * 0.369**2, 0.594),
            ],
            0.005,
            cyan,
        )
        unified_fur(
            api,
            "Anatomical mitten paw",
            [
                ((side * 0.378, 0.03, 0.511), (0.067, 0.066, 0.073)),
                ((side * 0.33, 0.072, 0.517), (0.033, 0.04, 0.046)),
            ]
            + [
                ((side * (0.348 + i * 0.027), 0.071, 0.478), (0.024, 0.043, 0.034))
                for i in range(3)
            ],
            fur,
        )
        x = side * 0.132
        outline = [
            (x - 0.086, 0.493),
            (x + 0.081, 0.51),
            (x + 0.104, 0.427),
            (x + 0.067, 0.347),
            (x - 0.053, 0.352),
            (x - 0.096, 0.421),
        ]
        curved_plate(
            api, "Thigh fitted front shell", outline, 0.125, 0.045, silver, 0.015
        )
        # Side wings wrap the thigh and leave graphite separation at the knee.
        api.sphere(
            "Thigh outer wrap",
            (x + side * 0.059, -0.017, 0.421),
            (0.062, 0.094, 0.102),
            silver,
            32,
            24,
        )
        curved_plate(
            api,
            "Hexagonal silver knee pad",
            [
                (x - 0.06, 0.362),
                (x + 0.056, 0.365),
                (x + 0.077, 0.324),
                (x + 0.053, 0.268),
                (x - 0.049, 0.266),
                (x - 0.076, 0.316),
            ],
            0.162,
            0.029,
            silver,
            0.012,
        )
        api.cylinder_between(
            "Shin fitted inner shell",
            (x, -0.005, 0.111),
            (x, -0.005, 0.253),
            0.099,
            0.086,
            silver,
            40,
        )
        curved_plate(
            api,
            "Shin overlapping front panel",
            [
                (x - 0.076, 0.245),
                (x + 0.07, 0.245),
                (x + 0.089, 0.134),
                (x + 0.06, 0.102),
                (x - 0.061, 0.102),
                (x - 0.087, 0.14),
            ],
            0.118,
            0.024,
            silver,
            0.010,
        )
        api.tube(
            "Ankle panel separation",
            [(x - 0.082, 0.088, 0.13), (x, 0.121, 0.145), (x + 0.082, 0.088, 0.13)],
            0.0025,
            dark,
        )
        shell_patch(
            api,
            "Ankle back heel shell",
            (x, -0.035, 0.076),
            (0.108, 0.098, 0.08),
            silver,
        )
        unified_fur(
            api,
            "Sculpted exposed toe paw",
            [((x, 0.085, 0.067), (0.109, 0.12, 0.067))]
            + [
                ((x + offset, 0.169, 0.05), (0.037, 0.053, 0.05))
                for offset in [-0.063, 0, 0.063]
            ],
            fur,
            0.006,
        )
