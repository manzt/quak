/// <reference types="npm:vite/client" />
import * as mc from "@uwdata/mosaic-core";
import * as msql from "@uwdata/mosaic-sql";

import { datatable } from "./clients/DataTable.ts";

let table: keyof typeof datasets = "athletes";
let base = new URL(
	"https://raw.githubusercontent.com/uwdata/mosaic/main/data/",
);
let datasets = {
	athletes: new URL("athletes.csv", base).href,
	unemployment: new URL("us-county-unemployment.csv", base).href,
	metros: new URL("metros.csv", base).href,
} as const;

let coordinator = new mc.Coordinator();
// let logger = coordinator.logger(voidLogger());
let logger = coordinator.logger();
let connector = mc.wasmConnector(); // Wrap the DuckDB-WASM connector with some logging
coordinator.databaseConnector({
	async query(query: msql.Query) {
		logger.group(`query`);
		logger.log(query);
		let result = await connector.query(query);
		logger.log(result);
		logger.groupEnd(`query`);
		return result;
	},
});

await coordinator.exec([
	// @deno-fmt-ignore
	msql.loadCSV(table, datasets[table]),
]);

const height = () => globalThis.innerHeight - 45;
globalThis.onresize = () => client.resize(height());

let client = await datatable(table, { coordinator, height: height() });
document.body.appendChild(client.node());

// A Vite-specific feature that allows hot-reloading of modules. This way we
// don't need to reload DuckDB or the data when we make changes to the
// DataTable client.
//
// @see https://vitejs.dev/guide/api-hmr
// @ts-expect-error - import.meta.hot not coming from Deno
import.meta.hot?.accept("./clients/DataTable.ts", async (mod) => {
	coordinator.disconnect(client);
	document.body.removeChild(client.node());
	client = await mod.datatable(table, { coordinator, height: height() });
	coordinator.connect(client);
	document.body.appendChild(client.node());
});

function _voidLogger() {
	return Object.fromEntries(
		Object.keys(console).map((key) => [key, () => {}]),
	);
}
