#!/usr/bin/env python3
"""Validate CI image artifacts as data, never source them as shell code."""
import pathlib
import re
import sys

IMAGES = {"web": "WEB_IMAGE", "api": "API_IMAGE", "scraper": "SCRAPER_IMAGE",
          "rotation-sim-worker": "ROTATION_WORKER_IMAGE"}


def outputs(directory, revision):
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise ValueError("invalid source revision")
    result = []
    for name, key in IMAGES.items():
        artifact = pathlib.Path(directory) / f"image-digest-{name}"
        actual = (artifact / "revision").read_text().strip()
        digest = (artifact / "digest").read_text().strip()
        if actual != revision:
            raise ValueError(f"{name}: CI image source differs from release revision")
        if not re.fullmatch(r"sha256:[0-9a-f]{64}", digest):
            raise ValueError(f"{name}: invalid image digest")
        result.append(f"{key}=ghcr.io/gildra-foundation/gildra-{name}@{digest}")
    return "\n".join(result)


if __name__ == "__main__":
    try:
        print(outputs(*sys.argv[1:]))
    except (OSError, ValueError, TypeError) as error:
        sys.exit(str(error))
