import * as vite from "npm:vite";

let root = new URL("..", import.meta.url);
let denoJson = await Deno
	.readTextFile(new URL("deno.json", root))
	.then(JSON.parse);

let server = await vite.createServer({
	resolve: { alias: denoJson.imports },
	configFile: false,
	logLevel: "info",
});

server.config.logger.info("Server running at http://localhost:5173");
await server.listen(5173);
