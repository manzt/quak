import * as flech from "@uwdata/flechette";
// @ts-types="../deps/mosaic-core.d.ts"
import {
	type Coordinator,
	type FieldInfo,
	type FieldRequest,
	MosaicClient,
	Selection,
} from "@uwdata/mosaic-core";
// @ts-types="../deps/mosaic-sql.d.ts"
import { desc, Query, type SQLExpression } from "@uwdata/mosaic-sql";
import * as signals from "@preact/signals-core";
import { html } from "htl";

import { AsyncBatchReader } from "../utils/AsyncBatchReader.ts";
import { assert } from "../utils/assert.ts";
import { formatDataType, formatterForValue } from "../utils/formatting.ts";
import { Histogram } from "./Histogram.ts";
import { ValueCounts } from "./ValueCounts.ts";
import { signal } from "@preact/signals-core";

import stylesString from "./styles.css.ts";
import { StatusBar } from "./StatusBar.ts";

interface DataTableOptions {
	table: string;
	schema: flech.Schema;
	height?: number;
}

// TODO: more
type ColumnSummaryClient = Histogram | ValueCounts;
type TableRow = Record<string, unknown>;

/**
 * Create a DataTable client.
 *
 * @param table - The name of the table to query.
 * @param options - Options for the DataTable client.
 * @param options.coordinator - The mosaic coordinator to connect to.
 * @param options.height - The height of the table in pixels (default: 11.5 rows).
 * @param options.columns - The columns to display in the table (default: all columns).
 */
export async function datatable(
	table: string,
	options: {
		coordinator: Coordinator;
		height?: number;
		columns?: Array<string>;
	},
): Promise<DataTable> {
	assert(options.coordinator, "Must provide a coordinator");
	let empty = await options.coordinator.query(
		Query
			.from(table)
			.select(options.columns ?? ["*"])
			.limit(0)
			.toString(),
	);
	let client = new DataTable({
		table,
		schema: empty.schema,
		height: options.height,
	});
	options.coordinator.connect(client);
	return client;
}

export class DataTable extends MosaicClient {
	/** source of the data */
	#meta: { table: string; schema: flech.Schema };
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
	/** offset into the data */
	#offset: number = 0;
	/** number of rows to fetch */
	#limit: number = 100;
	/** whether an internal request is pending */
	#pendingInternalRequest: boolean = true;
	/** number of rows to display */
	#rows: number = 11.5;
	/** height of a row */
	#rowHeight: number = 22;
	/** width of a column */
	#columnWidth: number = 125;
	/** height of the header */
	#headerHeight: string = "94px";
	/** the formatter for the data table entries */
	#format: Record<string, (value: unknown) => string>;

	/** @type {AsyncBatchReader<flech.StructRowProxy> | null} */
	#reader: AsyncBatchReader<TableRow> | null = null;

	#sql = signal(undefined as string | undefined);

	constructor(source: DataTableOptions) {
		super(Selection.crossfilter());
		this.#format = formatof(source.schema);
		this.#meta = source;

		let maxHeight = `${(this.#rows + 1) * this.#rowHeight - 1}px`;
		// if maxHeight is set, calculate the number of rows to display
		if (source.height) {
			this.#rows = Math.floor(source.height / this.#rowHeight);
			maxHeight = `${source.height}px`;
		}

		let tableRoot = html`<div class="table-container" style=${{
			maxHeight,
		}}>`;
		// @deno-fmt-ignore
		tableRoot.appendChild(
			html.fragment`<table style=${{ tableLayout: "fixed" }}>${this.#thead}${this.#tbody}</table>`
		);
		addDirectionalScrollWithPreventDefault(tableRoot);

		// scroll event listener
		tableRoot.addEventListener("scroll", async () => {
			let isAtBottom = tableRoot.scrollHeight - tableRoot.scrollTop <
				this.#rows * this.#rowHeight * 1.5;
			if (isAtBottom) {
				await this.#appendRows(this.#rows);
			}
		});

		let container = html`<div class="quak"></div>`;
		container.appendChild(tableRoot);
		this.#shadowRoot.appendChild(html`<style>${stylesString}</style>`);
		this.#shadowRoot.appendChild(container);
	}

	get #tableRoot(): HTMLDivElement {
		return this.#shadowRoot.querySelector(".table-container")!;
	}

	/**
	 * The SQL query string for the current state of the table.
	 */
	get sql(): signals.Signal<string | undefined> {
		return this.#sql;
	}

	/**
	 * Mosaic function. Client defines the fields to be requested from the coordinator.
	 */
	fields(): Array<FieldRequest> {
		return this.#columns.map((column) => ({
			table: this.#meta.table,
			column,
			stats: [],
		}));
	}

	node(): HTMLElement {
		return this.#root;
	}

	resize(height: number): void {
		this.#rows = Math.floor(height / this.#rowHeight);
		this.#tableRoot.style.maxHeight = `${height}px`;
		this.#tableRoot.scrollTop = 0;
	}

	get #columns() {
		return this.#meta.schema.fields.map((field) => field.name);
	}

	/**
	 * Mosaic function. Client defines the query to be executed by the coordinator.
	 *
	 * @param filter - The filter predicates to apply to the query
	 * @returns The query to be executed
	 */
	query(filter: Array<unknown> = []): Query {
		let query = Query.from(this.#meta.table)
			.select(this.#columns)
			.where(filter)
			.orderby(
				this.#orderby
					.filter((o) => o.order !== "unset")
					.map((o) => o.order === "asc" ? asc(o.field) : desc(o.field)),
			);
		this.#sql.value = query.clone().toString();
		return query
			.limit(this.#limit)
			.offset(this.#offset);
	}

	/**
	 * A Mosiac lifecycle function called with arrow results from `query`.
	 * Must be synchronous, and return `this`.
	 */
	queryResult(table: flech.Table): this {
		if (!this.#pendingInternalRequest) {
			// data is not from an internal request, so reset table
			this.#reader = new AsyncBatchReader(() => {
				this.#pendingInternalRequest = true;
				this.#requestData(this.#offset + this.#limit);
			});
			this.#tbody.replaceChildren();
			this.#tableRoot.scrollTop = 0;
			this.#offset = 0;
		}
		let batch = table[Symbol.iterator]();
		this.#reader?.enqueueBatch(batch, {
			last: table.numRows < this.#limit,
		});
		return this;
	}

	/**
	 * Mosaic lifecycle function called after `queryResult`
	 */
	update(): this {
		if (!this.#pendingInternalRequest) {
			// on the first update, populate the table with initial data
			this.#appendRows(this.#rows * 2);
		}
		this.#pendingInternalRequest = false;
		return this;
	}

	#requestData(offset = 0) {
		this.#offset = offset;

		// request next data batch
		let query = this.query(this.filterBy?.predicate(this));
		this.requestQuery(query);

		// prefetch subsequent data batch
		this.coordinator.prefetch(query.clone().offset(offset + this.#limit));
	}

	/**
	 * Mosaic lifecycle function called when the client is connected to a coordinator.
	 */
	fieldInfo(infos: Array<FieldInfo>): this {
		let classes = classof(this.#meta.schema);

		{
			let statusBar = new StatusBar({
				table: this.#meta.table,
				filterBy: this.filterBy,
			});
			this.coordinator.connect(statusBar);
			this.#shadowRoot.querySelector(".quak")?.appendChild(
				statusBar.node(),
			);
		}

		// @deno-fmt-ignore
		this.#templateRow = html`<tr><td></td>${
			infos.map((info) => html.fragment`<td class=${classes[info.column]}></td>`)
		}
			<td style=${{ width: "99%", borderLeft: "none", borderRight: "none" }}></td>
		</tr>`;

		let cols = this.#meta.schema.fields.map((field) => {
			let info = infos.find((c) => c.column === field.name);
			assert(info, `No info for column ${field.name}`);
			let vis: ColumnSummaryClient | undefined = undefined;
			if (info.type === "number" || info.type === "date") {
				vis = new Histogram({
					table: this.#meta.table,
					column: field.name,
					field: field,
					type: info.type,
					filterBy: this.filterBy!,
				});
			} else {
				vis = new ValueCounts({
					table: this.#meta.table,
					field: field,
					filterBy: this.filterBy!,
				});
			}
			let th = thcol(field, this.#columnWidth, vis);
			this.coordinator.connect(vis);
			return th;
		});

		signals.effect(() => {
			this.#orderby = cols.map((col, i) => ({
				field: this.#columns[i],
				order: col.sortState.value,
			}));
			this.#requestData();
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

	#appendRow(d: TableRow, i: number) {
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
	field: flech.Field,
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
	let th: HTMLTableCellElement = html`<th style=${{ overflow: "hidden" }}>
		<div style=${{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
			<span style=${{ marginBottom: "5px", maxWidth: "250px", ...TRUNCATE }}>${field.name}</span>
			${sortButton}
		</div>
		${verticalResizeHandle}
		<span class="gray" style=${{ fontWeight: 400, fontSize: "12px", userSelect: "none" }}>${formatDataType(field.type)}</span>
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

/**
 * Return a formatter for each field in the schema
 */
function formatof(schema: flech.Schema) {
	const format: Record<string, (value: unknown) => string> = Object.create(
		null,
	);
	for (const field of schema.fields) {
		format[field.name] = formatterForValue(field.type);
	}
	return format;
}

/**
 * Return a class type of each field in the schema.
 */
function classof(schema: flech.Schema): Record<string, "number" | "date"> {
	const classes: Record<string, "number" | "date"> = Object.create(null);
	for (const field of schema.fields) {
		switch (field.type.typeId) {
			case flech.Type.Int:
			case flech.Type.Float:
				classes[field.name] = "number";
				break;
			case flech.Type.Date:
			case flech.Type.Timestamp:
				classes[field.name] = "date";
				break;
			default:
				break;
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

/**
 * Adds custom wheel behavior to an HTML element, allowing either horizontal or vertical scrolling based on the scroll input.
 * Prevents default scrolling to stop event propagation to parent elements.
 *
 * @param {HTMLElement} root - The element to apply the scroll behavior to.
 * @param {number} [scrollThreshold=10] - The minimum delta required to trigger horizontal or vertical scrolling.
 */
function addDirectionalScrollWithPreventDefault(
	root: HTMLElement,
	scrollThreshold: number = 10,
) {
	let accumulatedDeltaX = 0;
	let accumulatedDeltaY = 0;

	root.addEventListener(
		"wheel",
		(event) => {
			event.preventDefault();
			accumulatedDeltaX += event.deltaX;
			accumulatedDeltaY += event.deltaY;

			if (Math.abs(accumulatedDeltaX) > Math.abs(accumulatedDeltaY)) {
				// horizontal scrolling
				if (Math.abs(accumulatedDeltaX) > scrollThreshold) {
					root.scrollLeft += accumulatedDeltaX;
					accumulatedDeltaX = 0;
					accumulatedDeltaY = 0; // Reset Y to avoid unintentional vertical scrolling
				}
			} else {
				// vertical scrolling
				if (Math.abs(accumulatedDeltaY) > scrollThreshold) {
					root.scrollTop += accumulatedDeltaY;
					accumulatedDeltaX = 0; // Reset X to avoid unintentional horizontal scrolling
					accumulatedDeltaY = 0;
				}
			}
		},
		{ passive: false },
	);
}
