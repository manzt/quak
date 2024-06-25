# quak /kwæk/

an [anywidget](https://github.com/manzt/anywidget) for data that talks like a duck

## install

```sh
pip install quak
```

## usage

```python
import quak
import polars as pl

source = "https://raw.githubusercontent.com/vega/vega-datasets/main/data/airports.csv"
df = pl.read_csv(source)

quak.Widget(df)
```

`quak` is dataframe agnostic, meaning it can be used with any dataframe
library that supports [Python dataframe interchange
protocol](https://data-apis.org/dataframe-protocol/latest/purpose_and_scope.html).

```python
import pandas as pd

df = pd.read_csv(source, dtype_backend="pyarrow", engine="pyarrow")

quak.Widget(df)
```

## development

```sh
rye sync
rye run jupyter lab
```
