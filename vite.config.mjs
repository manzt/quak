import deno from "npm:@deno/vite-plugin@1";

/** @type {import("npm:vite@5").UserConfig} */
export default {
	plugins: [deno()],
};
