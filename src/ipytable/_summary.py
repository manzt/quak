"""Summary module for summarizing Arrow field types using DuckDB."""

from __future__ import annotations

import typing

import msgspec
import numpy as np
import pyarrow as pa

if typing.TYPE_CHECKING:
    import duckdb


class ValueCounts(msgspec.Struct):
    key: list[typing.Any]
    value: list[int]
    num_unique: int = 0
    null_count: int = 0
    kind: str = "counts"


class Histogram(msgspec.Struct):
    hist: list[int]
    bin_edges: list[float]
    null_count: int = 0
    kind: str = "hist"


Summary = typing.Union[ValueCounts, Histogram]
ThresholdMethod = typing.Literal["auto", "freedman-diaconis", "scott", "sturges"]


def stringify_field(field: pa.Field) -> str:
    """Stringify field name for SQL queries if it contains spaces."""
    return f'"{field.name}"' if " " in field.name else field.name


def null_count(conn: duckdb.DuckDBPyConnection, table: str, field: pa.Field):
    col = stringify_field(field)
    row = conn.query(f"SELECT COUNT(*) FROM {table} WHERE {col} IS NULL").fetchone()
    assert row, "No rows returned from query"
    return row[0]


def count_and_group_unique_values(
    conn: duckdb.DuckDBPyConnection, table: str, field: pa.Field
):
    col = stringify_field(field)
    # We ignore NULL from WITH clause, so we can group unique values together in the end
    query = f"""
    WITH value_counts AS (
        SELECT
            {col} AS value,
            COUNT(*) AS count
        FROM {table}
        WHERE {col} IS NOT NULL
        GROUP BY {col}
    )
    SELECT
        CASE
            WHEN count = 1 THEN NULL
            ELSE value
        END AS grouped_value,
        SUM(count)::INT AS total_count
    FROM value_counts
    GROUP BY grouped_value;
    """
    result = conn.query(query).to_arrow_table()
    key = result.column(0).to_pylist()
    value = result.column(1).to_pylist()
    try:
        special_value = key.index(None)
        key.pop(special_value)
        num_unique = value.pop(special_value)
    except ValueError:
        num_unique = 0
    return ValueCounts(
        key=key,
        value=value,
        num_unique=num_unique,
        # TODO: It might be possible get the null_count, num_unique and value_counts
        # in one query but this is more readable.
        null_count=null_count(conn, table, field),
    )


def histogram(
    conn: duckdb.DuckDBPyConnection,
    table: str,
    field: pa.Field,
    method: ThresholdMethod = "auto",
):
    # TODO: duckdb has histogram function, but it is not implemented in Python
    # so we need to extract the value and do it in Python/numpy

    col = stringify_field(field)
    result = conn.execute(f"SELECT {col} FROM {table} WHERE {col} NOT NULL")
    column = result.fetch_arrow_table().column(0)

    if pa.types.is_temporal(field.type):
        # bin in int64
        column = column.cast(pa.int64())

    values = column.to_numpy()
    values = values[~np.isnan(values)]

    if method == "auto":
        bins = np.histogram_bin_edges(values, bins="scott")
        bins = min(len(bins), 200)
    elif method == "freedman-diaconis":
        bins = np.histogram_bin_edges(values, bins="fd")
    elif method == "scott":
        bins = np.histogram_bin_edges(values, bins="scott")
    elif method == "sturges":
        bins = np.histogram_bin_edges(values, bins="sturges")
    else:
        raise ValueError(f"Unknown method: {method}")

    hist, bin_edges = np.histogram(values, bins=bins)

    if pa.types.is_temporal(field.type):
        bin_edges = bin_edges.astype(np.datetime64)

    return Histogram(
        hist=hist.tolist(),
        bin_edges=bin_edges.tolist(),
        null_count=null_count(conn, table, field),
    )


def summarize(conn: duckdb.DuckDBPyConnection, table: str, field: pa.Field) -> Summary:
    if pa.types.is_integer(field.type) or pa.types.is_floating(field.type):
        return histogram(conn, table, field)

    if (
        pa.types.is_boolean(field.type)
        or pa.types.is_string(field.type)
        or pa.types.is_large_string(field.type)
    ):
        return count_and_group_unique_values(conn, table, field)

    if (
        pa.types.is_timestamp(field.type)
        or pa.types.is_date(field.type)
        or pa.types.is_time(field.type)
    ):
        return histogram(conn, table, field)

    if pa.types.is_decimal(field.type):
        raise NotImplementedError("Decimal types are not supported yet.")

    if pa.types.is_duration(field.type):
        raise NotImplementedError("Duration types are not supported yet.")

    if (
        pa.types.is_binary(field.type)
        or pa.types.is_large_binary(field.type)
        or pa.types.is_binary_view(field.type)
        or pa.types.is_string_view(field.type)
        or pa.types.is_fixed_size_binary(field.type)
        or pa.types.is_map(field.type)
        or pa.types.is_dictionary(field.type)
        or pa.types.is_primitive(field.type)
        or pa.types.is_struct(field.type)
        or pa.types.is_union(field.type)
        or pa.types.is_nested(field.type)
        or pa.types.is_run_end_encoded(field.type)
        or pa.types.is_list(field.type)
        or pa.types.is_large_list(field.type)
        or pa.types.is_fixed_size_list(field.type)
        or pa.types.is_null(field.type)
    ):
        raise NotImplementedError(
            f"Summarization for {field.dtype} type is not implemented."
        )

    raise TypeError(f"Unsupported field type: {field.type}")
