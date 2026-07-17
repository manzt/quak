"""A performant WebGL scatter that renders x/y positions on a basketball court.

``CourtScatter`` is a :class:`boro.Client`. It renders the rows of a table as a
regl point cloud (fast enough for hundreds of thousands of shots), colored by a
categorical column. It is designed to be composed with other boro clients — a
:class:`quak.DataTable`, a histogram — through a shared selection:

- **Consume side** (``filter_by``): the court re-queries whenever the shared
  selection changes, so it always shows *the current selection from other
  clients* (filter the table → the court follows).
- **Drill-down** (the ``narrow`` trait): dragging a box on the court ANDs a
  rectangle onto the court's *own* query — a filter that extends the incoming
  one but is applied **locally only**, so it never propagates back to the
  DataTable or any other upstream client. Each box narrows further; the boxes
  are inspectable and settable from Python.

Wire it filter-only so it can never disturb its parents::

    coord = boro.Coordinator.connect(con)
    sel = boro.Selection.crossfilter(coord)
    table = quak.DataTable(coord, "shots", selection=sel)
    court = CourtScatter(coord, table="shots", x="x", y="y",
                         color="zone", selection=(sel, None))
"""

from __future__ import annotations

import pathlib

import boro
import traitlets

# NBA half-court extent in shot-chart coords (tenths of a foot, hoop at the
# origin, y increasing away from the baseline).
COURT_X = (-250.0, 250.0)
COURT_Y = (-47.5, 422.5)

# A box in data coordinates: [[x0, x1], [y0, y1]].
Box = list


class CourtScatter(boro.Client):
    """X/Y scatter on a basketball court with a local box drill-down."""

    _esm = pathlib.Path(__file__).parent / "court_scatter.js"

    table = traitlets.Unicode().tag(sync=True)
    x = traitlets.Unicode().tag(sync=True)
    y = traitlets.Unicode().tag(sync=True)
    color = traitlets.Unicode(allow_none=True, default_value=None).tag(sync=True)
    width = traitlets.Int(520).tag(sync=True)
    height = traitlets.Int(500).tag(sync=True)
    point_size = traitlets.Float(4.0).tag(sync=True)
    opacity = traitlets.Float(0.7).tag(sync=True)
    # Fixed drawing domain; defaults to a full NBA half court.
    xdomain = traitlets.List(allow_none=True, default_value=None).tag(sync=True)
    ydomain = traitlets.List(allow_none=True, default_value=None).tag(sync=True)
    # Drill-down stack: list of [[x0, x1], [y0, y1]] boxes, ANDed together and
    # applied only to this widget's own query.
    narrow = traitlets.List(default_value=[]).tag(sync=True)

    def __init__(  # noqa: PLR0913
        self,
        coord: boro.Coordinator,
        *,
        table: str,
        x: str,
        y: str,
        color: str | None = None,
        width: int = 520,
        height: int = 500,
        point_size: float = 4.0,
        opacity: float = 0.7,
        xdomain: tuple[float, float] | None = COURT_X,
        ydomain: tuple[float, float] | None = COURT_Y,
        **kwargs: object,
    ) -> None:
        super().__init__(
            coord=coord,
            table=table,
            x=x,
            y=y,
            color=color,
            width=width,
            height=height,
            point_size=point_size,
            opacity=opacity,
            xdomain=list(xdomain) if xdomain is not None else None,
            ydomain=list(ydomain) if ydomain is not None else None,
            **kwargs,
        )

    def push_narrow(self, box: Box) -> None:
        """Append one drill-down box ``[[x0, x1], [y0, y1]]`` to the stack."""
        self.narrow = [*self.narrow, box]

    def pop_narrow(self) -> None:
        """Remove the most recent drill-down box."""
        self.narrow = self.narrow[:-1]

    def clear_narrow(self) -> None:
        """Clear the local drill-down (does not touch the shared selection)."""
        self.narrow = []
