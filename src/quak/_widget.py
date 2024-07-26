from __future__ import annotations

import logging
import pathlib
import time

import anywidget
import duckdb
import traitlets

from ._util import (
    arrow_table_from_dataframe_protocol,
    arrow_table_from_ipc,
    get_columns,
    is_arrow_ipc,
    table_to_ipc,
)

logger = logging.getLogger(__name__)
logger.addHandler(logging.NullHandler())

SLOW_QUERY_THRESHOLD = 5000


class Widget(anywidget.AnyWidget):
    """An anywidget for displaying tabular data in a table."""

    _esm = pathlib.Path(__file__).parent / "widget.js"
    _table_name = traitlets.Unicode().tag(sync=True)
    _columns = traitlets.List(traitlets.Unicode()).tag(sync=True)
    sql = traitlets.Unicode().tag(sync=True)
    # Whether data cube indexes should be created as temp tables
    temp_indexes = traitlets.Bool().tag(sync=True)

    def __init__(self, data, *, table: str = "df"):
        if isinstance(data, duckdb.DuckDBPyConnection):
            conn = data
        else:
            conn = duckdb.connect(":memory:")
            if is_arrow_ipc(data):
                arrow_table = arrow_table_from_ipc(data)
            else:
                arrow_table = arrow_table_from_dataframe_protocol(data)
            conn.register(table, arrow_table)
        self._conn = conn
        super().__init__(
            _table_name=table,
            _columns=get_columns(conn, table),
            temp_indexes=True,
            sql=f'SELECT * FROM "{table}"',
        )
        self.on_msg(self._handle_custom_msg)

    def _handle_custom_msg(self, data: dict, buffers: list):
        logger.debug(f"{data=}, {buffers=}")

        start = time.time()

        uuid = data["uuid"]
        sql = data["sql"]
        command = data["type"]
        try:
            if command == "arrow":
                result = self._conn.query(sql).arrow()
                buf = table_to_ipc(result)
                self.send({"type": "arrow", "uuid": uuid}, buffers=[buf])
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

    def data(self) -> duckdb.DuckDBPyRelation:
        """Return the current SQL as a DuckDB relation."""
        return self._conn.query(self.sql)
