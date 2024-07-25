<h1>
<p align="center">
  <img src="./logo.svg" alt="quak logo" width="80">
  <br>quak /kwæk/
</h1>
  <p align="center">
    <span>an <a href="https://github.com/manzt/anywidget">anywidget</a> for data that talks like a duck</span>
  </p>
</p>

## about

**quak** is a scalable data profiler for quickly scanning large tables,
capturing interactions as executable SQL queries.

- **interactive** 🖱️ mouse over column summaries, cross-filter, sort, and slice rows.
- **fast** ⚡ built with [Mosaic](https://github.com/uwdata/mosaic); views are expressed as SQL queries lazily executed by [DuckDB](https://duckdb.org/).
- **flexible** 🔄 supports many data types and formats via [Apache Arrow](https://arrow.apache.org/docs/index.html) and the [dataframe interchange protocol](https://data-apis.org/dataframe-protocol/latest/purpose_and_scope.html).
- **reproducible** 📓 a UI for building complex SQL queries; materialize views in the kernel for further analysis.

## install

> [!WARNING]
> **quak** is a prototype exploring a high-performance data profiler based on
> anywidget. It is not production-ready. Expect bugs. Open-sourced for SciPy
> 2024.

```sh
pip install quak
```

## usage

The easiest way to get started with **quak** is using the IPython
[cell magic](https://ipython.readthedocs.io/en/stable/interactive/magics.html).

```python
%load_ext quak
```

```python
import pandas as pd

df = pd.read_csv("https://raw.githubusercontent.com/vega/vega-datasets/main/data/airports.csv")
df
```

**quak** hooks into Jupyter's display mechanism to automatically render any
dataframe-like object (implementing the [Python dataframe interchange
protocol](https://data-apis.org/dataframe-protocol/latest/purpose_and_scope.html))
using `quak.Widget` instead of the default display.

Alternatively, you can use `quak.Widget` directly:

```python
import polars as pl
import quak

df = pl.read_csv("https://raw.githubusercontent.com/vega/vega-datasets/main/data/airports.csv")
widget = quak.Widget(df)
widget
```

### interacting with the data view

**quak** is a UI for quickly scanning and exploring large tables. However, it is
more than that. A side effect of quak's
[Mosaic](https://github.com/uwdata/mosaic)-based architecture is that it
captures all user interactions as _SQL queries_.

At any point, table state can be accessed as a _SQL query_ in Python:

```python
widget.sql # SELECT * FROM df WHERE ...
```

which can then be executed to materialize the data in the kernel for further analysis:

```python
widget.data() # returns duckdb.DuckDBPyRelation object
```

By ensuring queries are translated to code, **quak** makes it easy to generate
complex queries through user interactions that would be challenging to write
manually, while keeping them reproducible.

## contributing

Contributors welcome! Check the [Contributors Guide](./CONTRIBUTING.md) to get
started. Note: I'm wrapping up my PhD, so I might be slow to respond. Please
open an issue before contributing a new feature.
