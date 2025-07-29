import * as d3 from "d3";
import { timeInterval, type TimeUnit } from "@uwdata/mosaic-sql";
import type { Bin } from "../types.ts";

const formatMap: Record<TimeUnit, (date: Date) => string> = {
	"millisecond": d3.timeFormat("%L"),
	"microsecond": d3.timeFormat("%L"),
	"second": d3.timeFormat("%S s"),
	"minute": d3.timeFormat("%H:%M"),
	"hour": d3.timeFormat("%H:%M"),
	"day": d3.timeFormat("%b %d"),
	"month": d3.timeFormat("%b %Y"),
	"quarter": d3.timeFormat("%b %Y"),
	"year": d3.timeFormat("%Y"),
};

/**
 * @param type - the type of data as a JavaScript primitive
 * @param bins - the bin data that needs to be formatted
 */
export function tickFormatterForBins(
	type: "date" | "number",
	bins: Array<Bin>,
): (d: d3.NumberValue) => string {
	if (type === "number") {
		return d3.format("~s");
	}
	let interval = timeInterval(
		bins[0].x0,
		bins[bins.length - 1].x1,
		bins.length,
	);
	// @ts-expect-error - d3 ok with date -> string as long as it's utc
	return formatMap[interval.unit];
}
