"""Fetch immutable-hash-checked Meshy masters into an external working directory."""

import argparse
import hashlib
import json
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parents[2]


def verify(folder):
    manifest = json.loads(
        (ROOT / "assets/characters/minimorph/source-manifest.json").read_text()
    )
    for asset in manifest["assets"]:
        path = folder / asset["name"]
        data = path.read_bytes()
        assert len(data) == asset["size"], f"Size mismatch: {path.name}"
        assert (
            "sha256:" + hashlib.sha256(data).hexdigest() == asset["digest"]
        ), f"SHA-256 mismatch: {path.name}"
        if path.suffix == ".png":
            assert data[:8] == b"\x89PNG\r\n\x1a\n", f"Invalid PNG: {path.name}"
            assert struct.unpack_from(">II", data, 16) == (2048, 2048)
        else:
            magic, version, size = struct.unpack_from("<4sII", data)
            assert (
                magic == b"glTF" and version == 2 and size == len(data)
            ), "Invalid master GLB"
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    assert not args.output.resolve().is_relative_to(
        ROOT
    ), "Keep large master files outside repository"
    args.output.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(
        (ROOT / "assets/characters/minimorph/source-manifest.json").read_text()
    )
    for asset in manifest["assets"]:
        if not (args.output / asset["name"]).exists():
            subprocess.run(
                [
                    "gh",
                    "release",
                    "download",
                    "assets-v1",
                    "--repo",
                    manifest["repository"],
                    "--dir",
                    str(args.output),
                    "--pattern",
                    asset["name"],
                ],
                check=True,
            )
    verify(args.output)
    print("Verified five exact release assets: sizes, formats and SHA-256")


if __name__ == "__main__":
    main()
