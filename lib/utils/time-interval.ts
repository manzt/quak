/**
 * Vendored from @uwdata/mosaic-sql (transforms/util/time-interval.js) so the
 * widget bundle stays mosaic-free — mosaic itself is provided at runtime by
 * the boro coordinator.
 */

export type TimeUnit =
	| "year"
	| "month"
	| "day"
	| "hour"
	| "minute"
	| "second"
	| "millisecond"
	| "microsecond";

const durationSecond = 1000;
const durationMinute = durationSecond * 60;
const durationHour = durationMinute * 60;
const durationDay = durationHour * 24;
const durationWeek = durationDay * 7;
const durationMonth = durationDay * 30;
const durationYear = durationDay * 365;

const units: Array<{ unit: TimeUnit; step: number; dt: number }> = [
	{ unit: "second", step: 1, dt: durationSecond },
	{ unit: "second", step: 5, dt: durationSecond * 5 },
	{ unit: "second", step: 15, dt: durationSecond * 15 },
	{ unit: "second", step: 30, dt: durationSecond * 30 },
	{ unit: "minute", step: 1, dt: durationMinute },
	{ unit: "minute", step: 5, dt: durationMinute * 5 },
	{ unit: "minute", step: 15, dt: durationMinute * 15 },
	{ unit: "minute", step: 30, dt: durationMinute * 30 },
	{ unit: "hour", step: 1, dt: durationHour },
	{ unit: "hour", step: 3, dt: durationHour * 3 },
	{ unit: "hour", step: 6, dt: durationHour * 6 },
	{ unit: "hour", step: 12, dt: durationHour * 12 },
	{ unit: "day", step: 1, dt: durationDay },
	{ unit: "day", step: 7, dt: durationWeek },
	{ unit: "month", step: 1, dt: durationMonth },
	{ unit: "month", step: 3, dt: durationMonth * 3 },
	{ unit: "year", step: 1, dt: durationYear },
];

/**
 * Determine a time interval for binning based on provided min
 * and max timestamps and approximate step count.
 */
export function timeInterval(
	min: number | Date,
	max: number | Date,
	steps: number,
): { unit: TimeUnit; step: number } {
	const span = +max - +min;
	const t = span / steps;
	const i = bisect(units, t, (v) => v.dt);
	let unit: TimeUnit;
	let step: number;
	if (i === units.length) {
		unit = "year";
		step = binStep(span / durationYear, steps);
	} else if (i) {
		({ unit, step } = units[t / units[i - 1].dt < units[i].dt / t ? i - 1 : i]);
	} else {
		step = binStep(span, steps);
		unit = step >= 1 ? "millisecond" : "microsecond";
		step = step >= 1 ? step : step * 1000;
	}
	return { unit, step };
}

/**
 * Generate a numeric binning scheme suitable for a histogram
 * (nice step size, extent adjusted to step boundaries).
 */
export function binSpec(
	min: number,
	max: number,
	steps = 25,
): { min: number; max: number; steps: number } {
	const span = max - min;
	const logb = Math.LN10;
	const step = binStep(span, steps, 0, logb);
	// adjust min/max relative to step
	let v = Math.log(step);
	const precision = v >= 0 ? 0 : ~~(-v / logb) + 1;
	const eps = Math.pow(10, -precision - 1);
	v = Math.floor(min / step + eps) * step;
	min = min < v ? v - step : v;
	max = Math.ceil(max / step) * step;
	steps = Math.round((max - min) / step);
	return { min, max, steps };
}

function binStep(span: number, steps: number, minstep = 0, logb = Math.LN10) {
	let v: number;
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

function bisect<T>(
	a: Array<T>,
	x: number,
	value: (d: T) => number,
): number {
	let lo = 0;
	let hi = a.length;
	if (lo < hi) {
		if (Number.isNaN(x)) return hi;
		do {
			const mid = (lo + hi) >>> 1;
			if (value(a[mid]) - x <= 0) lo = mid + 1;
			else hi = mid;
		} while (lo < hi);
	}
	return lo;
}
