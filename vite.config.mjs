/**
 * @module
 *
 * A custom vite config for working on the `quak` TypeScript code outside of a
 * Python environment (i.e., just the front end).
 *
 * @example
 * ```sh
 * $ deno run -A npm:vite
 * $ npx vite
 * ```
 *
 * It does the same "trick" as the other build script to resolve modules to
 * external urls using the importmap in `deno.json`.
 */
import * as fs from "node:fs/promises";

let importmap = await fs
	.readFile(new URL("deno.json", import.meta.url), { encoding: "utf-8" })
	.then(JSON.parse);

export default {
	resolve: { alias: importmap.imports },
};
