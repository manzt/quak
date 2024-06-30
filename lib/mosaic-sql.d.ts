/**
 * Class representing a table and/or column reference.
 */
export class Ref {
	/**
	 * Create a new Ref instance.
	 * @param table The table name.
	 * @param The column name.
	 */
	constructor(table: string | Ref | null, column?: string | null);
	/**
	 * Get the list of referenced columns. Either a single element array
	 * if column is non-null, otherwise an empty array.
	 */
	columns: Array<string>;
	/**
	 * Generate a SQL string for this reference.
	 * @returns {string} The SQL string.
	 */
	toString(): string;
}

type ParamLike = unknown;

/**
 * Base class for all SQL expressions. Most callers should use the `sql`
 * template tag rather than instantiate this class.
 */
export class SQLExpression {
	/**
	 * Create a new SQL expression instance.
	 * @param {(string | ParamLike | SQLExpression | import('./ref.js').Ref)[]} parts The parts of the expression.
	 * @param {string[]} [columns=[]] The column dependencies
	 * @param {object} [props] Additional properties for this expression.
	 */
	constructor(
		parts: (string | ParamLike | SQLExpression | Ref)[],
		columns?: Array<string>,
		props?: object,
	);
	/**
	 * A reference to this expression.
	 * Provides compatibility with param-like objects.
	 */
	value: SQLExpression;
	/**
	 * The column dependencies of this expression.
	 * @returns The columns dependencies.
	 */
	columns: Array<string>;
	/**
	 * The first column dependency in this expression, or undefined if none.
	 * @returns The first column dependency.
	 */
	column: string | undefined;
	/**
	 * Annotate this expression instance with additional properties.
	 * @param props One or more objects with properties to add.
	 * @returns This SQL expression.
	 */
	annotate<T>(extra: T): SQLExpression & T;
	/**
	 * Generate a SQL code string corresponding to this expression.
	 * @returns A SQL code string.
	 */
	toString(): string;
	/**
	 * Add an event listener callback for the provided event type.
	 * @param type - The event type to listen for (for example, "value").
	 * @param callback - The callback function to invoke upon updates. A
	 * callback may optionally return a Promise that upstream listeners may
	 * await before proceeding.
	 */
	addEventListener(
		type: string,
		callback: (a: SQLExpression) => Promise<void>,
	): void;
}

export class Query {
	constructor();
	static from(table: string | { source: string }): Query;
	static select(...exprs: unknown[]): Query;
	select(...exprs: unknown[]): Query;
	orderby(...exprs: unknown[]): Query;
	where(...exprs: unknown[]): Query;
	limit(limit: number): Query;
	offset(offset: number): Query;
	groupby(...exprs: unknown[]): Query;
	clone(): Query;
}

export declare function desc(column: string): SQLExpression;
export declare function count(): SQLExpression;
