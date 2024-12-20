// @ts-types="../deps/mosaic-core.d.ts";
import {
	type ColumnField,
	type FieldInfo,
	type FieldRequest,
	MosaicClient,
	type Selection,
} from "@uwdata/mosaic-core";
// @ts-types="../deps/mosaic-sql.d.ts";
import { count, Query, type SQLExpression } from "@uwdata/mosaic-sql";
import * as mplot from "@uwdata/mosaic-plot";
import type * as flech from "@uwdata/flechette";

import { CrossfilterHistogramPlot } from "../utils/CrossfilterHistogramPlot.ts";

import type { Mark } from "../types.ts";
import { assert } from "../utils/assert.ts";

/** An options bag for the Histogram Mosiac client. */
interface HistogramOptions {
	/** The table to query. */
	table: string;
	/** An arrow Field containing the column info to use for the histogram. */
	field: flech.Field;
	/** The column to use for the histogram. */
	column: string;
	/** The type of the column. Must be "number" or "date". */
	type: "number" | "date";
	/** A mosaic selection to filter the data. */
	filterBy: Selection;
}

type BinTable = flech.Table;

/** Represents a Cross-filtered Histogram */
export class Histogram extends MosaicClient implements Mark {
	#source: {
		table: string;
		column: string;
		field: flech.Field;
		type: "number" | "date";
	};
	#el: HTMLElement = document.createElement("div");
	#select: {
		x1: ColumnField;
		x2: ColumnField;
		y: SQLExpression;
	};
	#interval: mplot.Interval1D | undefined = undefined;
	#initialized: boolean = false;
	#fieldInfo: FieldInfo | undefined;

	svg: ReturnType<typeof CrossfilterHistogramPlot> | undefined;

	constructor(options: HistogramOptions) {
		super(options.filterBy);
		this.#source = {
			table: options.table,
			column: options.field.name,
			field: options.field,
			type: options.type,
		};
		// calls this.channelField internally
		let bin = mplot.bin(options.column, { steps: 18 })(this, "x");
		this.#select = { x1: bin.x1, x2: bin.x2, y: count() };
		this.#interval = new mplot.Interval1D(this, {
			channel: "x",
			selection: this.filterBy,
			field: this.#source.column,
			brush: undefined,
		});
	}

	override fields(): Array<FieldRequest> {
		return [
			{
				table: this.#source.table,
				column: this.#source.column,
				stats: ["min", "max"],
			},
		];
	}

	override fieldInfo(info: Array<FieldInfo>) {
		this.#fieldInfo = info[0];
		return this;
	}
	/**
	 * Return a query specifying the data needed by this Mark client.
	 * @param filter The filtering criteria to apply in the query.
	 * @returns The client query
	 */
	override query(filter: Array<SQLExpression> = []): Query {
		return Query
			.from({ source: this.#source.table })
			.select(this.#select)
			.groupby(["x1", "x2"])
			.where(filter);
	}

	/**
	 * Provide query result data to the mark.
	 */
	override queryResult(data: BinTable) {
		let bins: Array<{ x0: number; x1: number; length: number }> = data
			.toArray()
			.map((d) => ({ x0: d.x1, x1: d.x2, length: d.y }));
		let nullCount = 0;
		let nullBinIndex = bins.findIndex((b) => b.x0 == null);
		if (nullBinIndex >= 0) {
			nullCount = bins[nullBinIndex].length;
			bins.splice(nullBinIndex, 1);
		}
		if (!this.#initialized) {
			this.svg = CrossfilterHistogramPlot(bins, this.#source.field, {
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

	/* Required by the Mark interface */
	type = "rectY";
	/** Required by `mplot.bin` to get the field info. */
	channelField(channel: string): FieldInfo {
		assert(channel === "x");
		assert(this.#fieldInfo, "No field info yet");
		return this.#fieldInfo;
	}
	get plot() {
		return {
			node: () => this.#el,
			getAttribute(_name: string) {
				return undefined;
			},
		};
	}
}
