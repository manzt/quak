import importlib.metadata
import pathlib

import anywidget
import anywidget.experimental
import traitlets
import duckdb
from ._util import arrow_table_from_dataframe_protocol, arrow_to_ipc

__version__ = importlib.metadata.version("ipytable")


class Widget(anywidget.AnyWidget):
    _esm = pathlib.Path(__file__).parent / "widget.js"
    _query = traitlets.Dict().tag(sync=True)

    def __init__(self, df):
        super().__init__(_query={"orderby": []})
        con = duckdb.connect(":memory:")
        con.register("df", arrow_table_from_dataframe_protocol(df))
        self._con = con

    @anywidget.experimental.command
    def _run_query(self, msg: dict, buffers: list[bytes]):
        print(msg["sql"])
        result = self._con.execute(msg["sql"])
        ipc = arrow_to_ipc(result.arrow())
        return None, [ipc.tobytes()]
