# quak /kwæk/

an [anywidget](https://github.com/manzt/anywidget) for data that talks like a
duck

## install

```sh
pip install quak
```

## usage

The easiest way to get started with `quak` is using the IPython
[cell magic](https://ipython.readthedocs.io/en/stable/interactive/magics.html).

```python
%load_ext quak
```

```python
import pandas as pd

df = pd.read_csv("https://raw.githubusercontent.com/vega/vega-datasets/main/data/airports.csv")
df
```

Any cell that returns an object implementing the `__dataframe__` API will be
rendered using `quak.Widget`, rather than the default renderer.

Alternatively, you can use `quak.Widget` directly:

```python
import polars as pl

df = pl.read_csv("https://raw.githubusercontent.com/vega/vega-datasets/main/data/airports.csv")
quak.Widget(df)
```

`quak` is dataframe agnostic, meaning it can be used with any dataframe library
that supports
[Python dataframe interchange protocol](https://data-apis.org/dataframe-protocol/latest/purpose_and_scope.html).

## development

Development of `quak` requires both `rye` (for Python) and `deno` (for
TypeScript).

If you want to prototype with the Python notebook examples, you will need to
start the Deno build script in development mode:

```sh
deno task dev
```

and then start the Python notebook server with `rye`:

```sh
rye sync
rye run jupyter lab
```

Alternatively, you can just work on the TypeScript side of things by running:

```sh
deno task vite
```

and editing `./lib/example.ts`.
