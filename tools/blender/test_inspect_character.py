"""Regression tests mutate the real GLB to prove the audit rejects broken assets."""

import json
from pathlib import Path
import struct
import tempfile
import unittest
from inspect_character import inspect

ASSET = (
    Path(__file__).resolve().parents[2] / "assets/characters/minimorph/minimorph_v1.glb"
)


class CharacterAuditTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.data = ASSET.read_bytes()
        count = struct.unpack_from("<I", self.data, 12)[0]
        self.document = json.loads(self.data[20 : 20 + count])
        self.binary = bytearray(self.data[28 + count :])

    def modified(self):
        encoded = json.dumps(self.document, separators=(",", ":")).encode()
        encoded += b" " * (-len(encoded) % 4)
        binary = bytes(self.binary)
        binary += b"\0" * (-len(binary) % 4)
        data = struct.pack("<4sII", b"glTF", 2, 28 + len(encoded) + len(binary))
        data += struct.pack("<II", len(encoded), 0x4E4F534A) + encoded
        data += struct.pack("<II", len(binary), 0x004E4942) + binary
        path = Path(self.temp.name) / "mutated.glb"
        path.write_bytes(data)
        return path

    def test_actual_model_contract(self):
        report = inspect(ASSET)
        self.assertLessEqual(report["rendered_triangles"], 20000)
        self.assertEqual(report["materials"], 8)
        self.assertEqual(report["rendered_primitives"], 8)
        self.assertEqual(report["skins"], 0)
        self.assertEqual(report["animation_clips"], 0)
        self.assertAlmostEqual(report["height"], 1.8, places=5)

    def test_committed_report_matches_actual_asset(self):
        expected = json.loads(ASSET.with_name("validation.json").read_text())
        self.assertEqual(inspect(ASSET), expected)

    def test_rejects_truncation(self):
        path = Path(self.temp.name) / "truncated.glb"
        path.write_bytes(self.data[:-4])
        with self.assertRaisesRegex(AssertionError, "length"):
            inspect(path)

    def test_rejects_external_resource(self):
        self.document["buffers"][0]["uri"] = "missing.bin"
        with self.assertRaisesRegex(AssertionError, "External"):
            inspect(self.modified())

    def test_rejects_unapplied_root(self):
        root = self.document["scenes"][0]["nodes"][0]
        self.document["nodes"][root]["scale"] = [2, 2, 2]
        with self.assertRaisesRegex(AssertionError, "Root scale"):
            inspect(self.modified())

    def test_rejects_missing_fur_colors(self):
        for mesh in self.document["meshes"]:
            for primitive in mesh["primitives"]:
                material = self.document["materials"][primitive["material"]]
                if material.get("name") == "Kitten_VertexFur":
                    primitive["attributes"].pop("COLOR_0")
        with self.assertRaisesRegex(AssertionError, "fur vertex colors"):
            inspect(self.modified())

    def test_rejects_degenerate_triangle(self):
        spec = self.document["accessors"][
            self.document["meshes"][0]["primitives"][0]["indices"]
        ]
        view = self.document["bufferViews"][spec["bufferView"]]
        size = {5121: 1, 5123: 2, 5125: 4}[spec["componentType"]]
        start = view.get("byteOffset", 0) + spec.get("byteOffset", 0)
        self.binary[start + size : start + 2 * size] = self.binary[start : start + size]
        with self.assertRaisesRegex(AssertionError, "Degenerate"):
            inspect(self.modified())


if __name__ == "__main__":
    unittest.main()
