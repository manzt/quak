/**
 * @module
 *
 * This is an experimental script to publish `quak` to JSR.
 *
 * @example
 * ```sh
 * $ deno task publish
 * ```
 *
 * It rewrites CDN import `URL`s to the `npm:` specificer in the deno.json
 */

let root = new URL("..", import.meta.url);

let denoJson = await Deno
	.readTextFile(new URL("deno.json", root))
	.then(JSON.parse);

let imports = denoJson.imports as Record<string, string>;

denoJson.imports = Object.fromEntries(
	Object.entries(denoJson.imports as Record<string, string>)
		.map(([key, value]) => {
			// replace jsdelivr with npm (trim trailing /+esm)
			if (value.startsWith("https://cdn.jsdelivr.net/npm/")) {
				value = value
					.replace("https://cdn.jsdelivr.net/npm/", "npm:")
					.replace(/\/\+esm$/, "");
			} else if (value.startsWith("https://esm.sh/")) {
				value = value.replace("https://esm.sh/", "npm:");
			} else {
				throw new Error(`Unknown CDN base: ${value}`);
			}
			return [key, value];
		}),
);

try {
	await Deno.writeTextFile(
		new URL("deno.json", root),
		JSON.stringify(denoJson, null, 2),
	);

	let cmd = new Deno.Command(Deno.execPath(), {
		args: ["publish", "--dry-run"],
		cwd: root,
		stdout: "piped",
		stderr: "piped",
	});

	const { code, stdout, stderr } = await cmd.output();

	const outStr = new TextDecoder().decode(stdout);
	const errStr = new TextDecoder().decode(stderr);

	console.log(outStr);
	console.error(errStr);

	if (code !== 0) {
		throw new Error(`Failed to publish: ${code}`);
	}
} finally {
	// restore deno.json
	denoJson.imports = imports;
	await Deno.writeTextFile(
		new URL("deno.json", root),
		JSON.stringify(denoJson, null, 2),
	);
}
