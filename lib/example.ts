import * as mc from "@uwdata/mosaic-core";
import * as msql from "@uwdata/mosaic-sql";

import { DataTable } from "./clients/DataTable.ts";

let coordinator = new mc.Coordinator();
coordinator.databaseConnector(mc.wasmConnector());
let logger = coordinator.logger();

console.log(mc.wasmConnector());

await coordinator.exec([
	msql.loadCSV(
		"athletes",
		"https://raw.githubusercontent.com/uwdata/mosaic/8e63149753e7d6ca30274c032a04744e14df2fd6/data/athletes.csv",
	),
]);

// TODO: This should be a helper function
let empty = await coordinator.query(
	msql.Query
		.from("athletes")
		.select(["*"])
		.limit(0)
		.toString(),
);
console.log(empty.schema);

let table = new DataTable({
	table: "athletes",
	schema: empty.schema,
	filterBy: mc.Selection.crossfilter(),
});

document.body.appendChild(table.node());