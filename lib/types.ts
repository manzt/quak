import type { FieldInfo } from "@uwdata/mosaic-core";
import type { ScaleLinear } from "d3";

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

export type Scale<Range, Output> =
	& {
		type: "linear" | "log" | "pow" | "symlog" | "time";
		domain: [Range, Range];
		range: [Output, Output];
		base?: number;
		constant?: number;
		exponent?: number;
	}
	& ScaleLinear<Range, Output>;

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
	channelField: (channel: string, opts?: { exact?: boolean }) => FieldInfo;
}
