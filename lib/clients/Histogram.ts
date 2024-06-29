import * as mc from "@uwdata/mosaic-core";
import * as msql from "@uwdata/mosaic-sql";
import * as mplot from "@uwdata/mosaic-plot";

import type { Channel, Mark } from "../types.ts";

/** An options bag for the Histogram Mosiac client. */
interface HistogramOptions {
	/** The table to query. */
	table: string;
	/** The column to use for the histogram. */
	column: string;
	/** The type of the column. Must be "number" or "date". */
	type: "number" | "date";
	/** A mosaic selection to filter the data. */
	filterBy?: mc.Selection;
}

/** Represents a Cross-filtered Histogram */
export class Histogram extends mc.MosaicClient implements Mark {
	type = "rectY";
	/** @type {{ table: string, column: string, type: "number" | "date" }} */
	#source: { table: string; column: string; type: "number" | "date" };
	/** @type {HTMLElement} */
	#el: HTMLElement = document.createElement("div");
	/** @type {Array<Channel>} */
	#channels: Array<Channel> = [];
	/** @type {Set<unknown>} */
	#markSet: Set<unknown> = new Set();
	/** @type {mplot.Interval1D | undefined} */
	#interval: mplot.Interval1D | undefined = undefined;
	/** @type {boolean} */
	#initialized: boolean = false;

	constructor(options: HistogramOptions) {
		super(options.filterBy);
		this.#source = options;
		let process = (channel: string, entry: unknown) => {
			if (isTransform(entry)) {
				let enc = entry(this, channel);
				for (let key in enc) {
					process(key, enc[key]);
				}
			} else if (isFieldObject(channel, entry)) {
				this.#channels.push(fieldEntry(channel, entry));
			} else {
				throw new Error(`Invalid encoding for channel ${channel}`);
			}
		};
		let encodings = {
			x: mplot.bin(options.column),
			y: msql.count(),
		};
		for (let [channel, entry] of Object.entries(encodings)) {
			process(channel, entry);
		}
		if (options.filterBy) {
			this.#interval = new mplot.Interval1D(this, {
				channel: "x",
				selection: this.filterBy,
				field: this.#source.column,
				brush: undefined,
			});
		}
	}

	/** @returns {Array<{ table: string, column: string, stats: Array<string> }>} */
	// @ts-expect-error - _field type is bad from MosaicClient
	fields(): Array<{ table: string; column: string; stats: Array<string> }> {
		const fields = new Map();
		for (let { field } of this.#channels) {
			if (!field) continue;
			let stats = field.stats?.stats || [];
			let key = field.stats?.column ?? field;
			let entry = fields.get(key);
			if (!entry) {
				entry = new Set();
				fields.set(key, entry);
			}
			stats.forEach((s) => entry.add(s));
		}
		return Array.from(
			fields,
			([c, s]) => ({ table: this.#source.table, column: c, stats: s }),
		);
	}

	/** @param {Array<Info>} info */
	fieldInfo(info: Array<Info>) {
		let lookup = Object.fromEntries(info.map((x) => [x.column, x]));
		for (let entry of this.#channels) {
			let { field } = entry;
			if (field) {
				Object.assign(entry, lookup[field.stats?.column ?? field]);
			}
		}
		this._fieldInfo = true;
		return this;
	}

	/** @param {string} channel */
	channel(channel: string) {
		return this.#channels.find((c) => c.channel === channel);
	}

	/**
	 * @param {string} channel
	 * @param {{ exact?: boolean }} [options]
	 * @returns {Channel}
	 */
	channelField(
		channel: string,
		{ exact = false }: { exact?: boolean } = {},
	): Channel {
		assert(this._fieldInfo, "Field info not set");
		let c = exact
			? this.channel(channel)
			: this.#channels.find((c) => c.channel.startsWith(channel));
		assert(c, `Channel ${channel} not found`);
		return c;
	}

	hasFieldInfo() {
		return !!this._fieldInfo;
	}

	/**
	 * Return a query specifying the data needed by this Mark client.
	 * @param {*} [filter] The filtering criteria to apply in the query.
	 * @returns {*} The client query
	 */
	query(filter: any = []): any {
		return markQuery(this.#channels, this.#source.table).where(filter);
	}

	/**
	 * Provide query result data to the mark.
	 * @param {arrow.Table<{ x1: arrow.Int, x2: arrow.Int, y: arrow.Int }>} data
	 */
	queryResult(
		data: arrow.Table<{ x1: arrow.Int; x2: arrow.Int; y: arrow.Int }>,
	) {
		let bins = Array.from(data, (d) => ({
			x0: d.x1,
			x1: d.x2,
			length: d.y,
		}));
		let nullCount = 0;
		let nullBinIndex = bins.findIndex((b) => b.x0 == null);
		if (nullBinIndex >= 0) {
			nullCount = bins[nullBinIndex].length;
			bins.splice(nullBinIndex, 1);
		}
		if (!this.#initialized) {
			this.svg = crossfilterHistogram(bins, {
				nullCount,
				type: this.#source.type,
			});
			this.#interval?.init(this.svg, null);
			this.#el.appendChild(this.svg);
			this.#initialized = true;
		} else {
			this.svg?.update(bins, { nullCount });
		}
		return this;
	}

	get plot() {
		return {
			node: () => this.#el,
			/** @param {string} _name */
			getAttribute(_name: string) {
				return undefined;
			},
			markSet: this.#markSet,
		};
	}
}

/**
 * @param {string} channel
 * @param {Field} field
 * @returns {Channel}
 */
function fieldEntry(channel: string, field: Field): Channel {
	return {
		channel,
		field,
		as: field instanceof msql.Ref ? field.column : channel,
	};
}

/**
 * @param {string} channel
 * @param {unknown} field
 * @returns {field is Field}
 */
function isFieldObject(channel: string, field: unknown): field is Field {
	if (channel === "sort" || channel === "tip") {
		return false;
	}
	return (
		typeof field === "object" &&
		field != null &&
		!Array.isArray(field)
	);
}

/**
 * @param {unknown} x
 * @returns {x is (mark: Mark, channel: string) => Record<string, Field>}
 */
function isTransform(
	x: unknown,
): x is (mark: Mark, channel: string) => Record<string, Field> {
	return typeof x === "function";
}

/**
 * Default query construction for a mark.
 *
 * Tracks aggregates by checking fields for an aggregate flag.
 * If aggregates are found, groups by all non-aggregate fields.
 *
 * @param {Array<Channel>} channels array of visual encoding channel specs.
 * @param {string} table the table to query.
 * @param {Array<string>} skip an optional array of channels to skip. Mark subclasses can skip channels that require special handling.
 * @returns {msql.Query} a Query instance
 */
export function markQuery(
	channels: Array<Channel>,
	table: string,
	skip: Array<string> = [],
): msql.Query {
	let q = msql.Query.from({ source: table });
	let dims = new Set();
	let aggr = false;

	for (const c of channels) {
		const { channel, field, as } = c;
		if (skip.includes(channel)) continue;

		if (channel === "orderby") {
			q.orderby(c.value);
		} else if (field) {
			if (field.aggregate) {
				aggr = true;
			} else {
				if (dims.has(as)) continue;
				dims.add(as);
			}
			q.select({ [as]: field });
		}
	}
	if (aggr) {
		q.groupby(Array.from(dims));
	}
	return q;
}
