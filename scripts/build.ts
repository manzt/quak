/// <reference lib="deno.ns" />
import * as esbuild from "npm:esbuild@0.20.2";
// @see: https://github.com/lucacasonato/esbuild_deno_loader
import { denoPlugins } from "jsr:@luca/esbuild-deno-loader@^0.10.3";

let root = new URL("..", import.meta.url);

// Hack to get aliases for the importmap we use in the deno.json file.
// This relies on the import-map resolving to
let denoJson = await Deno
	.readTextFile(new URL("deno.json", root))
	.then(JSON.parse);

let options: esbuild.BuildOptions = {
	alias: denoJson.imports, // Alternatively use the denoPlugins to make a local build
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
		delete options.sourcemap;
		delete options.alias; // Remove the alias to make a global build
		options.plugins = [...denoPlugins({
			importMapURL: new URL("deno.json", root).href,
		})];
	}
	await esbuild.build(options);
}
