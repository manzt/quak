export interface Bin {
	x0: number;
	x1: number;
	length: number;
}

/** Missing Mosaic types */

/**
 * The information about a table column.
 *
 * Requested by specifying `fields()` on a mosaic client,
 * and eventually returned into `fieldInfo(infos)` on the same
 * client by the Coordinator.
 */
export interface Info {
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

// These are used on the Histogram client, which is close to a Mosaic Mark
// client. We just don't need all the extra things in vgplot (mainly Plot
// iself).

/**
 * Represents a field in a mosaic query.
 *
 * TODO(Trevor): To be honest I don't really know what all the types are.
 */
export interface Field {
	/** The name of the column. */
	column: string;
	label: string;
	columns: string[];
	basis: string;
	stats: { column: string; stats: string[] };
	toString: () => string;
	aggregate?: boolean;
}

/**
 * Representing a visual channel in a visualization.
 */
export interface Channel {
	as: string;
	field: Field;
	channel: string;
	type?: string;
	value?: number;
}

export type Scale<Range, Output> =
	& {
		type: "linear" | "log" | "pow" | "symlog" | "time";
		domain: [Range, Range];
		range: [Output, Output];
		base?: number;
		constant?: number;
		exponent?: number;
	}
	& import("npm:@types/d3-scale@4.0.8").ScaleLinear<Range, Output>;

/**
 * A stub of the `vgplot.Mark` class.
 *
 * NB: These are the minimum fields I found were necessary to implement
 * on a mc visualization client to get them to work with some
 * of the helper functions.
 */
export interface Mark {
	/** The type of mark. */
	type: string;
	/** just need to make sure this is present but don't need to implement anything */
	plot: {
		getAttribute(name: string): unknown;
	};
	/** A helper to get the field for a channel */
	channelField: (channel: string, opts?: { exact?: boolean }) => Channel;
}
