import * as mc from "@uwdata/mosaic-core";
import { Query } from "@uwdata/mosaic-sql";
import * as flech from "@uwdata/flechette";
import * as uuid from "@lukeed/uuid";

import { DataTable } from "./clients/DataTable.ts";
import { assert } from "./utils/assert.ts";

import type * as aw from "npm:@anywidget/types@0.2.0";

type Model = {
	_table_name: string;
	_columns: Array<string>;
	sql: string;
};

interface OpenQuery {
	query: mc.ArrowQueryRequest | mc.JSONQueryRequest | mc.ExecQueryRequest;
	startTime: number;
	resolve: (x: flech.Table | Record<string, unknown>) => void;
	reject: (err?: string) => void;
}

export default () => {
	let coordinator = new mc.Coordinator();
	return {
		initialize({ model }: aw.InitializeProps<Model>) {
			let logger = coordinator.logger(null);
			let openQueries = new Map<string, OpenQuery>();

			function send(
				query: mc.ArrowQueryRequest | mc.JSONQueryRequest | mc.ExecQueryRequest,
				resolve: (value: flech.Table | Record<string, unknown>) => void,
				reject: (reason?: string) => void,
			) {
				let id = uuid.v4();
				openQueries.set(id, {
					query,
					startTime: performance.now(),
					resolve,
					reject,
				});
				model.send({ ...query, uuid: id });
			}

			model.on("msg:custom", (msg, buffers) => {
				logger.group(`query ${msg.uuid}`);
				logger.log("received message", msg, buffers);

				const query = openQueries.get(msg.uuid);
				assert(query, "no open query");
				openQueries.delete(msg.uuid);

				logger.log(
					query.query.sql,
					(performance.now() - query.startTime).toFixed(1),
				);

				if (msg.error) {
					query.reject(msg.error);
					logger.error(msg.error);
				} else {
					switch (msg.type) {
						case "arrow": {
							const buffer = buffers[0].buffer;
							assert(
								buffer instanceof ArrayBuffer || buffer instanceof Uint8Array,
							);
							const table = mc.decodeIPC(buffer);
							logger.log("table", table);
							query.resolve(table);
							break;
						}
						case "json": {
							logger.log("json", msg.result);
							query.resolve(msg.result);
							break;
						}
						default: {
							query.resolve({});
							break;
						}
					}
				}
				logger.groupEnd();
			});

			coordinator.databaseConnector({
				query(query) {
					// deno-lint-ignore no-explicit-any
					return new Promise<any>((resolve, reject) =>
						send(query, resolve, reject)
					);
				},
			});
			coordinator.preaggregator.schema = "mosaic";
			return () => {
				coordinator.clear();
			};
		},
		async render({ model, el }: aw.RenderProps<Model>) {
			let table = new DataTable({
				table: model.get("_table_name"),
				schema: await getTableSchema(coordinator, {
					tableName: model.get("_table_name"),
					columns: model.get("_columns"),
				}),
			});
			coordinator.connect(table);
			table.sql.subscribe((sql) => {
				model.set("sql", sql ?? "");
				model.save_changes();
			});
			el.appendChild(table.node());
		},
	};
};

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
	) as flech.Table;
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
