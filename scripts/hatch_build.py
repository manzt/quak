"""A Hatchling plugin to build the quak frontend."""

import pathlib
import subprocess

from hatchling.builders.hooks.plugin.interface import BuildHookInterface

ROOT = pathlib.Path(__file__).parent / ".."


class QuakBuildHook(BuildHookInterface):
    """Hatchling plugin to build the quak frontend."""

    PLUGIN_NAME = "quak"

    def initialize(self, version: str, build_data: dict) -> None:
        """Initialize the plugin."""
        if not (ROOT / "src/quak/widget.js").exists():
            subprocess.check_call(["deno", "task", "build"], cwd=ROOT)
