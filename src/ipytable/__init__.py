import importlib.metadata
import pathlib

import anywidget
import traitlets
from ._util import to_ipc

__version__ = importlib.metadata.version("ipytable")


class Widget(anywidget.AnyWidget):
    _esm = pathlib.Path(__file__).parent / "widget.js"
    _ipc = traitlets.Any().tag(sync=True)

    def __init__(self, df):
        super().__init__(_ipc=to_ipc(df))
