// @ts-types="./deps/mosaic-core.d.ts";
import * as mc from "@uwdata/mosaic-core";
// @ts-types="./deps/mosaic-sql.d.ts";
import { Query } from "@uwdata/mosaic-sql";
import * as arrow from "apache-arrow";
import * as uuid from "@lukeed/uuid";

import { DataTable } from "./clients/DataTable.ts";
import { assert } from "./utils/assert.ts";
import { defer } from "./utils/defer.ts";

type Model = {
	_table_name: string;
	_columns: Array<string>;
	temp_indexes: boolean;
	sql: string;
};

interface OpenQuery {
	query: mc.ConnectorQuery;
	startTime: number;
	resolve: (x: arrow.Table | Record<string, unknown>) => void;
	reject: (err?: string) => void;
}

export default () => {
	let coordinator = new mc.Coordinator();
	let schema: arrow.Schema;

	return {
		async initialize(
			{ model }: import("npm:@anywidget/types").InitializeProps<Model>,
		) {
			let logger = coordinator.logger(_voidLogger());
			let openQueries = new Map<string, OpenQuery>();

			/**
			 * @param query - the query to send
			 * @param resolve - the promise resolve callback
			 * @param reject - the promise reject callback
			 */
			function send(
				query: mc.ConnectorQuery,
				resolve: (value: arrow.Table | Record<string, unknown>) => void,
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
					switch (msg.type) {
						case "arrow": {
							let table = arrow.tableFromIPC(buffers[0].buffer);
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
						arrow.Table | Record<string, unknown>,
						string
					>();
					send(query, resolve, reject);
					return promise;
				},
			});

			// get some initial data to get the schema
			let empty = await coordinator.query(
				Query
					.from(model.get("_table_name"))
					.select(...model.get("_columns"))
					.limit(0)
					.toString(),
			);
			schema = empty.schema;

			return () => {
				coordinator.clear();
			};
		},
		render({ model, el }: import("npm:@anywidget/types").RenderProps<Model>) {
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

function _voidLogger() {
	return Object.fromEntries(
		Object.keys(console).map((key) => [key, () => {}]),
	);
}
