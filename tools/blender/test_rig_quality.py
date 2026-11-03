"""Actual exported-skin regressions and deliberate bad-weight counterexamples.
Quality acceptance remains a separate strict CI gate; improvement is not approval.
"""

import hashlib, json, struct, tempfile, unittest
from pathlib import Path
import numpy as np
from evaluate_skin import Skin, measure, joint_violations

ROOT = Path(__file__).resolve().parents[2] / "assets/characters/minimorph/animation"
ASSET = ROOT / "minimorph_animated_v1.glb"
SEM = ROOT / "rework/semantic-weights.npz"


class RigQualityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.skin = Skin(ASSET)
        cls.semantic = np.load(SEM)
        cls.report = measure(ASSET, SEM)

    def mutate_influence(self, vertex, bone):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        data = bytearray(ASSET.read_bytes())
        n = struct.unpack_from("<I", data, 12)[0]
        doc = json.loads(data[20 : 20 + n])
        attributes = doc["meshes"][0]["primitives"][0]["attributes"]
        base = 28 + n
        for attribute, values in [
            ("JOINTS_0", [self.skin.bones.index(bone), 0, 0, 0]),
            ("WEIGHTS_0", [1, 0, 0, 0]),
        ]:
            a = doc["accessors"][attributes[attribute]]
            v = doc["bufferViews"][a["bufferView"]]
            fmt = {5121: "B", 5123: "H", 5126: "f"}[a["componentType"]]
            size = struct.calcsize("<" + fmt) * 4
            offset = (
                base
                + v.get("byteOffset", 0)
                + a.get("byteOffset", 0)
                + vertex * v.get("byteStride", size)
            )
            struct.pack_into("<" + fmt * 4, data, offset, *values)
        p = Path(temporary.name) / "bad-weight.glb"
        p.write_bytes(data)
        return Skin(p)

    def test_neutral_mesh_and_report_are_bound_to_actual_asset(self):
        self.assertTrue(self.report["gates"]["neutral_fidelity"])
        cached = json.loads((ROOT / "rework/full-frame.json").read_text())
        self.assertEqual(
            cached["asset_sha256"], hashlib.sha256(ASSET.read_bytes()).hexdigest()
        )
        for name in self.report["clips"]:
            self.assertAlmostEqual(
                self.report["clips"][name]["maximum_edge_stretch"],
                cached["clips"][name]["maximum_edge_stretch"],
                places=4,
            )

    def test_full_clip_ground_contacts(self):
        self.assertTrue(self.report["gates"]["ground_penetration"])
        self.assertTrue(self.report["gates"]["foot_contacts"])
        self.assertEqual(
            sum(r["frames_sampled"] for r in self.report["clips"].values()), 378
        )

    def test_joint_influences_and_rigid_armor(self):
        self.assertTrue(self.report["gates"]["joint_influences"])
        self.assertTrue(self.report["gates"]["rigid_armor"])
        self.assertEqual(self.report["joint_influence_failures"], [])

    def test_regression_improves_each_clip_but_does_not_approve_strain(self):
        baseline = json.loads((ROOT / "rework/baseline-full-frame.json").read_text())
        for name, row in self.report["clips"].items():
            self.assertLess(
                row["maximum_edge_stretch"],
                baseline["clips"][name]["maximum_edge_stretch"] * 0.2,
            )
        # This is a regression ceiling relative to the rejected baseline, NOT the 2x acceptance gate.
        if not self.report["gates"]["edge_stretch"]:
            self.assertFalse(
                json.loads((ROOT / "quality-status.json").read_text())[
                    "production_ready"
                ]
            )

    def test_bad_paw_weight_triggers_excessive_edge_stretch(self):
        labels = self.semantic["labels"]
        vertex = int(
            np.flatnonzero((labels == "Hand.L") & (self.skin.neutral[:, 1] < 0.39))[0]
        )
        bad = self.mutate_influence(vertex, "UpperLeg.L")
        self.assertIn(vertex, joint_violations(bad, labels))
        p, _ = bad.evaluate("Victory", 1.0)
        ratios = (
            np.linalg.norm(p[bad.edges[:, 0]] - p[bad.edges[:, 1]], axis=1)[bad.valid]
            / bad.rest_lengths[bad.valid]
        )
        self.assertGreater(float(ratios.max()), 2)

    def test_bad_sole_weight_triggers_ground_penetration(self):
        vertex = int(np.argmin(self.skin.neutral[:, 1]))
        bad = self.mutate_influence(vertex, "Root")
        p, _ = bad.evaluate("Land", 0.16)
        self.assertLess(float(p[:, 1].min()), -0.002)

    def test_bad_armor_weight_breaks_rigid_integrity(self):
        sem = self.semantic
        choices = np.flatnonzero(
            sem["rigid_bones"] == list(sem["names"]).index("LowerArm.L")
        )
        vertex = int(sem["unique_first"][sem["rigid_indices"][choices[0]]])
        bad = self.mutate_influence(vertex, "Root")
        p, m = bad.evaluate("Victory", 1.0)
        bone = self.skin.bones.index("LowerArm.L")
        expected = m[bone, :3, :3] @ bad.pos[vertex] + m[bone, :3, 3]
        self.assertGreater(float(np.linalg.norm(p[vertex] - expected)), 1e-5)


if __name__ == "__main__":
    unittest.main()
