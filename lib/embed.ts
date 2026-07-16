/**
 * Standalone (non-widget) quak: a self-contained mosaic client served by the
 * quak CLI / static sites, talking to a REST connector. This path bundles its
 * own mosaic; the anywidget path (`lib/widget.ts`) instead runs as a boro
 * client against the coordinator widget's mosaic.
 */
import * as mc from "@uwdata/mosaic-core";
import { Query } from "@uwdata/mosaic-sql";
import * as flech from "@uwdata/flechette";

import { DataTable } from "./clients/DataTable.ts";
import { assert } from "./utils/assert.ts";
import { isFlechetteTable } from "./utils/guards.ts";

async function getTableSchema(
	coordinator: mc.Coordinator,
	options: {
		tableName: string;
		columns: Array<string>;
	},
) {
	let empty = await coordinator.query(
		Query
			.from(options.tableName)
			.select(...options.columns)
			.limit(0),
		{ type: "arrow" },
	);
	assert(isFlechetteTable(empty), "Expected a flechette table.");
	return empty.schema;
}

export async function embed(el: HTMLElement) {
	let coordinator = new mc.Coordinator();
	let logger = coordinator.logger();

	coordinator.databaseConnector({
		async query({ type, sql }) {
			logger.log(`query: ${sql}`);
			logger.log(`type: ${type}`);
			let url = new URL("/api/query", import.meta.url);
			url.searchParams.set("type", type ?? "arrow");
			let response = await fetch(url, { method: "POST", body: sql });
			assert(response.ok, `Failed to query`);
			switch (type) {
				case "arrow": {
					let buffer = await response.arrayBuffer();
					let bytes = new Uint8Array(buffer);
					return flech.tableFromIPC(bytes);
				}
				case "json":
					return response.json();
				default:
					throw new Error(`Unsupported format ${type}`);
			}
		},
	});
	let dt = new DataTable({
		table: "df",
		schema: await getTableSchema(coordinator, {
			tableName: "df",
			columns: ["*"],
		}),
		height: 500,
	});
	coordinator.connect(dt);
	el.appendChild(dt.node());
	return dt;
}
