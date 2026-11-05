# Original Minimorph audio

All WAV files in this directory are original synthetic sound effects and original musical compositions generated for Minimorph by `tools/audio/generate.py`. No third-party samples, melodies, recordings or paid services are used.

These audio files and their original composition/generation code are dedicated to the public domain under **CC0 1.0 Universal**: https://creativecommons.org/publicdomain/zero/1.0/ . The repository's general code license is otherwise unchanged.

Reproduce with Python 3 and NumPy: `python3 tools/audio/generate.py`. The manifest records sample durations and SHA-256 hashes. Tracks are stereo 22,050 Hz PCM; cues are mono. Master peaks are limited, and short boundary fades avoid clicks. Owner listening approval remains required; automated tests do not judge musical quality.
