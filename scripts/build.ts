/**
 * @module
 *
 * This module contains a custom build and development script for the
 * TypeScript source code in `quak`.
 *
 * @example
 * ```sh
 * $ deno run -A scripts/build.ts
 * $ deno run -A scripts/build.ts --watch
 * $ deno run -A scripts/build.ts --bundle
 * ```
 *
 * It has two build modes:
 *
 * 1.) Unbundled (default) - Resolves the importmap in `deno.json`
 *     to external URLs (e.g., `d3` -> `https://esm.sh/d3@7`). This
 *     means the resulting bundle is much smaller and doesn't require
 *     downloading third-party dependencies locally.
 *
 * 2.) Bundled - Resolves the importmap in `deno.json` using Deno
 *     to download and install dependencies.
 *
 * For now, the former is preferred because it is a much smaller and
 * simple for esbuild. If there is a compelling "offline" usecase, we
 * can consider the latter as a default.
 */
/// <reference lib="deno.ns" />
import * as esbuild from "npm:esbuild@0.20.2";
import { denoPlugins } from "jsr:@luca/esbuild-deno-loader@^0.10.3";
import { mapImports } from "./npm-specifier-to-cdn-url.mjs";

let root = new URL("..", import.meta.url);

// Hack: use importmap to make esbuild aliases.
// This relies on import-map resolving to HTTP urls.
let denoJson = await Deno
	.readTextFile(new URL("deno.json", root))
	.then(JSON.parse);

let options: esbuild.BuildOptions = {
	alias: mapImports(denoJson.imports),
	entryPoints: ["./lib/widget.ts"],
	outfile: "./src/quak/widget.js",
	bundle: true,
	format: "esm",
	sourcemap: "inline",
	loader: { ".css": "text" },
	logLevel: "info",
};

if (Deno.args.includes("--watch")) {
	let ctx = await esbuild.context(options);
	await ctx.watch();
} else {
	if (Deno.args.includes("--bundle")) {
		// Remove the importmap aliases and defer to Deno
		// loader to download and bundle deps locally
		delete options.alias;
		delete options.sourcemap;
		options.plugins = [...denoPlugins({
			importMapURL: new URL("deno.json", root).href,
		})];
	}
	await esbuild.build(options);
}
