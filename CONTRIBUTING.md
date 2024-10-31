# contributing guide

## development

**quak** is a monorepo, meaning the repo holds multiple packages. Since the
project contains both JavaScript and Python components, **quak** requires both
`uv` (for Python) and `deno` (for TypeScript).

If you want to develop in the notebooks (`./examples/`), you will need to run
both `deno` (to (re)build the TypeScript) and `uv` (to start the Jupyter
notebook):

```sh
deno task dev
```

and then start the Python notebook server with `uv`:

```sh
uv run jupyter lab
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
deno task check

# python
uv run ruff check --fix
uv run ruff format
```

## code structure

Entry points to be aware of:

- `./src/` contains the Python package source code
- `./lib/` contains the TypeScript source code
