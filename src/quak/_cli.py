from __future__ import annotations

import argparse
import sys
from pathlib import Path

import bottle
import duckdb
import webview

from ._util import table_to_ipc

server = bottle.Bottle()
con = duckdb.connect(":memory:")
SQL: str | None = None


HTML = (
    """
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>quak</title>
    <style>
      * {
        font-family: sans-serif;
      }
      body {
        margin: 0 1.5rem;
      }
      h1 {
        font-size: 2.25rem;
        font-weight: bold;
        text-align: center;
        margin-top: 1rem;
        margin-bottom: 1rem;
      }
      #datatable {
        margin-bottom: 1rem;
      }
    </style>
    <script type="module">
"""
    + open(Path(__file__).parent / "widget.js").read()
    + """

      let cliDt = await embed(datatable);
      cliDt.sql.subscribe((sql) => {
        let response = fetch("/api/sql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sql }),
        });
        console.log(response.status);
      });
    </script>
  <body>
    <div id="datatable"></div>
  </body>
</html>
"""
)


@server.route("/")
def index() -> str:
    return HTML


@server.route("/api/query")
def query() -> bytes | str | None:
    sql = bottle.request.query.sql
    format_ = bottle.request.query.format
    try:
        result = con.execute(sql)
    except Exception as e:
        return str(e)
    match format_:
        case "arrow":
            bottle.response.content_type = "application/octet-stream"
            buf = table_to_ipc(result.arrow())
            return buf.tobytes()
        case "json":
            bottle.response.content_type = "application/json"
            return result.pl().write_json()
        case "exec":
            return None
        case _:
            raise ValueError(f"Unsupported format: {format_}")


@server.post("/api/sql")
def post_sql() -> None:
    global SQL
    SQL = bottle.request.json.get("sql")


def peek_stdin(num_bytes: int) -> bytes | None:
    import sys

    if sys.stdin.isatty():
        # stdin is connected to a terminal, not a pipe
        return None

    try:
        pos = sys.stdin.buffer.tell()
        peeked_data = sys.stdin.buffer.peek(num_bytes)[0:num_bytes]
        # Reset the position
        sys.stdin.buffer.seek(pos)
        return peeked_data
    except OSError:
        # This can happen if stdin is not seekable
        return None


def resolve_source(filename: str, format: str | None) -> str:
    if filename == "-":
        filename = "/dev/stdin"

    match format or filename.split(".")[-1]:
        case "parquet" | "pq":
            return f'read_parquet("{filename}")'
        case "csv":
            return f'read_csv("{filename}")'
        case "tsv":
            return f'read_csv("{filename}", sep="\\t")'
        case "json":
            return f'read_json("{filename}")'

    parquet_magic = b"PAR1"
    if filename == "/dev/stdin" and peek_stdin(len(parquet_magic)) == parquet_magic:
        return f'read_ipc("{filename}")'
    else:
        return f'read_csv("{filename}")'


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the quak CLI.")
    parser.add_argument("filename", help="Input filename")
    parser.add_argument(
        "--format", help="Input file format (default: guess from filename)"
    )
    parser.add_argument(
        "--sql", action="store_true", help="Print the SQL query and exit"
    )
    parser.add_argument(
        "--pretty", action="store_true", help="Pretty print the SQL query"
    )

    args = parser.parse_args()
    return args


def main() -> None:
    global SQL
    args = parse_args()
    source = resolve_source(args.filename, args.format)

    con.execute(f"CREATE TABLE df AS (SELECT * FROM {source})")
    webview.create_window("quak", server, width=940, height=600)
    webview.start()

    if not SQL or not args.sql:
        return

    if args.pretty:
        import sqlglot

        SQL = sqlglot.transpile(SQL, pretty=True)[0]

    sys.stdout.write(SQL.replace('FROM "df"', f"FROM {source}"))


if __name__ == "__main__":
    main()
