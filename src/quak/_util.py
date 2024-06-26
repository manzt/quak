from __future__ import annotations

import typing

DataFrameObject = typing.Any

if typing.TYPE_CHECKING:
    import duckdb
    import pyarrow as pa


def is_dataframe_api_obj(obj: object) -> DataFrameObject:
    """Check if an object has a dataframe API."""
    method = getattr(obj, "__dataframe__", None)
    return callable(method)


def is_arrow_ipc(x: object) -> typing.TypeGuard[bytes | memoryview]:
    """Check if an object is an Arrow IPC message."""
    if not isinstance(x, (bytes, memoryview)):
        return False
    magic = b"ARROW1"
    if isinstance(x, memoryview):
        x = x.tobytes()
    return x[:6] == magic


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


def arrow_table_from_ipc(data: bytes | memoryview) -> pa.lib.Table:
    """Convert an Arrow IPC message to a pyarrow Table."""
    import io

    import pyarrow.feather as feather

    return feather.read_table(io.BytesIO(data))


def table_to_ipc(table: pa.lib.Table) -> memoryview:
    """Convert a pyarrow Table to an Arrow IPC message."""
    import io

    import pyarrow.feather as feather

    sink = io.BytesIO()
    feather.write_feather(table, sink, compression="uncompressed")
    return sink.getbuffer()


def record_batch_to_ipc(record_batch: pa.lib.RecordBatch) -> memoryview:
    """Convert a pyarrow RecordBatch to an Arrow IPC message."""
    import pyarrow as pa

    table = pa.Table.from_batches([record_batch], schema=record_batch.schema)
    return table_to_ipc(table)


def get_columns(conn: duckdb.DuckDBPyConnection, table_name: str) -> list[str]:
    """Determine the column names of a table in a database."""
    result = conn.execute(f"""
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = '{table_name}'
    """)
    rows = result.fetchall()
    return [row[0] for row in rows]
