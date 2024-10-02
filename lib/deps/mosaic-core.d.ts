// @ts-types="./mosaic-sql.d.ts";
import type { Query, SQLExpression } from "@uwdata/mosaic-sql";
import type * as flechette from "@uwdata/flechette";

export interface Interactor<T = unknown> {
	reset(): void;
	clause(update?: T): Clause<Interactor>;
}

export interface Clause<Source> {
	source: Source;
	clients: Set<MosaicClient>;
	predicate: unknown;
	value: unknown;
	schema: Record<string, unknown>;
}

export class Selection {
	predicate(client?: MosaicClient): Array<SQLExpression>;
	static crossfilter(): Selection;
	clauses: Array<Clause<Interactor>>;
	update(clause: Clause<unknown>): void;
	activate(clause: Clause<unknown>): void;
	addEventListener(event: "activate", listener: () => void): void;
	addEventListener<T = unknown>(
		event: "value",
		listener: (value?: T) => void,
	): void;
}

/** Represents a request for information for a column from the coordinator */
interface FieldRequest {
	/** The SQL table name */
	table: string;
	/** The column name */
	column: string;
	/** What statistics to compute for this field. */
	stats: Array<"min" | "max" | "distinct">;
}

/**
 * The information about a table column.
 *
 * Requested by specifying `fields()` on a mosaic client,
 * and eventually returned into `fieldInfo(infos)` on the same
 * client by the Coordinator.
 */
export interface FieldInfo {
	/** The name of the column. */
	column: string;
	/** The column data type as JavaScript primitive (e.g. "string", "number"). */
	type: string;
	/** Whether the column is nullable. */
	nullable: boolean;
	/** The corresponding SQL data type. */
	sqlType: string;
	/** The table name */
	table: string;
	/** The min value for the column. Only present if requested in `fields()` */
	min?: number;
	/** The max value for the column. Only present if requested in `fields()` */
	max?: number;
	/** The number of distinct values for the column. Only present if requested in `fields()` */
	distinct?: number;
}

/**
 * TODO(Trevor): To be honest I don't really know what all the types are.
 *
 * My understanding is that this is an extension of the `fields()`
 * returned by a MosiacClient.
 */
export interface ColumnField {
	basis: string;
	column: string;
	columns: string[];
	label: string;
	stats: { column: string; stats: string[] };
	toString: () => string;
	aggregate?: boolean;
}

export type Field = ColumnField | SQLExpression;

/**
 * Represents a mosaic client.
 *
 * Clients describe there data needs as SQL queries,
 * which are managed by a coordinator.
 */
export class MosaicClient {
	constructor(filterBy?: Selection);
	/** The coordinator the client is connected to */
	coordinator: Coordinator;
	/** A Selection property to filter the data for this client */
	filterBy?: Selection;
	/**
	 * What columns this client requires information for.
	 *
	 * The statistics requested for a field are added to the corresponding
	 * @link{Info} object returned in `MosaicClient.fieldInfo`.
	 *
	 * @example
	 * ```ts
	 * client.fields() // [ { table: "foo", column: "bar", stats: ["min"] } ]
	 *
	 * // Corresponding Info has { min: number, ...rest }
	 * ```
	 */
	fields(): Array<FieldRequest>;
	/**  */
	fieldInfo(infos: Array<FieldInfo>): void;
	query(filter?: Array<unknown>): Query;
	/** Called before the coordinator submitting a query to inform the client */
	queryPending(): this;
	queryResult(data: flechette.Table): this;
	queryError(error: unknown): this;
	requestQuery(query: Query): void;
	requestUpdate(query: Query): void;
}

export type ConnectorQuery = { type: "arrow" | "json"; sql: string };

export interface Connector {
	query(
		query: ConnectorQuery,
	): Promise<flechette.Table | Record<string, unknown>>;
}

export class Coordinator {
	constructor();
	connect(client: MosaicClient): void;
	disconnect(client: MosaicClient): void;
	prefetch(query: Query): void;
	logger(impl?: unknown): Logger;
	databaseConnector(connector: Connector): void;
	query(query: Query): Promise<flechette.Table>;
	clear(): void;
	dataCubeIndexer: {
		schema: string | undefined;
	};
}

type Logger = typeof console & {
	groupEnd(name?: string): void;
};

export declare function clausePoint<T>(
	field: string,
	value: unknown,
	options: { source: T; clients?: Set<MosaicClient> },
): Clause<T>;
