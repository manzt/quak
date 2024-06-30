// @deno-types="./mosaic-sql.d.ts";
import type { Query } from "@uwdata/mosaic-sql";

import type * as arrow from "apache-arrow";
import type { Info } from "./types.ts";

export interface Selection {
	predicate(client: MosaicClient): Array<unknown>;
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

export interface Coordinator {
	connect(client: MosaicClient): void;
	disconnect(client: MosaicClient): void;
	prefetch(query: Query): void;
}
