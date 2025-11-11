from __future__ import annotations

import importlib.metadata

try:
    __version__ = importlib.metadata.version("quak")
except importlib.metadata.PackageNotFoundError:  # pragma: no cover - local dev fallback
    __version__ = "0+local"
