import * as d3 from "../d3.ts";
import type { Bin } from "../types.ts";

let YEAR = "year";
let MONTH = "month";
let DAY = "day";
let HOUR = "hour";
let MINUTE = "minute";
let SECOND = "second";
let MILLISECOND = "millisecond";

let durationSecond = 1000;
let durationMinute = durationSecond * 60;
let durationHour = durationMinute * 60;
let durationDay = durationHour * 24;
let durationWeek = durationDay * 7;
let durationMonth = durationDay * 30;
let durationYear = durationDay * 365;

let intervals = [
	[SECOND, 1, durationSecond],
	[SECOND, 5, 5 * durationSecond],
	[SECOND, 15, 15 * durationSecond],
	[SECOND, 30, 30 * durationSecond],
	[MINUTE, 1, durationMinute],
	[MINUTE, 5, 5 * durationMinute],
	[MINUTE, 15, 15 * durationMinute],
	[MINUTE, 30, 30 * durationMinute],
	[HOUR, 1, durationHour],
	[HOUR, 3, 3 * durationHour],
	[HOUR, 6, 6 * durationHour],
	[HOUR, 12, 12 * durationHour],
	[DAY, 1, durationDay],
	[DAY, 7, durationWeek],
	[MONTH, 1, durationMonth],
	[MONTH, 3, 3 * durationMonth],
	[YEAR, 1, durationYear],
] as const;

let formatMap = {
	[MILLISECOND]: d3.timeFormat("%L"),
	[SECOND]: d3.timeFormat("%S s"),
	[MINUTE]: d3.timeFormat("%H:%M"),
	[HOUR]: d3.timeFormat("%H:%M"),
	[DAY]: d3.timeFormat("%b %d"),
	[MONTH]: d3.timeFormat("%b %Y"),
	[YEAR]: d3.timeFormat("%Y"),
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
	return formatMap[interval.interval];
}

/// bin stuff from vgplot

/**
 * @param min
 * @param max
 * @param steps
 */
function timeInterval(
	min: number,
	max: number,
	steps: number,
): {
	interval: typeof intervals[number][0] | typeof MILLISECOND;
	step: number;
} {
	const span = max - min;
	const target = span / steps;

	let i = 0;
	while (i < intervals.length && intervals[i][2] < target) {
		i++;
	}

	if (i === intervals.length) {
		return { interval: YEAR, step: binStep(span, steps) };
	}

	if (i > 0) {
		let interval = intervals[
			target / intervals[i - 1][2] < intervals[i][2] / target ? i - 1 : i
		];
		return { interval: interval[0], step: interval[1] };
	}

	return { interval: MILLISECOND, step: binStep(span, steps, 1) };
}

/**
 * @param {number} span
 * @param {number} steps
 * @param {number} [minstep]
 * @param {number} [logb]
 */
function binStep(
	span: number,
	steps: number,
	minstep: number = 0,
	logb: number = Math.LN10,
) {
	let v;

	const level = Math.ceil(Math.log(steps) / logb);
	let step = Math.max(
		minstep,
		Math.pow(10, Math.round(Math.log(span) / logb) - level),
	);

	// increase step size if too many bins
	while (Math.ceil(span / step) > steps) step *= 10;

	// decrease step size if allowed
	const div = [5, 2];
	for (let i = 0, n = div.length; i < n; ++i) {
		v = step / div[i];
		if (v >= minstep && span / v <= steps) step = v;
	}

	return step;
}
