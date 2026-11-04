"""Reproduce the fixed-ROI matched-frame metrics; not a visual approval gate."""

import json
from pathlib import Path
import numpy as np
from PIL import Image

OUTPUT = Path(__file__).resolve().parents[2] / "docs/evidence/character-optimization"
rows = []
for clip in ["idle", "run", "jump", "fall", "land", "victory"]:
    original = np.array(
        Image.open(OUTPUT / f"original-{clip}-matched.png").convert("RGB")
    )[300:510, 550:730].astype(float)
    candidate = np.array(
        Image.open(OUTPUT / f"candidate-{clip}-matched.png").convert("RGB")
    )[300:510, 550:730].astype(float)
    delta = np.abs(original - candidate)
    rows.append(
        {
            "clip": clip,
            "roi": [550, 300, 730, 510],
            "meanAbsoluteChannelError0to255": float(delta.mean()),
            "fractionPixelsAnyChannelOver10": float((delta.max(2) > 10).mean()),
            "maxChannelDifference": int(delta.max()),
        }
    )
report = {
    "method": "Same camera, pose, full arena and drawing buffer. Fixed character ROI; rasterized edge and texture interpolation changes are included. Not a perceptual-quality gate.",
    "samples": rows,
}
(OUTPUT / "pixel-comparison.json").write_text(json.dumps(report, indent=2) + "\n")
