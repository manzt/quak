import * as arrow from "apache-arrow";

// @deno-types="../mosaic-core.d.ts"
import * as mc from "@uwdata/mosaic-core";
// @deno-types="../mosaic-sql.d.ts"
import { desc, Query, SQLExpression } from "@uwdata/mosaic-sql";
import * as signals from "@preact/signals-core";
import { html } from "htl";

import { AsyncBatchReader } from "../utils/AsyncBatchReader.ts";
import { assert } from "../utils/assert.ts";
import {
	formatDataTypeName,
	formatterForDataTypeValue,
} from "../utils/formatting.ts";

import { Histogram } from "./Histogram.ts";
import { Info } from "../types.ts";

interface DataTableOptions {
	table: string;
	schema: arrow.Schema;
	height?: number;
	filterBy?: mc.Selection;
}

// TODO: more
type ColumnSummaryClient = Histogram;

export class DataTable extends mc.MosaicClient {
	/** source options */
	#source: DataTableOptions;
	/** for the component */
	#root: HTMLElement = document.createElement("div");
	/** shadow root for the component */
	#shadowRoot: ShadowRoot = this.#root.attachShadow({ mode: "open" });
	/** header of the table */
	#thead: HTMLTableSectionElement = document.createElement("thead");
	/** body of the table */
	#tbody: HTMLTableSectionElement = document.createElement("tbody");
	/** The SQL order by */
	#orderby: Array<{ field: string; order: "asc" | "desc" | "unset" }> = [];
	/** template row for data */
	#templateRow: HTMLTableRowElement | undefined = undefined;
	/** div containing the table */
	#tableRoot: HTMLDivElement;
	/** offset into the data */
	#offset: number = 0;
	/** number of rows to fetch */
	#limit: number = 100;
	/** whether an internal request is pending */
	#pending: boolean = false;
	/** number of rows to display */
	#rows: number = 11.5;
	/** height of a row */
	#rowHeight: number = 22;
	/** width of a column */
	#columnWidth: number = 125;
	/** height of the header */
	#headerHeight: string = "50px";
	/** the formatter for the data table entries */
	#format: Record<string, (value: unknown) => string>;

	/** @type {AsyncBatchReader<arrow.StructRowProxy> | null} */
	#reader: AsyncBatchReader<arrow.StructRowProxy> | null = null;

	constructor(source: DataTableOptions) {
		super(source.filterBy);
		this.#source = source;
		this.#format = formatof(source.schema);
		this.#pending = false;

		let maxHeight = `${(this.#rows + 1) * this.#rowHeight - 1}px`;
		// if maxHeight is set, calculate the number of rows to display
		if (source.height) {
			this.#rows = Math.floor(source.height / this.#rowHeight);
			maxHeight = `${source.height}px`;
		}

		let root: HTMLDivElement = html`<div class="quak" style=${{
			maxHeight,
		}}>`;
		// @deno-fmt-ignore
		root.appendChild(
			html.fragment`<table class="quak" style=${{ tableLayout: "fixed" }}>${this.#thead}${this.#tbody}</table>`
		);
		this.#shadowRoot.appendChild(html`<style>${STYLES}</style>`);
		this.#shadowRoot.appendChild(root);
		this.#tableRoot = root;

		// scroll event listener
		this.#tableRoot.addEventListener("scroll", async () => {
			let isAtBottom =
				this.#tableRoot.scrollHeight - this.#tableRoot.scrollTop <
					this.#rows * this.#rowHeight * 1.5;
			if (isAtBottom) {
				await this.#appendRows(this.#rows);
			}
		});
	}

	fields(): Array<{ table: string; column: string; stats: Array<string> }> {
		return this.#columns.map((column) => ({
			table: this.#source.table,
			column,
			stats: [],
		}));
	}

	node() {
		return this.#root;
	}

	get #columns() {
		return this.#source.schema.fields.map((field) => field.name);
	}

	/**
	 * @param {Array<unknown>} filter
	 */
	query(filter: Array<unknown> = []) {
		return Query.from(this.#source.table)
			.select(this.#columns)
			.where(filter)
			.orderby(
				this.#orderby
					.filter((o) => o.order !== "unset")
					.map((o) => o.order === "asc" ? asc(o.field) : desc(o.field)),
			)
			.limit(this.#limit)
			.offset(this.#offset);
	}

	/**
	 * A mosiac lifecycle function that is called with the results from `query`.
	 * Must be synchronous, and return `this`.
	 */
	queryResult(data: arrow.Table) {
		if (!this.#pending) {
			// data is not from an internal request, so reset table
			this.#reader = new AsyncBatchReader(() => {
				this.#pending = true;
				this.requestData(this.#offset + this.#limit);
			});
			this.#tbody.replaceChildren();
			this.#offset = 0;
		}
		this.#reader?.enqueueBatch(data[Symbol.iterator](), {
			last: data.numRows < this.#limit,
		});
		return this;
	}

	update() {
		if (!this.#pending) {
			// on the first update, populate the table with initial data
			this.#appendRows(this.#rows * 2);
		}
		this.#pending = false;
		return this;
	}

	requestData(offset = 0) {
		this.#offset = offset;

		// request next data batch
		let query = this.query(this.filterBy?.predicate(this));
		this.requestQuery(query);

		// prefetch subsequent data batch
		this.coordinator.prefetch(query.clone().offset(offset + this.#limit));
	}

	fieldInfo(infos: Array<Info>) {
		let classes = classof(this.#source.schema);

		// @deno-fmt-ignore
		this.#templateRow = html`<tr><td></td>${
			infos.map((info) => html.fragment`<td class=${classes[info.column]}></td>`)
		}
			<td style=${{ width: "99%", borderLeft: "none", borderRight: "none" }}></td>
		</tr>`;

		let observer = new IntersectionObserver((entries) => {
			for (let entry of entries) {
				if (!isTableColumnHeaderWithSvg(entry.target)) continue;
				let vis = entry.target.vis;
				if (!vis) continue;
				if (entry.isIntersecting) {
					this.coordinator.connect(vis);
				} else {
					this.coordinator?.disconnect(vis);
				}
			}
		}, {
			root: this.#tableRoot,
		});

		let cols = this.#source.schema.fields.map((field) => {
			let info = infos.find((c) => c.column === field.name);
			assert(info, `No info for column ${field.name}`);
			let vis: ColumnSummaryClient | undefined = undefined;
			if (info.type === "number" || info.type === "date") {
				vis = new Histogram({
					table: this.#source.table,
					column: field.name,
					type: info.type,
					filterBy: this.#source.filterBy,
				});
			}
			let th = thcol(field, this.#columnWidth, vis);
			observer.observe(th);
			return th;
		});

		signals.effect(() => {
			this.#orderby = cols.map((col, i) => ({
				field: this.#columns[i],
				order: col.sortState.value,
			}));
			this.requestData();
		});

		// @deno-fmt-ignore
		this.#thead.appendChild(
			html`<tr style=${{ height: this.#headerHeight }}>
				<th></th>
				${cols}
				<th style=${{ width: "99%", borderLeft: "none", borderRight: "none" }}></th>
			</tr>`,
		);

		// highlight on hover
		{
			this.#tableRoot.addEventListener("mouseover", (event) => {
				if (
					isTableCellElement(event.target) &&
					isTableRowElement(event.target.parentNode)
				) {
					const cell = event.target;
					const row = event.target.parentNode;
					highlight(cell, row);
				}
			});
			this.#tableRoot.addEventListener("mouseout", (event) => {
				if (
					isTableCellElement(event.target) &&
					isTableRowElement(event.target.parentNode)
				) {
					const cell = event.target;
					const row = event.target.parentNode;
					removeHighlight(cell, row);
				}
			});
		}

		return this;
	}

	/** Number of rows to append */
	async #appendRows(nrows: number) {
		nrows = Math.trunc(nrows);
		while (nrows >= 0) {
			let result = await this.#reader?.next();
			if (!result || result?.done) {
				// we've exhausted all rows
				break;
			}
			this.#appendRow(result.value.row, result.value.index);
			nrows--;
			continue;
		}
	}

	#appendRow(d: arrow.StructRowProxy, i: number) {
		let itr = this.#templateRow?.cloneNode(true);
		assert(itr, "Must have a data row");
		let td = itr.childNodes[0] as HTMLTableCellElement;
		td.appendChild(document.createTextNode(String(i)));
		for (let j = 0; j < this.#columns.length; ++j) {
			td = itr.childNodes[j + 1] as HTMLTableCellElement;
			td.classList.remove("gray");
			let col = this.#columns[j];
			let stringified = this.#format[col](d[col]);
			if (shouldGrayoutValue(stringified)) {
				td.classList.add("gray");
			}
			let value = document.createTextNode(stringified);
			td.appendChild(value);
		}
		this.#tbody.append(itr);
	}
}

const TRUNCATE = /** @type {const} */ ({
	whiteSpace: "nowrap",
	overflow: "hidden",
	textOverflow: "ellipsis",
});

function thcol(
	field: arrow.Field,
	minWidth: number,
	vis?: ColumnSummaryClient,
) {
	let buttonVisible = signals.signal(false);
	let width = signals.signal(minWidth);
	let sortState: signals.Signal<"unset" | "asc" | "desc"> = signals.signal(
		"unset",
	);

	function nextSortState() {
		// simple state machine
		// unset -> asc -> desc -> unset
		sortState.value = ({
			"unset": "asc",
			"asc": "desc",
			"desc": "unset",
		} as const)[sortState.value];
	}

	// @deno-fmt-ignore
	let svg = html`<svg style=${{ width: "1.5em" }} fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
		<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 9L12 5.25L15.75 9" />
		<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 15L12 18.75L15.75 15" />
	</svg>`;
	let uparrow: SVGPathElement = svg.children[0];
	let downarrow: SVGPathElement = svg.children[1];
	let verticalResizeHandle: HTMLDivElement =
		html`<div class="resize-handle"></div>`;
	// @deno-fmt-ignore
	let sortButton = html`<span aria-role="button" class="sort-button" onmousedown=${nextSortState}>${svg}</span>`;
	// @deno-fmt-ignore
	let th: HTMLTableCellElement = html`<th title=${field.name}>
		<div style=${{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
			<span style=${{ marginBottom: "5px", maxWidth: "250px", ...TRUNCATE }}>${field.name}</span>
			${sortButton}
		</div>
		${verticalResizeHandle}
		<span class="gray" style=${{ fontWeight: 400, fontSize: "12px", userSelect: "none" }}>${formatDataTypeName(field.type)}</span>
		${vis?.plot?.node()}
	</th>`;

	signals.effect(() => {
		uparrow.setAttribute("stroke", "var(--moon-gray)");
		downarrow.setAttribute("stroke", "var(--moon-gray)");
		// @deno-fmt-ignore
		let element = { "asc": uparrow, "desc": downarrow, "unset": null }[sortState.value];
		element?.setAttribute("stroke", "var(--dark-gray)");
	});

	signals.effect(() => {
		sortButton.style.visibility = buttonVisible.value ? "visible" : "hidden";
	});

	signals.effect(() => {
		th.style.width = `${width.value}px`;
	});

	th.addEventListener("mouseover", () => {
		if (sortState.value === "unset") buttonVisible.value = true;
	});

	th.addEventListener("mouseleave", () => {
		if (sortState.value === "unset") buttonVisible.value = false;
	});

	th.addEventListener("dblclick", (event) => {
		// reset column width but we don't want to interfere with someone
		// double-clicking the sort button
		// if the mouse is within the sort button, don't reset the width
		if (
			event.offsetX < sortButton.offsetWidth &&
			event.offsetY < sortButton.offsetHeight
		) {
			return;
		}
		width.value = minWidth;
	});

	verticalResizeHandle.addEventListener("mousedown", (event) => {
		event.preventDefault();
		let startX = event.clientX;
		let startWidth = th.offsetWidth -
			parseFloat(getComputedStyle(th).paddingLeft) -
			parseFloat(getComputedStyle(th).paddingRight);
		function onMouseMove(/** @type {MouseEvent} */ event: MouseEvent) {
			let dx = event.clientX - startX;
			width.value = Math.max(minWidth, startWidth + dx);
			verticalResizeHandle.style.backgroundColor = "var(--light-silver)";
		}
		function onMouseUp() {
			verticalResizeHandle.style.backgroundColor = "transparent";
			document.removeEventListener("mousemove", onMouseMove);
			document.removeEventListener("mouseup", onMouseUp);
		}
		document.addEventListener("mousemove", onMouseMove);
		document.addEventListener("mouseup", onMouseUp);
	});

	verticalResizeHandle.addEventListener("mouseover", () => {
		verticalResizeHandle.style.backgroundColor = "var(--light-silver)";
	});

	verticalResizeHandle.addEventListener("mouseleave", () => {
		verticalResizeHandle.style.backgroundColor = "transparent";
	});

	return Object.assign(th, { vis, sortState });
}

const STYLES = /*css*/ `\
:host {
  all: initial;
  --sans-serif: -apple-system, BlinkMacSystemFont, "avenir next", avenir, helvetica, "helvetica neue", ubuntu, roboto, noto, "segoe ui", arial, sans-serif;
  --light-silver: #efefef;
  --spacing-none: 0;
  --white: #fff;
  --gray: #929292;
  --dark-gray: #333;
  --moon-gray: #c4c4c4;
  --mid-gray: #6e6e6e;
}

.highlight {
	background-color: var(--light-silver);
}

.highlight-cell {
	border: 1px solid var(--moon-gray);
}

.quak {
  border-radius: 0.2rem;
  border: 1px solid var(--light-silver);
  overflow-y: auto;
}

table {
  border-collapse: separate;
  border-spacing: 0;
  white-space: nowrap;
  box-sizing: border-box;

  margin: var(--spacing-none);
  color: var(--dark-gray);
  font: 13px / 1.2 var(--sans-serif);

  width: 100%;
}

thead {
  position: sticky;
  vertical-align: top;
  text-align: left;
  top: 0;
}

td {
  border: 1px solid var(--light-silver);
  border-bottom: solid 1px transparent;
  border-right: solid 1px transparent;
  overflow: hidden;
  -o-text-overflow: ellipsis;
  text-overflow: ellipsis;
  padding: 4px 6px;
}

tr:first-child td {
  border-top: solid 1px transparent;
}

th {
  display: table-cell;
  vertical-align: inherit;
  font-weight: bold;
  text-align: -internal-center;
  unicode-bidi: isolate;

  position: relative;
  background: var(--white);
  border-bottom: solid 1px var(--light-silver);
  border-left: solid 1px var(--light-silver);
  padding: 5px 6px 0 6px;
}

.number, .date {
  font-variant-numeric: tabular-nums;
}

.gray {
  color: var(--gray);
}

.number {
  text-align: right;
}

td:nth-child(1), th:nth-child(1) {
  font-variant-numeric: tabular-nums;
  text-align: center;
  color: var(--moon-gray);
  padding: 0 4px;
}

td:first-child, th:first-child {
  border-left: none;
}

th:first-child {
  border-left: none;
  vertical-align: top;
  width: 20px;
  padding: 7px;
}

td:nth-last-child(2), th:nth-last-child(2) {
  border-right: 1px solid var(--light-silver);
}

tr:first-child td {
	border-top: solid 1px transparent;
}

.resize-handle {
	width: 5px;
	height: 100%;
	background-color: transparent;
	position: absolute;
	right: -2.5px;
	top: 0;
	cursor: ew-resize;
	z-index: 1;
}

.sort-button {
	cursor: pointer;
	background-color: var(--white);
	user-select: none;
}
`;

/**
 * Return a formatter for each field in the schema
 */
function formatof(schema: arrow.Schema) {
	const format: Record<string, (value: unknown) => string> = Object.create(
		null,
	);
	for (const field of schema.fields) {
		format[field.name] = formatterForDataTypeValue(field.type);
	}
	return format;
}

/**
 * Return a class type of each field in the schema.
 */
function classof(schema: arrow.Schema): Record<string, "number" | "date"> {
	const classes: Record<string, "number" | "date"> = Object.create(null);
	for (const field of schema.fields) {
		if (
			arrow.DataType.isInt(field.type) ||
			arrow.DataType.isFloat(field.type)
		) {
			classes[field.name] = "number";
		}
		if (
			arrow.DataType.isDate(field.type) ||
			arrow.DataType.isTimestamp(field.type)
		) {
			classes[field.name] = "date";
		}
	}
	return classes;
}

function highlight(cell: HTMLTableCellElement, row: HTMLTableRowElement) {
	if (row.firstChild !== cell && cell !== row.lastElementChild) {
		cell.style.border = "1px solid var(--moon-gray)";
	}
	row.style.backgroundColor = "var(--light-silver)";
}

function removeHighlight(cell: HTMLTableCellElement, row: HTMLTableRowElement) {
	cell.style.removeProperty("border");
	row.style.removeProperty("background-color");
}

function isTableCellElement(node: unknown): node is HTMLTableDataCellElement {
	// @ts-expect-error - tagName is not defined on unknown
	return node?.tagName === "TD";
}

function isTableRowElement(node: unknown): node is HTMLTableRowElement {
	return node instanceof HTMLTableRowElement;
}

/** @param {string} value */
function shouldGrayoutValue(value: string) {
	return (
		value === "null" ||
		value === "undefined" ||
		value === "NaN" ||
		value === "TODO"
	);
}

function isTableColumnHeaderWithSvg(
	node: unknown,
): node is ReturnType<typeof thcol> {
	return node instanceof HTMLTableCellElement && "vis" in node;
}

/**
 * A mosaic SQL expression for ascending order
 *
 * The normal behavior in SQL is to sort nulls first when sorting in ascending order.
 * This function returns an expression that sorts nulls last (i.e., `NULLS LAST`),
 * like the `desc` function.
 *
 * @param field
 */
function asc(field: string): SQLExpression {
	// doesn't sort nulls for asc
	let expr = desc(field);
	// @ts-expect-error - private field
	expr._expr[0] = expr._expr[0].replace("DESC", "ASC");
	return expr;
}
