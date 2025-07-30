import { Temporal } from "@js-temporal/polyfill";
import * as flech from "@uwdata/flechette";
import { format } from "d3";

/**
 * A utility function to create a formatter for a given data type.
 *
 * The datatype is only used for type inference to ensure that the formatter is
 * correctly typed.
 */
function fmt<TValue>(
	format: (value: TValue) => string,
): (value: TValue | null | undefined) => string {
	return (value) => {
		if (value === undefined || value === null) {
			return stringify(value);
		}
		return format(value);
	};
}

function stringify(x: unknown): string {
	return `${x}`;
}

/** @param {flech.DataType} type */
export function formatDataType(type: flech.DataType): string {
	switch (type.typeId) {
		case flech.Type.Dictionary: {
			let inner = formatDataType(type.dictionary);
			return `dict<${inner}>`;
		}
		case flech.Type.NONE:
			return "none";
		case flech.Type.Null:
			return "null";
		case flech.Type.Int:
			return `${type.signed ? "int" : "uint"}${type.bitWidth}`;
		case flech.Type.Float: {
			let precision = {
				[flech.Precision.HALF]: "16",
				[flech.Precision.SINGLE]: "32",
				[flech.Precision.DOUBLE]: "64",
			}[type.precision];
			return `float${precision}`;
		}
		case flech.Type.Binary:
			return "binary";
		case flech.Type.Utf8:
			return "utf8";
		case flech.Type.Bool:
			return "bool";
		case flech.Type.Decimal:
			return `decimal(${type.precision}, ${type.scale})`;
		case flech.Type.Date: {
			let unit = {
				[flech.DateUnit.DAY]: "day",
				[flech.DateUnit.MILLISECOND]: "ms",
			}[type.unit];
			return `date[${unit}]`;
		}
		case flech.Type.Time: {
			let unit = {
				[flech.TimeUnit.SECOND]: "s",
				[flech.TimeUnit.MILLISECOND]: "ms",
				[flech.TimeUnit.MICROSECOND]: "µs",
				[flech.TimeUnit.NANOSECOND]: "ns",
			}[type.unit];
			let bitWidth = type.bitWidth;
			return `time${bitWidth}[${unit}]`;
		}
		case flech.Type.Timestamp:
			return type.timezone ? `timestamp[tz=${type.timezone}]` : "timestamp";
		case flech.Type.Interval: {
			let unit = {
				[flech.IntervalUnit.YEAR_MONTH]: "ym",
				[flech.IntervalUnit.DAY_TIME]: "dt",
				[flech.IntervalUnit.MONTH_DAY_NANO]: "mdn",
			}[type.unit];
			return `interval[${unit}]`;
		}
		case flech.Type.List: {
			let inner = formatDataType(type.children[0].type);
			return `list[${inner}]`;
		}
		case flech.Type.Struct: {
			let fields = type.children.map((field) => {
				return `${field.name}: ${formatDataType(field.type)}`;
			});
			return `struct<${fields.join(", ")}>`;
		}
		case flech.Type.Union: {
			let mode = {
				[flech.UnionMode.Sparse]: "sparse",
				[flech.UnionMode.Dense]: "dense",
			}[type.mode];
			let fields = type.children.map((field) => {
				return `${field.name}: ${formatDataType(field.type)}`;
			});
			return `union<mode=${mode}>[${fields.join(", ")}]`;
		}
		case flech.Type.FixedSizeBinary:
			return `binary[stride=${type.stride}]`;
		case flech.Type.FixedSizeList: {
			let inner = formatDataType(type.children[0].type);
			return `list<stride=${type.stride}>[${inner}]`;
		}
		case flech.Type.Map: {
			let values = formatDataType(type.children[0].type);
			return `map<${values}>`;
		}
		case flech.Type.Duration: {
			let unit = {
				[flech.TimeUnit.SECOND]: "s",
				[flech.TimeUnit.MILLISECOND]: "ms",
				[flech.TimeUnit.MICROSECOND]: "µs",
				[flech.TimeUnit.NANOSECOND]: "ns",
			}[type.unit];
			return `duration[${unit}]`;
		}
		case flech.Type.LargeBinary:
			return `large binary`;
		case flech.Type.LargeUtf8:
			return `large utf8`;
		case flech.Type.LargeList:
			return `large list`;
		case flech.Type.RunEndEncoded: {
			let values = formatDataType(type.children[0].type);
			let index = formatDataType(type.children[1].type);
			return `ree<${values}, ${index}>`;
		}
		case flech.Type.BinaryView:
			return `binary view`;
		case flech.Type.Utf8View:
			return `utf8 view`;
		case flech.Type.ListView:
			return `list view`;
		case flech.Type.LargeListView:
			return `large list view`;
	}
}

/**
 * @param {flech.DataType} type
 * @returns {(value: any) => string}
 *
 * @see https://idl.uw.edu/flechette/api/data-types#int
 */
export function formatterForValue(
	type: flech.DataType,
	// deno-lint-ignore no-explicit-any
): (value: any) => string {
	switch (type.typeId) {
		case flech.Type.NONE:
			return fmt<null>(stringify);
		case flech.Type.Null:
			return fmt<null>(stringify);
		case flech.Type.Int:
		case flech.Type.Float:
			return fmt<number | bigint>((value) => {
				if (Number.isNaN(value)) return "NaN";
				return value === 0 ? "0" : value.toLocaleString("en"); // handle negative zero
			});
		case flech.Type.Binary:
		case flech.Type.BinaryView:
		case flech.Type.FixedSizeBinary:
		case flech.Type.LargeBinary:
			return fmt<Uint8Array>((bytes) => {
				let maxlen = 32;
				let result = "b'";
				for (let i = 0; i < Math.min(bytes.length, maxlen); i++) {
					const byte = bytes[i];
					if (byte >= 32 && byte <= 126) {
						// ASCII printable characters range from 32 (space) to 126 (~)
						result += String.fromCharCode(byte);
					} else {
						result += "\\x" + ("00" + byte.toString(16)).slice(-2);
					}
				}
				if (bytes.length > maxlen) result += "...";
				result += "'";
				return result;
			});
		case flech.Type.Utf8:
		case flech.Type.Utf8View:
		case flech.Type.LargeUtf8:
			return fmt<string>((s) => s);
		case flech.Type.Bool:
			return fmt<boolean>(stringify);
		case flech.Type.Decimal:
			return fmt<number | bigint>(() => "TODO");
		case flech.Type.Date:
			return fmt<number | Date>((date) => {
				return Temporal.Instant
					.fromEpochMilliseconds(
						typeof date === "number" ? date : date.getTime(),
					)
					.toZonedDateTimeISO("UTC")
					.toPlainDate()
					.toString();
			});
		case flech.Type.Time:
			return fmt<number | bigint>((ms) => {
				return instantFromTimeUnit(ms, type.unit)
					.toZonedDateTimeISO("UTC")
					.toPlainTime()
					.toString();
			});
		case flech.Type.Timestamp:
			return fmt<number | Date>((date) => {
				return Temporal.Instant
					.fromEpochMilliseconds(
						typeof date === "number" ? date : date.getTime(),
					)
					.toZonedDateTimeISO("UTC")
					.toPlainDateTime()
					.toString();
			});
		case flech.Type.Interval:
			return fmt<number | bigint>(() => "TODO");
		case flech.Type.List:
		case flech.Type.LargeList:
		case flech.Type.ListView:
		case flech.Type.FixedSizeList:
		case flech.Type.LargeListView: {
			let maxItems = 5;
			return fmt<Array<unknown> | flech.TypedArray>((value) => {
				let items = Array.from(value.slice(0, maxItems));
				if (value.length > maxItems) items.push("...");
				return `[${items.join(", ")}]`;
			});
		}
		case flech.Type.Duration:
			return fmt<number | bigint>((bigintValue) => {
				// https://tc39.es/proposal-temporal/docs/duration.html#toString
				return durationFromTimeUnit(bigintValue, type.unit).toString();
			});
		case flech.Type.Struct:
			return fmt<Record<string, unknown>>((value) => {
				// TODO: Some recursive formatting?
				return value.toString();
			});
		case flech.Type.Union:
			return fmt<unknown>(() => "TODO");
		case flech.Type.Map: {
			return fmt<Array<[key: string, value: unknown]>>((value) => {
				let obj = Object.fromEntries(
					value.map(([key, value]) => [key, value]),
				);
				return JSON.stringify(obj);
			});
		}
		case flech.Type.RunEndEncoded: {
			return fmt<unknown>(() => "TODO");
		}
		case flech.Type.Dictionary: {
			// TODO: some recursive formatting?
			return fmt<unknown>(stringify);
		}
	}
}

type TimeUnit =
	| typeof flech.TimeUnit.SECOND
	| typeof flech.TimeUnit.MILLISECOND
	| typeof flech.TimeUnit.MICROSECOND
	| typeof flech.TimeUnit.NANOSECOND;

/**
 * @param {number | bigint} value
 * @param {flech.TimeUnit} unit
 */
function instantFromTimeUnit(
	value: number | bigint,
	unit: TimeUnit,
) {
	switch (unit) {
		case flech.TimeUnit.SECOND:
			// Convert seconds to milliseconds
			if (typeof value === "bigint") value = Number(value);
			return Temporal.Instant.fromEpochMilliseconds(value * 1000);
		case flech.TimeUnit.MILLISECOND:
			if (typeof value === "bigint") value = Number(value);
			return Temporal.Instant.fromEpochMilliseconds(value);
		case flech.TimeUnit.MICROSECOND:
			// Convert microseconds to nanoseconds
			if (typeof value === "number") value = BigInt(value);
			return Temporal.Instant.fromEpochNanoseconds(value * 1000n);
		case flech.TimeUnit.NANOSECOND:
			if (typeof value === "number") value = BigInt(value);
			return Temporal.Instant.fromEpochNanoseconds(value);
	}
}

/**
 * @param {number | bigint} value
 * @param {flech.TimeUnit} unit
 */
function durationFromTimeUnit(value: number | bigint, unit: TimeUnit) {
	// TODO: Temporal.Duration polyfill only supports number not bigint
	value = Number(value);
	switch (unit) {
		case flech.TimeUnit.SECOND:
			return Temporal.Duration.from({ seconds: value });
		case flech.TimeUnit.MILLISECOND:
			return Temporal.Duration.from({ milliseconds: value });
		case flech.TimeUnit.MICROSECOND:
			return Temporal.Duration.from({ microseconds: value });
		case flech.TimeUnit.NANOSECOND:
			return Temporal.Duration.from({ nanoseconds: value });
	}
}

/**
 * Formats a number as a percentage string with varying precision based on the value's magnitude.
 * @param {number} value - The value to be formatted as a percentage.
 * @returns {string} A formatted percentage string.
 */
export function percentFormatter(value: number): string {
	if (value >= 0.1) {
		return format(".0%")(value);
	} else if (value >= 0.01) {
		return format(".1%")(value);
	} else {
		return format(".2%")(value);
	}
}
