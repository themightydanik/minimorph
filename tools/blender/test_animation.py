"""Reject missing clips and broken actual skin buffers; static fallback is pinned."""

import hashlib, json, struct, tempfile, unittest
from pathlib import Path
from inspect_animation import inspect

ROOT = Path(__file__).resolve().parents[2] / "assets/characters/minimorph"
ASSET = ROOT / "animation/minimorph_animated_v1.glb"


class AnimationAuditTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        b = ASSET.read_bytes()
        n = struct.unpack_from("<I", b, 12)[0]
        self.doc = json.loads(b[20 : 20 + n])
        self.binary = bytearray(b[28 + n :])

    def mutated(self):
        j = json.dumps(self.doc, separators=(",", ":")).encode()
        j += b" " * (-len(j) % 4)
        b = bytes(self.binary)
        b += b"\0" * (-len(b) % 4)
        data = (
            struct.pack("<4sII", b"glTF", 2, 28 + len(j) + len(b))
            + struct.pack("<II", len(j), 0x4E4F534A)
            + j
            + struct.pack("<II", len(b), 0x004E4942)
            + b
        )
        p = Path(self.temp.name) / "mutated.glb"
        p.write_bytes(data)
        return p

    def test_actual_asset_and_static_fallback(self):
        r = inspect(ASSET)
        self.assertEqual(r["bones"], 20)
        self.assertEqual(len(r["clips"]), 6)
        self.assertEqual(
            hashlib.sha256((ROOT / "minimorph_v1.glb").read_bytes()).hexdigest(),
            "52dff3dd1f96d7c7958f48a0a06013e2a0b1bb8f515183dabeed499fd584c851",
        )

    def test_reject_missing_clip(self):
        self.doc["animations"].pop()
        with self.assertRaisesRegex(AssertionError, "Missing animation"):
            inspect(self.mutated())

    def test_reject_invalid_joint(self):
        self.doc["skins"][0]["joints"][0] = 999
        with self.assertRaisesRegex(AssertionError, "Invalid joints"):
            inspect(self.mutated())

    def test_reject_invalid_weight(self):
        p = self.doc["meshes"][0]["primitives"][0]
        a = self.doc["accessors"][p["attributes"]["WEIGHTS_0"]]
        v = self.doc["bufferViews"][a["bufferView"]]
        offset = v.get("byteOffset", 0) + a.get("byteOffset", 0)
        struct.pack_into("<f", self.binary, offset, 2)
        with self.assertRaisesRegex(AssertionError, "Invalid skin weights"):
            inspect(self.mutated())


if __name__ == "__main__":
    unittest.main()
