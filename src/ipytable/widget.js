// @deno-types="npm:htl@0.3.1"
import { html } from "https://esm.sh/htl@0.3.1";
// @deno-types="npm:apache-arrow@16.1.0"
import * as arrow from "https://esm.sh/apache-arrow@16.1.0";
// @deno-types="npm:@js-temporal/polyfill@0.4.4"
import { Temporal } from "https://esm.sh/@js-temporal/polyfill@0.4.4";
// @deno-types="npm:@preact/signals-core@1.6.1"
import * as signals from "https://esm.sh/@preact/signals-core@1.6.1";

// ugh no types for these
import * as mc from "https://cdn.jsdelivr.net/npm/@uwdata/mosaic-core@0.9.0/+esm";
import * as msql from "https://cdn.jsdelivr.net/npm/@uwdata/mosaic-sql@0.9.0/+esm";

/** @typedef {{ schema: arrow.Schema } & AsyncIterator<arrow.Table, arrow.Table>} RecordBatchReader */
/** @typedef {(ctx: { type: "arrow", sql: string }) => Promise<RecordBatchReader>} FetchRecordBatchReader */

/** @typedef {{ _table_name: string, _columns: Array<string> }} Model */

/**
 * @typedef Field
 * @property {string} column
 * @property {string} label
 * @property {string[]} columns
 * @property {string} basis
 * @property {{ column: string, stats: string[] }} stats
 * @property {() => string} toString
 * @property {boolean} [aggregate]
 */

/**
 * @typedef Info
 * @property {string} column
 * @property {string} type
 * @property {boolean} nullable
 * @property {string} sqlType
 * @property {string} table
 * @property {number} [min]
 * @property {number} [max]
 * @property {number} [distinct]
 */

/**
 * @typedef Channel
 * @property {string} as
 * @property {Field} field
 * @property {string} channel
 * @property {string} [type]
 * @property {number} [value] // orderby
 */

/**
 * @typedef ColumnSummaryVis
 * @property {string} name
 * @property {Histogram} client
 */

class TableSummary extends mc.MosaicClient {
	/** @type {Array<Info> | undefined} */
	#info = undefined;

	/**
	 * @param {{ table: string, columns: Array<string> }} source
	 */
	constructor(source) {
		super(undefined);
		this.source = source;
		this._deferred = defer();
	}

	ready() {
		return this._deferred.promise;
	}

	get table() {
		return this.source.table;
	}

	get columns() {
		return this.source.columns;
	}

	/** @type {Info[]} */
	get info() {
		assert(this.#info, "Field info not requested");
		return this.#info;
	}

	/** @returns {Array<{ table: string, column: string, stats: Array<string> }>} */
	// @ts-expect-error - _field type is bad from MosaicClient
	fields() {
		return this.columns.map((column) => ({
			table: this.table,
			column,
			stats: [],
		}));
	}

	/** @param {Array<Info>} info */
	fieldInfo(info) {
		this.#info = info;
		this._deferred.resolve(info);
		return this;
	}
}

/** @implements {Mark} */
class Histogram extends mc.MosaicClient {
	type = "rectY";

	/** @type {{ table: string, column: string, type: "number" | "date" }} */
	#source;

	/** @type {HTMLElement} */
	#el = document.createElement("div");

	/** @type {Array<Channel>} */
	#channels = [];

	/** @type {any} */
	_info = undefined;

	/**
	 * @param {{ table: string, column: string, type: "number" | "date", filterBy?: string }} source
	 */
	constructor(source) {
		super(source.filterBy);
		this.#source = source;
		/**
		 * @param {string} channel
		 * @param {any} entry
		 */
		let process = (channel, entry) => {
			if (isTransform(entry)) {
				const enc = entry(this, channel);
				for (const key in enc) {
					process(key, enc[key]);
				}
			} else if (isFieldObject(channel, entry)) {
				this.#channels.push(fieldEntry(channel, entry));
			} else {
				throw new Error(`Invalid encoding for channel ${channel}`);
			}
		};
		let encodings = {
			x: bin(source.column),
			y: msql.count(),
		};
		for (let [channel, entry] of Object.entries(encodings)) {
			process(channel, entry);
		}
	}

	/** @returns {Array<{ table: string, column: string, stats: Array<string> }>} */
	// @ts-expect-error - _field type is bad from MosaicClient
	fields() {
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
	fieldInfo(info) {
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
	channel(channel) {
		return this.#channels.find((c) => c.channel === channel);
	}

	/**
	 * @param {string} channel
	 * @param {{ exact?: boolean }} [options]
	 * @returns {Channel}
	 */
	channelField(channel, { exact = false } = {}) {
		const c = exact
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
	query(filter = []) {
		return markQuery(this.#channels, this.#source.table).where(filter);
	}

	/**
	 * Provide query result data to the mark.
	 * @param {arrow.Table<{ x1: arrow.Int, x2: arrow.Int, y: arrow.Int }>} data
	 */
	queryResult(data) {
		let bins = Array.from(data, (d) => ({
			x0: d.x1,
			x1: d.x2,
			length: d.y,
		}));
		// TODO: Handle nulls
		let nullCount = 0;
		let nullBinIndex = bins.findIndex((b) => b.x0 == null);
		if (nullBinIndex >= 0) {
			nullCount = bins[nullBinIndex].length;
			bins.splice(nullBinIndex, 1);
		}
		let svg = hist(bins, { nullCount, type: this.#source.type });
		this.#el.appendChild(svg);
		return this;
	}

	get plot() {
		return {
			el: this.#el,
			/** @param {string} _name */
			getAttribute(_name) {
				return undefined;
			},
		};
	}
}

export default () => {
	/** @type {FetchRecordBatchReader} */
	let createRecordBatchReader;
	let coordinator = new mc.Coordinator();
	/** @type {TableSummary} */
	let summary;
	return {
		/** @type {import("npm:@anywidget/types@0.1.9").Initialize<Model>} */
		initialize({ model, experimental: { invoke } }) {
			let connector = {
				/** @param {{ type: "arrow", sql: string }} arg */
				async query({ type, sql }) {
					assert(
						type === "arrow",
						"Only arrow queries are supported",
					);
					let [_, buffers] = await invoke("_query", { sql });
					let table = arrow.tableFromIPC(buffers[0]);
					return table;
				},
			};
			coordinator.databaseConnector(connector);
			summary = new TableSummary({
				table: model.get("_table_name"),
				columns: model.get("_columns"),
			});
			coordinator.connect(summary);
			/**
			 * @param {{ type: "arrow", sql: string }} arg
			 * @returns {Promise<RecordBatchReader>}
			 */
			async function createRecordBatchReaderJupyter({ type, sql }) {
				assert(type === "arrow", "Only arrow queries are supported");
				let [done, [ipc]] = await invoke("_execute", { sql });
				let first = true;
				let table = arrow.tableFromIPC(ipc);
				return {
					schema: table.schema,
					async next() {
						if (first) {
							first = false;
							return { done, value: table };
						}
						[done, [ipc]] = await invoke("_next_batch", {});
						table = arrow.tableFromIPC(ipc);
						return { done, value: table };
					},
				};
			}
			createRecordBatchReader = createRecordBatchReaderJupyter;
		},
		/** @type {import("npm:@anywidget/types@0.1.9").Render<Model>} */
		async render({ model, el }) {
			await summary.ready();

			let $brush = mc.Selection.crossfilter();
			window.$brush = $brush;

			let columns = summary
				.info
				.filter((entry) => entry.type === "number" || entry.type === "date")
				.map(({ column, type }) => {
					assert(
						type === "number" || type === "date",
						"Invalid type",
					);
					return {
						name: column,
						client: new Histogram({
							table: summary.table,
							column,
							type,
							filterBy: $brush,
						}),
					};
				});

			for (let column of columns) {
				coordinator.connect(column.client);
			}

			let table = new ArrowDataTable(createRecordBatchReader, columns, {
				tableName: model.get("_table_name"),
			});
			await table.render();
			el.appendChild(table.node());
		},
	};
};

const TRUNCATE = /** @type {const} */ ({
	whiteSpace: "nowrap",
	overflow: "hidden",
	textOverflow: "ellipsis",
});

class TableRowReader {
	/** @param {RecordBatchReader} reader */
	constructor(reader) {
		this.inner = reader;
		/** @type {boolean} */
		this.done = false;
		/** @type {IterableIterator<arrow.StructRowProxy> | undefined} */
		this.iter = undefined;
	}

	get schema() {
		return this.inner.schema;
	}

	async #readNextBatch() {
		const { value, done } = await this.inner.next();
		this.done = done ?? false;
		this.iter = value[Symbol.iterator]();
	}

	/** @return {IteratorResult<{ kind: "batch"; readNextBatch: () => Promise<void> } | { kind: "row"; data: arrow.StructRowProxy }>} */
	next() {
		if (!this.iter) {
			return {
				value: {
					kind: "batch",
					readNextBatch: this.#readNextBatch.bind(this),
				},
			};
		}
		let result = this.iter.next();
		if (!result.done) {
			return {
				value: {
					kind: "row",
					data: result.value,
				},
			};
		}
		if (this.done) {
			return { done: true, value: undefined };
		}
		this.iter = undefined;
		return this.next();
	}
}

/**
 * @param {arrow.Field} field
 * @param {number} minWidth
 * @param {signals.Signal<"unset" | "asc" | "desc">} sortState
 * @param {ColumnSummaryVis} [vis]
 */
function thcol(field, minWidth, sortState, vis) {
	let buttonVisible = signals.signal(false);
	let width = signals.signal(minWidth);

	function nextSortState() {
		// simple state machine
		// unset -> asc -> desc -> unset
		sortState.value = /** @type {const} */ ({
			"unset": "asc",
			"asc": "desc",
			"desc": "unset",
		})[sortState.value];
	}

	// @deno-fmt-ignore
	let svg = html`<svg style=${{ width: "1.5em" }} fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
		<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 9L12 5.25L15.75 9" />
		<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 15L12 18.75L15.75 15" />
	</svg>`;
	/** @type {SVGPathElement} */
	let uparrow = svg.children[0];
	/** @type {SVGPathElement} */
	let downarrow = svg.children[1];
	/** @type {HTMLDivElement} */
	let verticalResizeHandle = html`<div class="resize-handle"></div>`;
	// @deno-fmt-ignore
	let sortButton = html`<span aria-role="button" class="sort-button" onmousedown=${nextSortState}>${svg}</span>`;
	// @deno-fmt-ignore
	/** @type {HTMLTableCellElement} */
	let th = html`<th title=${field.name}>
		<div style=${{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
			<span style=${{ marginBottom: "5px", maxWidth: "250px", ...TRUNCATE }}>${field.name}</span>
			${sortButton}
		</div>
		${verticalResizeHandle}
		<span class="gray" style=${{ fontWeight: 400, fontSize: "12px", userSelect: "none" }}>${formatDataTypeName(field.type)}</span>
		${vis?.client.plot.el}
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
		function onMouseMove(/** @type {MouseEvent} */ event) {
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

	return th;
}

// Faux HTMLElement that we don't need to add to `customElements`.
// TODO: Switch to real HTMLElement when building for the browser.
class _HTMLElement {
	/** @type {HTMLElement} */
	#root;
	constructor() {
		this.#root = document.createElement("div");
		/** @type {ShadowRoot} */
		this.shadowRoot = this.#root.attachShadow({ mode: "open" });
	}
	node() {
		return this.#root;
	}
}

/** @param {string} field */
function asc(field) {
	// doesn't sort nulls for asc
	let expr = msql.desc(field);
	expr._expr[0] = expr._expr[0].replace("DESC", "ASC");
	return expr;
}

class ArrowDataTable extends _HTMLElement {
	/** @type {FetchRecordBatchReader} */
	#execute;
	/** @type {Array<{ field: string; order: "asc" | "desc" }>}*/
	#orderby;
	/** @type {() => Promise<void>} */
	#resetTable = async () => {};
	/** @type {Array<ColumnSummaryVis>} */
	#columns;
	/** @type {{ height?: number, tableName: string }} */
	#options;

	/**
	 * @param {FetchRecordBatchReader} execute
	 * @param {Array<ColumnSummaryVis>} columns
	 * @param {{ height?: number, tableName?: string }} options
	 */
	constructor(execute, columns, options = {}) {
		super();
		this.#execute = execute;
		this.#orderby = [];
		this.#columns = columns;
		this.#options = { tableName: "df", ...options };
		this.shadowRoot.appendChild(html`<style>${STYLES}</style>`);
	}

	async #createRowReader() {
		let query = msql.Query
			.from(this.#options.tableName)
			.select("*");
		if (this.#orderby.length > 0) {
			query.orderby(
				...this.#orderby.map((o) =>
					o.order === "asc" ? asc(o.field) : msql.desc(o.field)
				),
			);
		}
		let sql = query.toString();
		let recordBatchReader = await this.#execute({ type: "arrow", sql });
		return new TableRowReader(recordBatchReader);
	}

	async render() {
		let rowHeight = 22;
		let rows = 11.5;
		let tableLayout = "fixed";
		let columnWidth = 125;
		let headerHeight = "50px";
		let maxHeight = `${(rows + 1) * rowHeight - 1}px`;

		// if maxHeight is set, calculate the number of rows to display
		if (this.#options.height) {
			rows = Math.floor(this.#options.height / rowHeight);
			maxHeight = `${this.#options.height}px`;
		}

		/** @type {HTMLDivElement} */
		let root = html`<div class="ipytable" style=${{ maxHeight }}>`;

		/** @type {number} */
		let iterindex = 0;
		/** @type {TableRowReader} */
		let reader = await this.#createRowReader();
		let cols = reader.schema.fields.map((field) => field.name);
		let format = formatof(reader.schema);
		let classes = classof(reader.schema);

		let tbody = html`<tbody>`;
		// @deno-fmt-ignore
		let thead = html`<thead>
			<tr style=${{ height: headerHeight }}>
				<th></th>
				${reader.schema.fields.map((field) => {
					/** @type {signals.Signal<"unset" | "asc" | "desc">} */
					let toggle = signals.signal("unset");
					signals.effect(() => {
						let orderby = this.#orderby.filter((o) => o.field !== field.name);
						if (toggle.value !== "unset") {
							orderby.unshift({ field: field.name, order: toggle.value });
						}
						this.#orderby = orderby;
						this.#resetTable();
					});
					let vis = this.#columns.find((c) => c.name === field.name);
					return thcol(field, columnWidth, toggle, vis);
				})}
				<th style=${{
			width: "99%",
			borderLeft: "none",
			borderRight: "none",
		}}></th>
			</tr>
		</thead>`;

		let tr = html`<tr><td></td>${
			cols.map((col) => html.fragment`<td class=${classes[col]}></td>`)
		}
			<td style=${{
			width: "99%",
			borderLeft: "none",
			borderRight: "none",
		}}></td>
		</tr>`;

		// @deno-fmt-ignore
		root.appendChild(
			html.fragment`<table style=${{ tableLayout }}>${thead}${tbody}</table>`
		);

		this.#resetTable = async () => {
			reader = await this.#createRowReader();
			iterindex = 0;
			tbody.innerHTML = "";
			root.scrollTop = 0;
			appendRows(rows * 2);
		};

		/**
		 * Number of rows to append
		 * @param {number} nrows
		 */
		async function appendRows(nrows) {
			while (nrows >= 0) {
				let result = reader.next();
				if (result.done) {
					// we've exhausted all rows
					break;
				}
				if (result.value.kind === "row") {
					appendRow(result.value.data, iterindex++);
					nrows--;
					continue;
				}
				if (result.value.kind === "batch") {
					await result.value.readNextBatch();
					continue;
				}
			}
		}

		/**
		 * @param {arrow.StructRowProxy} d
		 * @param {number} i
		 */
		function appendRow(d, i) {
			const itr = tr.cloneNode(true);
			let td = itr.childNodes[0];
			td.appendChild(document.createTextNode(String(i)));
			for (let j = 0; j < cols.length; ++j) {
				td = itr.childNodes[j + 1];
				td.classList.remove("gray");
				let col = cols[j];
				/** @type {string} */
				let stringified = format[col](d[col]);
				if (shouldGrayoutValue(stringified)) {
					td.classList.add("gray");
				}
				let value = document.createTextNode(stringified);
				td.appendChild(value);
			}
			tbody.append(itr);
		}

		// scroll behavior
		{
			root.addEventListener("scroll", async () => {
				let isAtBottom =
					root.scrollHeight - root.scrollTop < rows * rowHeight * 1.5;
				if (isAtBottom) {
					await appendRows(rows);
				}
			});
		}

		// highlight on hover
		{
			root.addEventListener("mouseover", (event) => {
				if (
					isTableCellElement(event.target) &&
					isTableRowElement(event.target.parentNode)
				) {
					const cell = event.target;
					const row = event.target.parentNode;
					highlight(cell, row);
				}
			});
			root.addEventListener("mouseout", (event) => {
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

		appendRows(rows * 2);
		this.shadowRoot?.appendChild(root);
	}
}

/**
 * @param {HTMLTableCellElement} cell
 * @param {HTMLTableRowElement} row
 */
function highlight(cell, row) {
	if (row.firstChild !== cell && cell !== row.lastElementChild) {
		cell.style.border = "1px solid var(--moon-gray)";
	}
	row.style.backgroundColor = "var(--light-silver)";
}

/**
 * @param {HTMLTableCellElement} cell
 * @param {HTMLTableRowElement} row
 */
function removeHighlight(cell, row) {
	cell.style.removeProperty("border");
	row.style.removeProperty("background-color");
}

/**
 * @param {unknown} node
 * @returns {node is HTMLTableDataCellElement}
 */
function isTableCellElement(node) {
	// @ts-expect-error - tagName is not defined on unknown
	return node?.tagName === "TD";
}

/**
 * @param {unknown} node
 * @returns {node is HTMLTableRowElement}
 */
function isTableRowElement(node) {
	return node instanceof HTMLTableRowElement;
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
}

.highlight {
	background-color: var(--light-silver);
}

.highlight-cell {
	border: 1px solid var(--moon-gray);
}

.ipytable {
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
  pointer-events: all;
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
 * @param {unknown} condition
 * @param {string} message
 * @returns {asserts condition}
 */
function assert(condition, message) {
	if (!condition) throw new Error(message);
}

/** @param {arrow.Schema} schema */
function formatof(schema) {
	/** @type {Record<string, (value: any) => string>} */
	const format = Object.create(null);
	for (const field of schema.fields) {
		format[field.name] = formatterForDataTypeValue(field.type);
	}
	return format;
}

/**
 * @param {arrow.Schema} schema
 * @returns {Record<string, "number" | "date">}
 */
function classof(schema) {
	/** @type {Record<string, "number" | "date">} */
	const classes = Object.create(null);
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

/**
 * A utility function to create a formatter for a given data type.
 *
 * The datatype is only used for type inference to ensure that the formatter is
 * correctly typed.
 *
 * @template TValue
 *
 * @param {TValue} _arrowDataTypeValue
 * @param {(value: TValue) => string} format
 *
 * @returns {(value: TValue | null | undefined) => string}
 */
function fmt(_arrowDataTypeValue, format, log = false) {
	return (value) => {
		if (log) console.log(value);
		if (value === undefined || value === null) {
			return stringify(value);
		}
		return format(value);
	};
}

/**
 * @param {any} x
 * @returns {string}
 */
function stringify(x) {
	return `${x}`;
}

/** @param {arrow.DataType} type */
function formatDataTypeName(type) {
	// special case some types
	if (arrow.DataType.isLargeBinary(type)) return "large binary";
	if (arrow.DataType.isLargeUtf8(type)) return "large utf8";
	// otherwise, just stringify and lowercase
	return type
		.toString()
		.toLowerCase()
		.replace("<second>", "[s]")
		.replace("<millisecond>", "[ms]")
		.replace("<microsecond>", "[µs]")
		.replace("<nanosecond>", "[ns]")
		.replace("<day>", "[day]")
		.replace("dictionary<", "dict<");
}

/**
 * @param {arrow.DataType} type
 * @returns {(value: any) => string}
 */
function formatterForDataTypeValue(type) {
	if (arrow.DataType.isNull(type)) {
		return fmt(type.TValue, stringify);
	}

	if (
		arrow.DataType.isInt(type) ||
		arrow.DataType.isFloat(type)
	) {
		return fmt(type.TValue, (value) => {
			if (Number.isNaN(value)) return "NaN";
			return value === 0 ? "0" : value.toLocaleString("en"); // handle negative zero
		});
	}

	if (
		arrow.DataType.isBinary(type) ||
		arrow.DataType.isFixedSizeBinary(type) ||
		arrow.DataType.isLargeBinary(type)
	) {
		return fmt(type.TValue, (bytes) => {
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
	}

	if (arrow.DataType.isUtf8(type) || arrow.DataType.isLargeUtf8(type)) {
		return fmt(type.TValue, (text) => text);
	}

	if (arrow.DataType.isBool(type)) {
		return fmt(type.TValue, stringify);
	}

	if (arrow.DataType.isDecimal(type)) {
		return fmt(type.TValue, () => "TODO");
	}

	if (arrow.DataType.isDate(type)) {
		return fmt(type.TValue, (ms) => {
			// Always returns value in milliseconds
			// https://github.com/apache/arrow/blob/89d6354068c11a66fcec2f34d0414daca327e2e0/js/src/visitor/get.ts#L167-L171
			return Temporal.Instant
				.fromEpochMilliseconds(ms)
				.toZonedDateTimeISO("UTC")
				.toPlainDate()
				.toString();
		});
	}

	if (arrow.DataType.isTime(type)) {
		return fmt(type.TValue, (ms) => {
			return instantFromTimeUnit(ms, type.unit)
				.toZonedDateTimeISO("UTC")
				.toPlainTime()
				.toString();
		});
	}

	if (arrow.DataType.isTimestamp(type)) {
		return fmt(type.TValue, (ms) => {
			// Always returns value in milliseconds
			// https://github.com/apache/arrow/blob/89d6354068c11a66fcec2f34d0414daca327e2e0/js/src/visitor/get.ts#L173-L190
			return Temporal.Instant
				.fromEpochMilliseconds(ms)
				.toZonedDateTimeISO("UTC")
				.toPlainDateTime()
				.toString();
		});
	}

	if (arrow.DataType.isInterval(type)) {
		return fmt(type.TValue, (_value) => {
			return "TODO";
		});
	}

	if (arrow.DataType.isDuration(type)) {
		return fmt(type.TValue, (bigintValue) => {
			// https://tc39.es/proposal-temporal/docs/duration.html#toString
			return durationFromTimeUnit(bigintValue, type.unit).toString();
		});
	}

	if (arrow.DataType.isList(type)) {
		return fmt(type.TValue, (value) => {
			// TODO: Some recursive formatting?
			return value.toString();
		});
	}

	if (arrow.DataType.isStruct(type)) {
		return fmt(type.TValue, (value) => {
			// TODO: Some recursive formatting?
			return value.toString();
		});
	}

	if (arrow.DataType.isUnion(type)) {
		return fmt(type.TValue, (_value) => {
			return "TODO";
		});
	}
	if (arrow.DataType.isMap(type)) {
		return fmt(type.TValue, (_value) => {
			return "TODO";
		});
	}

	if (arrow.DataType.isDictionary(type)) {
		let formatter = formatterForDataTypeValue(type.dictionary);
		return fmt(type.TValue, formatter);
	}

	return () => `Unsupported type: ${type}`;
}

/**
 * @param {number | bigint} value
 * @param {arrow.TimeUnit} unit
 */
function instantFromTimeUnit(value, unit) {
	if (unit === arrow.TimeUnit.SECOND) {
		if (typeof value === "bigint") value = Number(value);
		return Temporal.Instant.fromEpochSeconds(value);
	}
	if (unit === arrow.TimeUnit.MILLISECOND) {
		if (typeof value === "bigint") value = Number(value);
		return Temporal.Instant.fromEpochMilliseconds(value);
	}
	if (unit === arrow.TimeUnit.MICROSECOND) {
		if (typeof value === "number") value = BigInt(value);
		return Temporal.Instant.fromEpochMicroseconds(value);
	}
	if (unit === arrow.TimeUnit.NANOSECOND) {
		if (typeof value === "number") value = BigInt(value);
		return Temporal.Instant.fromEpochNanoseconds(value);
	}
	throw new Error("Invalid TimeUnit");
}

/**
 * @param {number | bigint} value
 * @param {arrow.TimeUnit} unit
 */
function durationFromTimeUnit(value, unit) {
	// TODO: Temporal.Duration polyfill only supports number not bigint
	value = Number(value);
	if (unit === arrow.TimeUnit.SECOND) {
		return Temporal.Duration.from({ seconds: value });
	}
	if (unit === arrow.TimeUnit.MILLISECOND) {
		return Temporal.Duration.from({ milliseconds: value });
	}
	if (unit === arrow.TimeUnit.MICROSECOND) {
		return Temporal.Duration.from({ microseconds: value });
	}
	if (unit === arrow.TimeUnit.NANOSECOND) {
		return Temporal.Duration.from({ nanoseconds: value });
	}
	throw new Error("Invalid TimeUnit");
}

/** @param {string} value */
function shouldGrayoutValue(value) {
	return (
		value === "null" ||
		value === "undefined" ||
		value === "NaN" ||
		value === "TODO"
	);
}

/// bin stuff

const Transform = Symbol();

/** @typedef {"linear" | "log" | "pow" | "symlog" | "time"} ScaleType */

/**
 * @typedef Mark
 * @property {string} type
 * @property {{getAttribute: (name: string) => any}} plot
 * @property {(channel: string, opts?: { exact?: boolean }) => Channel} channelField
 */

/**
 * @param {Mark} mark
 * @param {string} channel
 */
function channelScale(mark, channel) {
	const { plot } = mark;

	let scaleType = plot.getAttribute(`${channel}Scale`);
	if (!scaleType) {
		const { type } = mark.channelField(channel);
		scaleType = type === "date" ? "time" : "linear";
	}

	/** @type {{ type: ScaleType, base?: number, exponent?: number, constant?: number }} */
	const options = { type: scaleType };
	switch (scaleType) {
		case "log":
			options.base = plot.getAttribute(`${channel}Base`) ?? 10;
			break;
		case "pow":
			options.exponent = plot.getAttribute(`${channel}Exponent`) ?? 1;
			break;
		case "symlog":
			options.constant = plot.getAttribute(`${channel}Constant`) ?? 1;
			break;
	}
	return msql.scaleTransform(options);
}

// @deno-fmt-ignore
const EXTENT = new Set([ "rectY-x", "rectX-y", "rect-x", "rect-y", "ruleY-x", "ruleX-y" ]);

/**
 * @param {Mark} mark
 * @param {string} channel
 */
function hasExtent(mark, channel) {
	return EXTENT.has(`${mark.type}-${channel}`);
}

/**
 * @param {string} field
 * @param {{}} [options]
 * @returns {(mark: Mark, channel: string) => Record<string, Field>}
 */
function bin(field, options = {}) {
	/**
	 * @param {Mark} mark
	 * @param {string} channel
	 */
	const fn = (mark, channel) => {
		if (hasExtent(mark, channel)) {
			// @deno-fmt-ignore
			return {
				[`${channel}1`]: binField(mark, channel, field, options),
				[`${channel}2`]: binField(mark, channel, field, { ...options, offset: 1 }),
			};
		}
		return {
			[channel]: binField(mark, channel, field, options),
		};
	};
	fn[Transform] = true;
	return fn;
}

const YEAR = "year";
const MONTH = "month";
const DAY = "day";
const HOUR = "hour";
const MINUTE = "minute";
const SECOND = "second";
const MILLISECOND = "millisecond";

const durationSecond = 1000;
const durationMinute = durationSecond * 60;
const durationHour = durationMinute * 60;
const durationDay = durationHour * 24;
const durationWeek = durationDay * 7;
const durationMonth = durationDay * 30;
const durationYear = durationDay * 365;

const intervals = /** @type {const} */ ([
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
]);

/**
 * @param {number} min
 * @param {number} max
 * @param {number} steps
 * @returns {{ interval: typeof intervals[number][0] | typeof MILLISECOND, step: number }}
 */
function timeInterval(min, max, steps) {
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
 * @param {Mark} mark
 * @param {string} channel
 * @param {string} column
 * @param {{ interval?: "number" | "date", steps?: number, offset?: number, step?: number }} options
 */
function binField(mark, channel, column, options) {
	return {
		column,
		label: column,
		get columns() {
			return [column];
		},
		get basis() {
			return column;
		},
		get stats() {
			return { column, stats: ["min", "max"] };
		},
		toString() {
			const { type, min, max } = mark.channelField(channel);
			assert(
				type !== undefined && min !== undefined && max !== undefined,
				"Expected channel to have type, min, and max",
			);
			const { interval: i, steps, offset = 0 } = options;
			const interval = i ??
				(type === "date" || hasTimeScale(mark, channel) ? "date" : "number");

			if (interval === "number") {
				// perform number binning
				const { apply, sqlApply, sqlInvert } = channelScale(
					mark,
					channel,
				);
				const b = bins(apply(min), apply(max), options);
				const col = sqlApply(column);
				const base = b.min === 0 ? col : `(${col} - ${b.min})`;
				assert(
					typeof b.steps === "number",
					"Expected steps to be a number",
				);
				const alpha = `${(b.max - b.min) / b.steps}::DOUBLE`;
				const off = offset ? `${offset} + ` : "";
				const expr = `${b.min} + ${alpha} * (${off}FLOOR(${base} / ${alpha}))`;
				return `${sqlInvert(expr)}`;
			} else {
				// perform date/time binning
				const { interval: unit, step = 1 } = interval === "date"
					? timeInterval(min, max, steps || 40)
					: options;
				const off = offset ? ` + INTERVAL ${offset * step} ${unit}` : "";
				assert(unit !== undefined, "Expected unit to be defined");
				return `(${dateBin(column, unit, step)}${off})`;
			}
		},
	};
}

/**
 * @param {Mark} mark
 * @param {string} channel
 */
function hasTimeScale(mark, channel) {
	const scale = mark.plot.getAttribute(`${channel}Scale`);
	return scale === "utc" || scale === "time";
}

/**
 * @param {number} span
 * @param {number} steps
 * @param {number} [minstep]
 * @param {number} [logb]
 */
function binStep(span, steps, minstep = 0, logb = Math.LN10) {
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

/**
 * @param {number} min
 * @param {number} max
 * @param {{ steps?: number, minstep?: number, nice?: boolean, step?: number }} options
 */
function bins(min, max, options) {
	let { step, steps, minstep = 0, nice = true } = options;

	if (nice !== false) {
		// use span to determine step size
		const span = max - min;
		const logb = Math.LN10;
		step = step || binStep(span, steps || 25, minstep, logb);

		// adjust min/max relative to step
		let v = Math.log(step);
		const precision = v >= 0 ? 0 : ~~(-v / logb) + 1;
		const eps = Math.pow(10, -precision - 1);
		v = Math.floor(min / step + eps) * step;
		min = min < v ? v - step : v;
		max = Math.ceil(max / step) * step;
		steps = Math.round((max - min) / step);
	}

	return { min, max, steps };
}

/**
 * @param {string} expr
 * @param {string} interval
 * @param {number} [steps]
 */
function dateBin(expr, interval, steps = 1) {
	const i = `INTERVAL ${steps} ${interval}`;
	const d = msql.asColumn(expr);
	return msql.sql`TIME_BUCKET(${i}, ${d})`.annotate({ label: interval });
}

/**
 * @param {string} channel
 * @param {Field} field
 * @returns {Channel}
 */
function fieldEntry(channel, field) {
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
function isFieldObject(channel, field) {
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
function isTransform(x) {
	// @ts-expect-error - TS doesn't support symbol types
	return typeof x === "function" && x[Transform] === true;
}

/**
 * TODO: Replace with Promise.withResolvers() when available
 *
 * @template T
 * @returns {{ promise: Promise<T>, resolve: (value: T) => void, reject: (reason: any) => void }}
 */
function defer() {
	let resolve, reject;
	let promise = new Promise((res, rej) => {
		resolve = res;
		reject = rej;
	});
	// @ts-expect-error - resolve and reject are assigned
	return { resolve, reject, promise };
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
export function markQuery(channels, table, skip = []) {
	const q = msql.Query.from({ source: table });
	const dims = new Set();
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

// @deno-types="npm:@types/d3@7.4.3"
import * as d3 from "https://esm.sh/d3@7.8.5";
// TODO: idk these types are really annoying
let scaleLinear = /** @type {import("npm:@types/d3-scale").scaleLinear} */ (d3
	// @ts-expect-error - d3 types are incorrect
	.scaleLinear);
let scaleTime = /** @type {import("npm:@types/d3-scale").scaleLinear} */ (d3
	// @ts-expect-error - d3 types are incorrect
	.scaleTime);
let create = /** @type {import("npm:@types/d3-selection").create} */ (d3
	// @ts-expect-error - d3 types are incorrect
	.create);
let select = /** @type {import("npm:@types/d3-selection").select} */ (d3
	// @ts-expect-error - d3 types are incorrect
	.select);
let brushX =
	// @ts-expect-error - d3 types are incorrect
	/** @type {import("npm:@types/d3-brush").brushX} */ (d3.brushX);
let axisBottom =
	// @ts-expect-error - d3 types are incorrect
	/** @type {import("npm:@types/d3-axis").axisBottom} */ (d3.axisBottom);
let format = // @ts-expect-error - d3 types are incorrect
	/** @type {import("npm:@types/d3-format").format} */ (d3.format);
let min = // @ts-expect-error - d3 types are incorrect
	/** @type {import("npm:@types/d3-array").min} */ (d3.min);
let max = // @ts-expect-error - d3 types are incorrect
	/** @type {import("npm:@types/d3-array").max} */ (d3.max);
let ascending = // @ts-expect-error - d3 types are incorrect
	/** @type {import("npm:@types/d3-array").max} */ (d3.ascending);

/**
 * @typedef Bin
 * @property {number} x0
 * @property {number} x1
 * @property {number} length
 */

/**
 * @typedef HistogramOptions
 * @property {number} [width]
 * @property {number} [height]
 * @property {number} [marginTop]
 * @property {number} [marginRight]
 * @property {number} [marginBottom]
 * @property {number} [marginLeft]
 * @property {number} [nullCount]
 * @property {string} [fillColor]
 * @property {string} [nullFillColor]
 * @property {"number" | "date"} [type]
 * @property {SVGElement} [el]
 */

let timeFormat = /** @type {import("npm:@types/d3-scale").scaleLinear} */ (d3
	// @ts-expect-error - d3 types are incorrect
	.timeFormat);

let formatMap = {
	[MILLISECOND]: timeFormat("%L"),
	[SECOND]: timeFormat("%S s"),
	[MINUTE]: timeFormat("%H:%M"),
	[HOUR]: timeFormat("%H:%M"),
	[DAY]: timeFormat("%b %d"),
	[MONTH]: timeFormat("%b %Y"),
	[YEAR]: timeFormat("%Y"),
};

/**
 * @param {Array<Bin>} data
 * @param {HistogramOptions} [options]
 */
function hist(data, options = {}) {
	let bins = [...data];
	bins.sort((a, b) => a.x0 - b.x0);

	let {
		width = 125,
		height = 40,
		marginTop = 0,
		marginRight = 2,
		marginBottom = 12,
		marginLeft = 2,
		nullCount = 0,
		fillColor = "#fdba74",
		nullFillColor = "#c2410c",
	} = options;

	let avgBinWidth = nullCount === 0 ? 0 : width / (bins.length + 1);

	let x, xAxis;
	let midFirstBin = (bins[0].x0 + bins[0].x1) / 2;
	let midLastBin = (bins[bins.length - 1].x0 + bins[bins.length - 1].x1) / 2;

	if (options.type === "date") {
		let interval = timeInterval(
			bins[0].x0,
			bins[bins.length - 1].x1,
			bins.length,
		);
		x = scaleTime()
			.domain([bins[0].x0, bins[bins.length - 1].x1])
			.range([marginLeft + avgBinWidth, width - marginRight]);
		xAxis = axisBottom(x)
			.tickValues([midFirstBin, midLastBin])
			.tickFormat(formatMap[interval.interval])
			.tickSize(2.5);
	} else {
		x = scaleLinear()
			.domain([bins[0].x0, bins[bins.length - 1].x1])
			.range([marginLeft + avgBinWidth, width - marginRight]);
		xAxis = axisBottom(x)
			.tickValues([midFirstBin, midLastBin])
			.tickFormat(format("~s"))
			.tickSize(2.5);
	}

	let y = scaleLinear()
		.domain([0, Math.max(nullCount, ...bins.map((d) => d.length))])
		.range([height - marginBottom, marginTop]);

	let svg = create("svg")
		.attr("width", width)
		.attr("height", height)
		.attr("viewBox", [0, 0, width, height])
		.attr("style", "max-width: 100%; height: auto; overflow: visible;");

	svg
		.append("g")
		.attr("fill", fillColor)
		.selectAll()
		.data(bins)
		.join("rect")
		.attr("x", (d) => x(d.x0) + 1)
		.attr("width", (d) => x(d.x1) - x(d.x0) - 1)
		.attr("y", (d) => y(d.length))
		.attr("height", (d) => y(0) - y(d.length));

	// Add the null bin separately
	if (nullCount > 0) {
		let nullXScale = scaleLinear()
			.range([marginLeft, marginLeft + avgBinWidth]);

		let nullGrp = svg
			.append("g")
			.attr("fill", nullFillColor)
			.attr("color", nullFillColor);

		nullGrp.append("rect")
			.attr("x", nullXScale(0))
			.attr("width", nullXScale(1) - nullXScale(0))
			.attr("y", y(nullCount))
			.attr("height", y(0) - y(nullCount))
			.attr("fill", nullFillColor);

		// Append the x-axis and add a null tick
		let grp = nullGrp.append("g")
			.attr("transform", `translate(0,${height - marginBottom})`)
			.append("g")
			.attr("transform", `translate(${nullXScale(0.5)}, 0)`)
			.attr("class", "tick");

		grp
			.append("line")
			.attr("stroke", "currentColor")
			.attr("y2", 2.5);

		grp
			.append("text")
			.attr("fill", "currentColor")
			.attr("y", 4.5)
			.attr("dy", "0.71em")
			.attr("text-anchor", "middle")
			.attr("font-size", "10")
			.text("∅");
	}

	svg
		.append("g")
		.attr("class", "brush")
		.call(
			brushX().extent([
				[marginLeft + avgBinWidth, marginTop],
				[width - marginRight, height - marginBottom],
			]),
		);

	svg
		.append("g")
		.attr("transform", `translate(0,${height - marginBottom})`)
		.call(xAxis)
		.call((g) => {
			g.select(".domain").remove();
			g.attr("class", "gray");
			g.selectAll(".tick text")
				.attr("text-anchor", (_, i) => i === 0 ? "start" : "end")
				.attr("dx", (_, i) => i === 0 ? "-0.25em" : "0.25em");
		});

	// Apply styles for all axis ticks
	svg.selectAll(".tick")
		.attr("font-family", "var(--sans-serif)")
		.attr("font-weight", "normal")
		.attr("style", "user-select: none;");

	let node = svg.node();
	assert(node, "Expected SVGElement");

	return node;
}

class Interval1D {
	/**
	 * @param {Histogram} client
	 * @param {{
	 *   channel: string;
	 *   selection: mc.Selection,
	 *   field?: string;
	 *   pixelSize?: number;
	 *   peers?: boolean;
	 * }} options
	 */
	constructor(client, {
		channel,
		selection,
		field = undefined,
		pixelSize = 1,
		peers = true,
	}) {
		this.client = client;
		this.channel = channel;
		this.pixelSize = pixelSize || 1;
		this.selection = selection;
		this.peers = peers;
		this.field = field || client.channelField(channel).field;
		assert(channel === "x", "Expected channel to be x");
		this.brush = d3.brushX();
		this.brush.on("brush end", ({ selection }) => this.publish(selection));
	}

	reset() {
		this.value = undefined;
		if (this.g) this.brush.reset(this.g);
	}

	activate() {
		this.selection.activate(this.clause(this.value || [0, 1]));
	}

	/**
	 * @param {number[]} extent
	 */
	publish(extent) {
		let range = undefined;
		let scale = this.scale;
		let g = this.g;
		assert(scale, "Expected scale to be defined");
		assert(g, "Expected g to be defined");
		if (extent) {
			range = extent
				.map((v) => invert(v, scale, this.pixelSize))
				.sort((a, b) => a - b);
		}
		if (!closeTo(range, this.value)) {
			this.value = range;
			g.call(this.brush.moveSilent, extent);
			this.selection.update(this.clause(range));
		}
	}

	/**
	 * @param {number[] | undefined} value
	 */
	clause(value) {
		const { client, pixelSize, field, scale } = this;
		return mc.interval(field, value, {
			source: this,
			clients: this.peers ? client.plot.markSet : new Set().add(client),
			scale,
			pixelSize,
		});
	}

	/**
	 * @param {SVGElement & { scale: (name: "x" | "y" | string) => import("npm:@types/d3-scale").ScaleLinear<number, number> }} svg
	 * @param {ReturnType<typeof select>} root
	 */
	init(svg, root) {
		const { brush, channel } = this;
		this.scale = svg.scale(channel);

		const rx = svg.scale("x").range;
		const ry = svg.scale("y").range;
		// @ts-expect-error - d3 types are incorrect
		brush.extent([[min(rx), min(ry)], max(rx), max(ry)]);
		// @ts-expect-error - d3 types are incorrect
		const range = this.value?.map(this.scale.apply).sort(ascending);
		const facets = select(svg).selectAll('g[aria-label="facet"]');
		// @ts-expect-error - d3 types are incorrect
		root = facets.size() ? facets : select(root ?? svg);
		this.g = root
			.append("g")
			.attr("class", `interval-${channel}`)
			.each(patchScreenCTM)
			.call(brush)
			.call(brush.moveSilent, range);

		svg.addEventListener("pointerenter", (evt) => {
			if (!evt.buttons) this.activate();
		});
	}
}

/**
 * @param {number} value
 * @param {import("npm:@types/d3-scale").ScaleLinear<number, number>} scale
 * @param {number} [pixelSize]
 * @returns {number} pixelSize
 */
function invert(value, scale, pixelSize = 1) {
	return scale.invert(pixelSize * Math.floor(value / pixelSize));
}

/**
 * Patch the getScreenCTM method to memoize the last non-null
 * result seen. This will let the method continue to function
 * even after the node is removed from the DOM.
 */
function patchScreenCTM() {
	/** @type {SVGGraphicsElement} */
	// @ts-ignore - this is a SVGGraphicsElement
	// deno-lint-ignore no-this-alias
	let node = this;
	const getScreenCTM = node.getScreenCTM;
	/** @type {DOMMatrix | null} */
	let memo;
	node.getScreenCTM = () => {
		return node.isConnected ? (memo = getScreenCTM.call(node)) : memo;
	};
}

const closeTo = (() => {
	const EPS = 1e-12;
	/** @type {(a: number[] | undefined, b: number[] | undefined) => boolean} */
	return (a, b) => {
		return a === b || (
			a && b &&
			Math.abs(a[0] - b[0]) < EPS &&
			Math.abs(a[1] - b[1]) < EPS
		) || false;
	};
})();
