// @deno-types="../deps/mosaic-core.d.ts";
import { MosaicClient, type Selection } from "@uwdata/mosaic-core";
// @deno-types="../deps/mosaic-sql.d.ts";
import {
	column,
	count,
	Query,
	sql,
	SQLExpression,
	sum,
} from "@uwdata/mosaic-sql";
import * as d3 from "../deps/d3.ts";
import type * as arrow from "apache-arrow";

interface UniqueValuesOptions {
	/** The table to query. */
	table: string;
	/** The column to use for the histogram. */
	column: string;
	/** A mosaic selection to filter the data. */
	filterBy?: Selection;
}

export class UniqueValues extends MosaicClient {
	#table: string;
	#column: string;
	#el: HTMLElement = document.createElement("div");
	#markSet: Set<unknown> = new Set();
	#plot: HTMLElement | undefined;

	constructor(options: UniqueValuesOptions) {
		super(options.filterBy);
		this.#table = options.table;
		this.#column = options.column;
	}

	query(filter: Array<SQLExpression>): Query {
		let valueCounts = Query
			.select({
				value: sql`CASE
					WHEN ${column(this.#column)} IS NULL THEN '__quak_null__'
					ELSE ${column(this.#column)}
				END`,
				count: count(),
			})
			.from(this.#table)
			.where(filter)
			.groupby("value");
		return Query
			.with({ value_counts: valueCounts })
			.select(
				{
					key: sql`CASE
						WHEN "count" = 1 AND "value" != '__quak_null__' THEN '__quak_unique__'
						ELSE "value"
					END`,
					total: sum("count"),
				},
			)
			.from("value_counts")
			.groupby("key");
	}

	queryResult(
		data: arrow.Table<{ key: arrow.Utf8; total: arrow.Int }>, // type comes from the query above
	): this {
		if (!this.#plot) {
			this.#plot = UniqueValuesPlot(data);
			this.#el.appendChild(this.#plot);
		}
		return this;
	}

	get plot() {
		return {
			node: () => this.#el,
		};
	}
}

interface UniqueValuesPlotOptions {
	width?: number;
	height?: number;
	marginTop?: number;
	marginRight?: number;
	marginBottom?: number;
	marginLeft?: number;
	nullCount?: number;
	fillColor?: string;
	nullFillColor?: string;
	backgroundBarColor?: string;
	rx?: number;
	ry?: number;
}

function UniqueValuesPlot(
	data: arrow.Table<{
		key: arrow.Utf8;
		total: arrow.Int;
	}>,
	{
		width = 125,
		height = 30,
		marginTop = 0,
		marginRight = 2,
		marginBottom = 12,
		marginLeft = 2,
		fillColor = "#64748b",
		nullFillColor = "#ca8a04",
		backgroundBarColor = "var(--moon-gray)",
	}: UniqueValuesPlotOptions = {},
) {
	let arr: Array<{ key: string; total: number }> = data
		.toArray()
		.toSorted(
			(a, b) => {
				if (a.key === "__quak_null__") return 1;
				if (b.key === "__quak_null__") return -1;
				if (a.key === "__quak_unique__") return 1;
				if (b.key === "__quak_unique__") return -1;
				return b.total - a.total;
			},
		);

	let div = document.createElement("div");
	Object.assign(div.style, {
		width: `${width}px`,
		height: `${height}px`,
		display: "flex",
		marginTop: `${marginTop}px`,
		marginBottom: `${marginBottom}px`,
		borderRadius: "5px",
		overflow: "hidden",
	});

	let total = arr.reduce((acc, d) => acc + d.total, 0);
	let x = d3.scaleLinear()
		.domain([0, total])
		.range([marginLeft, width - marginRight]);

	let nullItem: undefined | { key: string; total: number };
	if (arr.at(-1)?.key === "__quak_null__") {
		nullItem = arr.pop();
	}
	let uniqueItem: undefined | { key: string; total: number };
	if (arr.at(-1)?.key === "__quak_unique__") {
		uniqueItem = arr.pop();
	}
	let thresh = 20;

	function createBar(d: { key: string; total: number }) {
		let width = x(d.total);
		let key = {
			"__quak_null__": "null",
			"__quak_unique__": "unique",
		}[d.key] ?? d.key;
		let bar = Object.assign(document.createElement("div"), {
			title: key,
		});
		Object.assign(bar.style, {
			background: {
				"__quak_null__": nullFillColor,
				"__quak_unique__": backgroundBarColor,
			}[d.key] ?? fillColor,
			width: `${width}px`,
			height: `${height}px`,
			borderColor: "white",
			borderWidth: "0px 1px 0px 0px",
			borderStyle: "solid",
			opacity: 1,
			textAlign: "center",
			position: "relative",
			display: "flex",
			overflow: "hidden",
			alignItems: "center",
			fontWeight: 400,
			fontFamily: "var(--sans-serif)",
			boxSizing: "border-box",
		});
		let span = document.createElement("span");
		Object.assign(span.style, {
			overflow: "hidden",
			width: `calc(100% - 4px)`,
			left: "0px",
			position: "absolute",
			padding: "0px 2px",
			color: {
				"__quak_null__": "white",
				"__quak_unique__": "var(--mid-gray)",
			}[d.key] ?? "white",
		});
		if (width > 10) {
			span.textContent = {
				"__quak_null__": "null",
				"__quak_unique__": "unique",
			}[d.key] ?? d.key;
		}
		bar.appendChild(span);
		return bar;
	}

	for (let d of arr.slice(0, thresh)) {
		let bar = createBar(d);
		div.appendChild(bar);
	}

	// virtual elements
	if (arr.length > thresh) {
		let width = x(arr.slice(thresh).reduce((acc, d) => acc + d.total, 0));
		let bar = Object.assign(document.createElement("div"), {
			title: "other",
		});
		Object.assign(bar.style, {
			background:
				`repeating-linear-gradient(to right, ${fillColor} 0px, ${fillColor} 1px, white 1px, white 2px)`,
			width: `${width}px`,
			height: "100%",
			borderColor: "white",
			borderWidth: "0px 1px 0px 0px",
			borderStyle: "solid",
			opacity: 1,
		});
		let span = document.createElement("span");
		Object.assign(span.style, {
			overflow: "hidden",
			width: `calc(100% - 4px)`,
			left: "0px",
			position: "absolute",
			padding: "0px 2px",
			color: "white",
		});
		bar.appendChild(span);
		div.appendChild(bar);
	}

	if (uniqueItem) {
		let bar = createBar(uniqueItem);
		div.appendChild(bar);
	}

	if (nullItem) {
		let bar = createBar(nullItem);
		div.appendChild(bar);
	}

	return div;
}
