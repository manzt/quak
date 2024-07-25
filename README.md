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

**quak** is a scalable data profiler for quickly scanning large tables.

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

Any cell that returns an object implementing the
[Python dataframe interchange protocol](https://data-apis.org/dataframe-protocol/latest/purpose_and_scope.html)
(i.e., a dataframe-like "thing") will be rendered using `quak.Widget`, rather
than the default renderer.

Alternatively, you can use `quak.Widget` directly:

```python
import polars as pl
import quak

df = pl.read_csv("https://raw.githubusercontent.com/vega/vega-datasets/main/data/airports.csv")
quak.Widget(df)
```

## contributing

Contributors welcome! Check the [Contributors Guide](./CONTRIBUTING.md) to get
started. Note: I'm wrapping up my PhD, so I might be slow to respond. Please
open an issue before contributing a new feature.
