# quak-cli

experimental cli for launching quak from the command line. not officially
distributed.

## usage

```sh
quak ./path/to/data.parquet
```

when the webview is closed, the SQL query is printed to stdout, allowing
composition within unix pipelines:

```sh
quak data.parquet | xargs -0 duckdb -json -c | jq
```

## install

> [!WARNING]
> Unofficial, install from source. Expect breaking changes.

From the root of the repository:

```sh
cargo install --path=./cli --locked
```

Or, if you want to install the binary without cloning the repository:

```sh
cargo install --git=https://github.com/manzt/quak --branch=main --root=cli --locked quak
```

## development

```sh
cargo run -- ./path/to/data.parquet
```
