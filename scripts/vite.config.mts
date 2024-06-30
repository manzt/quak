/**
 * @module
 *
 * This module contains a custom vite config for working on the `quak`
 * TypeScript code outside of a Python environment (i.e., just the front end).
 *
 * @example
 * ```sh
 * $ deno run -A npm:vite -c scripts/vite.config.mts
 * ```
 *
 * It does the same "trick" as the other build script to resolve modules to
 * external urls using the importmap in `deno.json`.
 */
import { defineConfig } from "npm:vite";

export default defineConfig({
	resolve: {
		alias: await Deno
			.readTextFile(new URL("../deno.json", import.meta.url))
			.then(JSON.parse)
			.then((d) => d.imports),
	},
});
