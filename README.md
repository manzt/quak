# quak /kwæk/

an [anywidget](https://github.com/manzt/anywidget) for data that talks like a
duck

## install

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

df = pl.read_csv("https://raw.githubusercontent.com/vega/vega-datasets/main/data/airports.csv")
quak.Widget(df)
```

## development

**quak** requires both `rye` (for Python) and `deno` (for TypeScript).

If you want to develop in the notebooks (`./examples/`), you will need to run
both `deno` (to (re)build the TypeScript) and `rye` (to start the Jupyter
notebook):

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

We check linting and formatting in CI:

```sh
# typescript
deno lint
deno fmt
deno task typecheck

# python
rye lint
rye format
```

> [!NOTE]
> Why the weird TypeScript stuff? In practice, hybrid Python/JS repos get messy
> with npm and `node_modules`. With Deno there is no `node_modules`, and the
> tool handles type-checking, linting, and formatting. The extra build scripts
> serve to make nice development ergonamics within and outside of Jupyter.
