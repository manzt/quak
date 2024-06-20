from __future__ import annotations

import pathlib
import typing

import anywidget
import anywidget.experimental
import duckdb

if typing.TYPE_CHECKING:
    import pyarrow as pa


DataFrameObject = typing.Any


# Copied from Altair
# https://github.com/vega/altair/blob/18a2c3c237014591d172284560546a2f0ac1a883/altair/utils/data.py#L343
def arrow_table_from_dataframe_protocol(dflike: DataFrameObject) -> pa.lib.Table:
    """Convert a DataFrame-like object to a pyarrow Table."""
    import pyarrow as pa
    import pyarrow.interchange as pi

    # First check if the dataframe object has a method to convert to arrow.
    # Give this preference over the pyarrow from_dataframe function
    # since the object
    # has more control over the conversion, and may have broader compatibility.
    # This is the case for Polars, which supports Date32 columns in
    # direct conversion
    # while pyarrow does not yet support this type in from_dataframe
    for convert_method_name in ("arrow", "to_arrow", "to_arrow_table"):
        convert_method = getattr(dflike, convert_method_name, None)
        if callable(convert_method):
            result = convert_method()
            if isinstance(result, pa.Table):
                return result

    return pi.from_dataframe(dflike)  # type: ignore[no-any-return]


def arrow_to_ipc(table: pa.lib.Table) -> memoryview:
    """Convert a pyarrow Table to an Arrow IPC message."""
    import io

    import pyarrow.feather as feather

    sink = io.BytesIO()
    feather.write_feather(table, sink, compression="uncompressed")
    return sink.getbuffer()

class Widget(anywidget.AnyWidget):
    """An anywidget for displaying tabular data in a table."""

    _esm = pathlib.Path(__file__).parent / "widget.js"

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
