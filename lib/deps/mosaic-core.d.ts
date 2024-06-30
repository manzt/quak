// @deno-types="./mosaic-sql.d.ts";
import type { Query } from "@uwdata/mosaic-sql";

import type * as arrow from "apache-arrow";
import type { Info } from "../types.ts";

export class Selection {
	predicate(client: MosaicClient): Array<unknown>;
	static crossfilter(): Selection;
}

export class MosaicClient {
	constructor(filterBy?: Selection);
	coordinator: Coordinator;
	filterBy?: Selection;
	fieldInfo(infos: Array<Info>): void;
	fields(): Array<{ table: string; column: string; stats: Array<string> }>;
	query(filter?: Array<unknown>): Query;
	queryResult(data: arrow.Table): this;
	requestQuery(query: Query): void;
}

export interface Connector {
	query(query: Query): Promise<arrow.Table | Record<string, unknown>>;
}

export class Coordinator {
	constructor();
	connect(client: MosaicClient): void;
	disconnect(client: MosaicClient): void;
	prefetch(query: Query): void;
	logger(): Logger;
	databaseConnector(connector: Connector): void;
	query(query: Query): Promise<arrow.Table>;
	clear(): void;
}

type Logger = typeof console & {
	groupEnd(name?: string): void;
};
