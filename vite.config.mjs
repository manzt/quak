/**
 * @module
 *
 * A custom vite config for working on the `quak` TypeScript code outside of a
 * Python environment (i.e., just the front end).
 *
 * @example
 * ```sh
 * $ npx vite
 * $ deno run -A npm:vite
 * ```
 *
 * It does the same "trick" as the other build script to resolve modules to
 * external urls using the importmap in `deno.json`.
 */
import * as fs from "node:fs/promises";
import { mapImports } from "./scripts/npm-specifier-to-cdn-url.mjs";

let importmap = await fs
	.readFile(new URL("deno.json", import.meta.url), { encoding: "utf-8" })
	.then(JSON.parse);

/** @type {import("npm:vite").UserConfig} */
export default {
	resolve: {
		alias: {
			...mapImports(importmap.imports),
			"../deps/d3.ts": "https://esm.sh/d3@7",
		},
	},
};
