// @ts-types="./deps/mosaic-core.d.ts";
import * as mc from "@uwdata/mosaic-core";
// @ts-types="./deps/mosaic-sql.d.ts";
import { Query } from "@uwdata/mosaic-sql";
import * as flech from "@uwdata/flechette";
import * as uuid from "@lukeed/uuid";

import { DataTable } from "./clients/DataTable.ts";
import { assert } from "./utils/assert.ts";
import { defer } from "./utils/defer.ts";

type Model = {
	_table_name: string;
	_columns: Array<string>;
	data_cube_schema: string;
	sql: string;
};

interface OpenQuery {
	query: mc.ConnectorQuery;
	startTime: number;
	resolve: (x: flech.Table | Record<string, unknown>) => void;
	reject: (err?: string) => void;
}

export default () => {
	let coordinator = new mc.Coordinator();
	let schema: flech.Schema;

	return {
		async initialize(
			{ model }: import("npm:@anywidget/types@0.2.0").InitializeProps<
				Model
			>,
		) {
			let logger = coordinator.logger(_voidLogger());
			let getDataCubeSchema = () => model.get("data_cube_schema");
			let openQueries = new Map<string, OpenQuery>();

			/**
			 * @param query - the query to send
			 * @param resolve - the promise resolve callback
			 * @param reject - the promise reject callback
			 */
			function send(
				query: mc.ConnectorQuery,
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
				let query = openQueries.get(msg.uuid);
				openQueries.delete(msg.uuid);
				assert(query, `No query found for ${msg.uuid}`);
				logger.log(
					query.query.toString(),
					(performance.now() - query.startTime).toFixed(1),
				);
				if (msg.error) {
					query.reject(msg.error);
					logger.error(msg.error);
					return;
				} else {
					const buffer = buffers[0].buffer;
					assert(buffer instanceof ArrayBuffer || buffer instanceof Uint8Array);
					switch (msg.type) {
						case "arrow": {
							let table = flech.tableFromIPC(buffer);
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
				logger.groupEnd("query");
			});

			coordinator.databaseConnector({
				query(query) {
					let { promise, resolve, reject } = defer<
						flech.Table | Record<string, unknown>,
						string
					>();
					send(query, resolve, reject);
					return promise;
				},
			});
			coordinator.dataCubeIndexer.schema = getDataCubeSchema();
			model.on("change:data_cube_schema", () => {
				coordinator.dataCubeIndexer.schema = getDataCubeSchema();
			});

			schema = await getTableSchema(coordinator, {
				tableName: model.get("_table_name"),
				columns: model.get("_columns"),
			});

			return () => {
				coordinator.clear();
			};
		},
		render(
			{ model, el }: import("npm:@anywidget/types@0.2.0").RenderProps<
				Model
			>,
		) {
			let table = new DataTable({
				table: model.get("_table_name"),
				schema: schema,
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
	);
	return empty.schema;
}

function _voidLogger() {
	return Object.fromEntries(
		Object.keys(console).map((key) => [key, () => {}]),
	);
}

export async function embed(el: HTMLElement) {
	let coordinator = new mc.Coordinator();
	let logger = coordinator.logger();

	coordinator.databaseConnector({
		async query({ type, sql }) {
			logger.log(`query: ${sql}`);
			logger.log(`type: ${type}`);
			let url = new URL("/api/query", import.meta.url);
			url.searchParams.set("type", type);
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
