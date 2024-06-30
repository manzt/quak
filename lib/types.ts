export interface Bin {
	x0: number;
	x1: number;
	length: number;
}

// TODO: Request mosaic to expose some of these things outside of vgplot?
//
// NB: These type are mostly used on the Histogram client, which loosely
// mimics the `vgplot.Mark` client. We just don't need all the extra things in
// vgplot (mainly Plot iself) for our use case so some of that code
// is vendored in the repo.

/**
 * TODO(Trevor): To be honest I don't really know what all the types are.
 *
 * My understanding is that this is an extension of the `fields()`
 * returned by a MosiacClient.
 */
export interface CompleteField {
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
	field: CompleteField;
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
