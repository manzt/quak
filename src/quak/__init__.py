"""An anywidget for data that talks like a duck."""

from ._version import __version__
from ._widget import Widget

__all__ = ["Widget", "__version__"]


def load_ipython_extension(ipython) -> None:  # type: ignore[no-untyped-def]
    """Extend IPython with the interactive quak display for dataframes."""
    import duckdb
    from IPython.core.formatters import DisplayFormatter

    from ._util import is_arrow_ipc, is_dataframe_api_obj

    class QuakDisplayFormatter(DisplayFormatter):
        def format(self, obj, include=None, exclude=None):
            # special case for duckdb relations
            if isinstance(obj, duckdb.DuckDBPyRelation):
                obj = obj.arrow()
            if is_arrow_ipc(obj) or is_dataframe_api_obj(obj):
                obj = Widget(obj)
            return super().format(obj, include, exclude)

    ipython.display_formatter = QuakDisplayFormatter()


def unload_ipython_extension(ipython) -> None:  # type: ignore[no-untyped-def]
    """Unload the quak extension from IPython."""
    from IPython.core.formatters import DisplayFormatter

    ipython.display_formatter = DisplayFormatter()
