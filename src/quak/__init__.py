"""An anywidget for data that talks like a duck."""

from typing import Callable

from ._util import has_pycapsule_stream_interface
from ._version import __version__
from ._widget import Widget

__all__ = ["Widget", "__version__"]


def default_formatter(obj: object) -> object:
    """Turns anything that looks like a dataframe into a quak widget."""  # noqa: D401
    import duckdb

    from ._util import is_arrow_ipc, is_dataframe_api_obj

    if isinstance(obj, duckdb.DuckDBPyRelation):
        obj = obj.arrow()
    if (
        has_pycapsule_stream_interface(obj)
        or is_arrow_ipc(obj)
        or is_dataframe_api_obj(obj)
    ):
        obj = Widget(obj)
    return obj


def set_formatter(func: Callable[[object], object] = default_formatter) -> None:
    """Set the formatter for displaying data in quak after running `%load_ext quak`.

    Parameters
    ----------
    func:
        Takes an object and optionally transforms it into something that ipython
        can display.

    Examples
    --------
    Since quak requires doing expensive summary statistics on the data,
    you may want the quak explorer for any ibis tables that are backed by analytical
    databases like duckdb or bigquery, but not for remote transactional
    databases like postgres or mysql.
    >>> import ibis
    >>> import quak
    >>> def my_formatter(x):
    ...     remote_backends = ["postgres", "mysql"]
    ...     if isinstance(x, ibis.Table) and x.get_backend().name in remote_backends:
    ...         return x
    ...     return quak.default_formatter(x)
    >>> quak.set_formatter(my_formatter)
    >>> %load_ext quak

    This will render the ibis Table as a quak widget for duckdb:
    >>> ibis.duckdb.connect("mydb.duckdb").table("mytable")

    But not for postgres:

    >>> ibis.postgres.connect("<url>").table("mytable")

    """
    global _formatter
    _formatter = func


_formatter = default_formatter


def load_ipython_extension(ipython) -> None:  # type: ignore[no-untyped-def]
    """Extend IPython with the interactive quak display for dataframes."""
    from IPython.core.formatters import DisplayFormatter

    class QuakDisplayFormatter(DisplayFormatter):
        def format(self, obj, include=None, exclude=None):
            formatted = _formatter(obj)
            return super().format(formatted, include, exclude)

    ipython.display_formatter = QuakDisplayFormatter()


def unload_ipython_extension(ipython) -> None:  # type: ignore[no-untyped-def]
    """Unload the quak extension from IPython."""
    from IPython.core.formatters import DisplayFormatter

    ipython.display_formatter = DisplayFormatter()
