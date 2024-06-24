from __future__ import annotations

import logging
import pathlib
import time
import typing

import anywidget
import anywidget.experimental
import duckdb
import pyarrow as pa
import traitlets

DataFrameObject = typing.Any

logger = logging.getLogger(__name__)
logger.addHandler(logging.NullHandler())

SLOW_QUERY_THRESHOLD = 5000


# Copied from Altair
# https://github.com/vega/altair/blob/18a2c3c237014591d172284560546a2f0ac1a883/altair/utils/data.py#L343
def arrow_table_from_dataframe_protocol(dflike: DataFrameObject) -> pa.lib.Table:
    """Convert a DataFrame-like object to a pyarrow Table."""
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


def table_to_ipc(table: pa.lib.Table) -> memoryview:
    """Convert a pyarrow Table to an Arrow IPC message."""
    import io

    import pyarrow.feather as feather

    sink = io.BytesIO()
    feather.write_feather(table, sink, compression="uncompressed")
    return sink.getbuffer()


def record_batch_to_ipc(record_batch: pa.lib.RecordBatch) -> memoryview:
    table = pa.Table.from_batches([record_batch], schema=record_batch.schema)
    return table_to_ipc(table)


def get_columns(conn, table_name):
    result = conn.execute(f"""
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = '{table_name}'
    """)
    rows = result.fetchall()
    return [row[0] for row in rows]


class Widget(anywidget.AnyWidget):
    """An anywidget for displaying tabular data in a table."""

    _esm = pathlib.Path(__file__).parent / "widget.js"
    _table_name = traitlets.Unicode().tag(sync=True)
    _columns = traitlets.List(traitlets.Unicode()).tag(sync=True)
    # Whether data cube indexes should be created as temp tables
    temp_indexes = traitlets.Bool().tag(sync=True)

    def __init__(self, data, *, table: str = "df"):
        if isinstance(data, duckdb.DuckDBPyConnection):
            conn = data
        else:
            conn = duckdb.connect(":memory:")
            conn.register(table, arrow_table_from_dataframe_protocol(data))
        self._conn = conn
        super().__init__(
            _table_name=table, _columns=get_columns(conn, table), temp_indexes=True
        )
        self.on_msg(self._handle_custom_msg)

    @anywidget.experimental.command
    def _query(self, msg: dict, buffers: list[bytes]):
        sql = msg["sql"]
        print(sql)
        if msg["type"] == "arrow":
            result = self._conn.query(sql).arrow()
            return True, [table_to_ipc(result).tobytes()]
        if msg["type"] == "exec":
            self._conn.execute(sql)
            return True, []
        raise ValueError(f"Unknown query type: {msg['type']}")

    def _handle_custom_msg(self, data: dict, buffers: list):
        print(f"{data=}, {buffers=}")
        start = time.time()

        uuid = data["uuid"]
        sql = data["sql"]
        command = data["type"]
        try:
            if command == "arrow":
                result = self._conn.query(sql).arrow()
                sink = pa.BufferOutputStream()
                with pa.ipc.new_stream(sink, result.schema) as writer:
                    writer.write(result)
                buf = sink.getvalue()
                self.send({"type": "arrow", "uuid": uuid}, buffers=[buf.to_pybytes()])
            elif command == "exec":
                self._conn.execute(sql)
                self.send({"type": "exec", "uuid": uuid})
            elif command == "json":
                result = self._conn.query(sql).df()
                json = result.to_dict(orient="records")
                self.send({"type": "json", "uuid": uuid, "result": json})
            else:
                raise ValueError(f"Unknown command {command}")
        except Exception as e:
            logger.exception("Error processing query")
            self.send({"error": str(e), "uuid": uuid})

        total = round((time.time() - start) * 1_000)
        if total > SLOW_QUERY_THRESHOLD:
            logger.warning(f"DONE. Slow query { uuid } took { total } ms.\n{ sql }")
        else:
            logger.info(f"DONE. Query { uuid } took { total } ms.\n{ sql }")
