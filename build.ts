/// <reference lib="deno.ns" />
import * as esbuild from "npm:esbuild@0.20.2";

// Uses deno to resolve imports (and download them locally) for esbuild
// @see: https://github.com/lucacasonato/esbuild_deno_loader
// import { denoPlugins } from "jsr:@luca/esbuild-deno-loader@^0.10.3";

// Hack to get aliases for the importmap we use in the deno.json file.
// This relies on the import-map resolving to
let imports = JSON.parse(Deno.readTextFileSync("./deno.json")).imports;

let options = {
	// plugins: [...denoPlugins()],
	alias: imports, // Alternatively use the denoPlugins to make a local build
	entryPoints: ["./lib/widget.ts"],
	outfile: "./src/quak/widget.js",
	bundle: true,
	format: "esm",
	sourcemap: "inline",
	logLevel: "info",
} satisfies esbuild.BuildOptions;

if (Deno.args.includes("--watch")) {
	let ctx = await esbuild.context(options);
	await ctx.watch();
} else {
	await esbuild.build(options);
}
