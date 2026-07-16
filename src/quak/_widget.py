"""quak's DataTable — a boro client."""

from __future__ import annotations

import datetime
import pathlib
import typing
import warnings

import boro
import duckdb
import traitlets
from signals import Signal

from ._util import (
    arrow_table_from_dataframe_protocol,
    arrow_table_from_ipc,
    has_pycapsule_stream_interface,
    is_arrow_ipc,
    is_dataframe_api_obj,
    is_polars,
)

if typing.TYPE_CHECKING:
    from collections.abc import Callable

__all__ = ["ColumnHandle", "DataTable", "Widget"]

_WIDGET_JS = pathlib.Path(__file__).parent / "widget.js"

SelectionValue = list | None


def _structural_equals(a: object, b: object) -> bool:
    return bool(a == b)


def _normalize(value: object) -> object:
    """Normalize a selection value for the wire (naked scalars / flat lists)."""
    if value is None:
        return None
    if isinstance(value, tuple):
        value = list(value)
    if isinstance(value, (str, bool)):
        # point selections are always list-valued
        value = [value]
    if isinstance(value, list):
        return [_normalize_element(v) for v in value]
    return value


def _normalize_element(value: object) -> object:
    if isinstance(value, datetime.datetime):
        return value.timestamp() * 1000
    if isinstance(value, datetime.date):
        dt = datetime.datetime(value.year, value.month, value.day, tzinfo=datetime.UTC)
        return dt.timestamp() * 1000
    return value


class ColumnHandle:
    """One column's selection, with a signal-like verb API.

    Reads track inside ``signals.effect``/``computed``; writes go to the
    widget's selection trait (the single source of truth) and flow back
    through the widget's observer — the same one-way loop the front-end uses.

    >>> col = table.col("delay")
    >>> col.set([5, 30])     # brush from Python
    >>> col()                # [5, 30]
    >>> col.kind             # "interval" (set by the front-end after render)
    >>> col.reset()
    """

    def __init__(self, widget: DataTable, name: str) -> None:
        self._widget = widget
        self._name = name
        self._signal: Signal = Signal(
            widget._selections.get(name), equals=_structural_equals
        )

    def get(self) -> SelectionValue:
        """Return the current selection (``None`` when unselected)."""
        return self._signal.get()

    def __call__(self) -> SelectionValue:
        """Alias for :meth:`get` — tracks inside effects."""
        return self.get()

    def set(self, value: object) -> None:
        """Set this column's selection.

        Interval columns take ``[lo, hi]`` (numbers, or datetimes — converted
        to epoch milliseconds); point columns take a list of values (a bare
        string is wrapped for convenience). ``None`` clears the selection.
        """
        value = _normalize(value)
        selections = dict(self._widget._selections)
        if value is None:
            selections.pop(self._name, None)
        else:
            selections[self._name] = value
        # reassignment (not mutation) so traitlets syncs the change
        self._widget._selections = selections

    def reset(self) -> None:
        """Clear this column's selection."""
        self.set(None)

    def subscribe(self, fn: Callable[[SelectionValue], None]) -> Callable[[], None]:
        """Subscribe to selection changes; returns an unsubscribe function."""
        return self._signal.subscribe(fn)

    @property
    def kind(self) -> str | None:
        """``"interval"`` | ``"point"``, or ``None`` before the first render."""
        return self._widget._selection_kinds.get(self._name)

    def __repr__(self) -> str:
        return f"ColumnHandle({self._name!r}, kind={self.kind!r}, value={self.get()!r})"


class DataTable(boro.Client):
    """An interactive, cross-filtered table for tabular data.

    Composable form — share a coordinator and selection with other boro
    clients:

    >>> coord = boro.Coordinator.connect(con)
    >>> sel = boro.Selection.crossfilter(coord)
    >>> table = DataTable(coord, "flights", selection=sel)

    Zero-ceremony form — quak ingests the dataframe and creates the
    coordinator + crossfilter selection internally (reachable at
    ``.coordinator`` / ``.selection``):

    >>> table = DataTable(df)
    """

    _esm = _WIDGET_JS

    _table_name = traitlets.Unicode().tag(sync=True)
    # column -> selection value (naked scalars / flat lists; absent = none).
    # The front-end's publish pipelines are the only trait -> clause encoders.
    _selections = traitlets.Dict().tag(sync=True)
    # column -> "interval" | "point", written by the front-end from the schema
    _selection_kinds = traitlets.Dict().tag(sync=True)

    # The current sort, written by the front-end on header clicks (read-only)
    sort = traitlets.List(traitlets.Dict()).tag(sync=True)

    def __init__(
        self,
        source: object,
        table: str = "df",
        *,
        selection: boro.Selection | None = None,
    ) -> None:
        """Create a DataTable.

        Parameters
        ----------
        source:
            A ``boro.Coordinator``, a DuckDB connection, or anything
            dataframe-like (Arrow C Stream, Arrow IPC bytes, or a
            ``__dataframe__`` object).
        table:
            The table name to display (and to register a dataframe under).
        selection:
            The ``boro.Selection`` this table filters by and publishes its
            column selections to. Defaults to a new crossfilter selection.
        """
        coord, conn = _resolve_coordinator(source, table)
        if selection is None:
            selection = boro.Selection.crossfilter(coord)
        self._conn = conn
        self._columns: dict[str, ColumnHandle] = {}
        super().__init__(
            coord=coord,
            selection=selection,
            _table_name=table,
        )
        self.observe(self._fan_out_selections, names="_selections")

    @property
    def coordinator(self) -> boro.Coordinator:
        """The ``boro.Coordinator`` this table queries through."""
        return self.coord

    @property
    def selection(self) -> boro.Selection | None:
        """The ``boro.Selection`` holding this table's filters."""
        return self.filter_by

    def col(self, name: str) -> ColumnHandle:
        """Return the (memoized) handle for one column's selection."""
        handle = self._columns.get(name)
        if handle is None:
            handle = self._columns[name] = ColumnHandle(self, name)
        return handle

    def reset(self) -> None:
        """Clear every column selection."""
        self._selections = {}

    @property
    def sql(self) -> str:
        """The SQL query for the current view (filters + sort).

        Derived from the selection's synced clauses and the ``sort`` trait —
        the same query :meth:`data` executes.
        """
        sel = self.filter_by
        clauses = sel.value if sel is not None else []
        predicates = [c["sql"] for c in clauses if c.get("sql")]
        where = (
            f" WHERE {' AND '.join(f'({p})' for p in predicates)}" if predicates else ""
        )
        entries = [e for e in self.sort if e.get("dir") in ("asc", "desc")]
        order = (
            " ORDER BY "
            + ", ".join(f'"{e["column"]}" {e["dir"].upper()}' for e in entries)
            if entries
            else ""
        )
        return f'SELECT * FROM "{self._table_name}"{where}{order}'

    def data(self) -> object:
        """Return the current view (filters + sort applied) as a relation."""
        if self._conn is not None:
            return self._conn.query(self.sql)
        # composable path: query through the coordinator's data source.
        # (Python-side predicate composition is quak-prototyped, boro-destined.)
        return self.coord._source.query(self.sql)

    def _fan_out_selections(self, change: dict) -> None:
        new = change["new"] or {}
        for name, handle in self._columns.items():
            handle._signal.set(new.get(name))


def _resolve_coordinator(
    source: object, table: str
) -> tuple[boro.Coordinator, duckdb.DuckDBPyConnection | None]:
    if isinstance(source, boro.Coordinator):
        return source, None
    if isinstance(source, duckdb.DuckDBPyConnection):
        conn = source
    else:
        conn = duckdb.connect(":memory:")
        conn.register(table, _to_arrow_table(source))
    return boro.Coordinator.connect(conn), conn


def _to_arrow_table(data: object) -> object:
    if is_polars(data):
        # FIXME: special case pl.DataFrame for now until DuckDB
        # supports `[string,bytes]_view` Arrow data types
        # see: https://github.com/manzt/quak/issues/41
        # Polars .to_arrow() will cast to non-view array types for us
        return data.to_arrow()
    if has_pycapsule_stream_interface(data):
        # NOTE: materialize the stream into an in-memory Arrow table so that
        # repeated queries are possible.
        import pyarrow as pa

        return pa.table(data)
    if is_arrow_ipc(data):
        return arrow_table_from_ipc(data)
    if is_dataframe_api_obj(data):
        return arrow_table_from_dataframe_protocol(data)
    raise ValueError(
        "input must be a boro.Coordinator, DuckDB connection, DataFrame-like, "
        "an Arrow IPC table, or an Arrow object exporting the Arrow C Stream "
        "interface."
    )


class Widget(DataTable):
    """Deprecated alias for :class:`DataTable`."""

    def __init__(self, data: object, *, table: str = "df") -> None:
        """Create a DataTable (deprecated entry point)."""
        warnings.warn(
            "quak.Widget is deprecated; use quak.DataTable instead.",
            DeprecationWarning,
            stacklevel=2,
        )
        super().__init__(data, table)
