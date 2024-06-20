# ipytable

## install

```sh
pip install ipytable
```

## usage

```python
import ipytable
import polars as pl

source = "https://raw.githubusercontent.com/vega/vega-datasets/main/data/airports.csv"
df = pl.read_csv(source)

ipytable.Widget(df)
```

`ipytable` is dataframe agnostic, meaning it can be used with any dataframe
library that supports [Python dataframe interchange
protocol](https://data-apis.org/dataframe-protocol/latest/purpose_and_scope.html).

```python
import pandas as pd

df = pd.read_csv(source, dtype_backend="pyarrow", engine="pyarrow")

ipytable.Widget(df)
```

## development

```sh
rye sync
rye run jupyter lab
```
