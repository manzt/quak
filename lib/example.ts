/// <reference types="npm:vite/client" />
import * as mc from "@uwdata/mosaic-core";
import * as msql from "@uwdata/mosaic-sql";

import { DataTable } from "./clients/DataTable.ts";

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
let logger = coordinator.logger(voidLogger());
// let logger = coordinator.logger();
let connector = mc.wasmConnector(); // Wrap the DuckDB-WASM connector with some logging
coordinator.databaseConnector({
	async query(query: msql.Query) {
		logger.group(`query`);
		logger.log("query", query);
		let result = await connector.query(query);
		logger.log("result", result);
		logger.groupEnd(`query`);
		return result;
	},
});

await coordinator.exec([
	// @deno-fmt-ignore
	msql.loadCSV(table, datasets[table]),
]);

// TODO: This should be a helper function
let empty = await coordinator.query(
	msql.Query
		.from(table)
		.select(["*"])
		.limit(0)
		.toString(),
);

let datatable = new DataTable({
	table,
	schema: empty.schema,
	filterBy: mc.Selection.crossfilter(),
	height: 500,
});

coordinator.connect(datatable);
document.body.appendChild(datatable.node());

// A Vite-specific feature that allows hot-reloading of modules. This way we
// don't need to reload DuckDB or the data when we make changes to the
// DataTable client.
//
// @see https://vitejs.dev/guide/api-hmr
// @ts-expect-error - import.meta.hot not coming from Deno
import.meta.hot?.accept("./clients/DataTable.ts", (mod) => {
	coordinator.disconnect(datatable);
	document.body.removeChild(datatable.node());
	datatable = new mod.DataTable({
		table,
		schema: empty.schema,
		filterBy: mc.Selection.crossfilter(),
		height: 500,
	});
	coordinator.connect(datatable);
	document.body.appendChild(datatable.node());
});

function voidLogger() {
	return Object.fromEntries(
		Object.keys(console).map((key) => [key, () => {}]),
	);
}
