// @deno-types="npm:htl@0.3.1"
import { html } from "https://esm.sh/htl@0.3.1";
// @deno-types="npm:apache-arrow@16.1.0"
import * as arrow from "https://esm.sh/apache-arrow@16.1.0";
// @deno-types="npm:@js-temporal/polyfill@0.4.4"
import { Temporal } from "https://esm.sh/@js-temporal/polyfill@0.4.4";
// @deno-types="npm:@preact/signals-core@1.6.1"
import * as signals from "https://esm.sh/@preact/signals-core@1.6.1";

/** @typedef {{ schema: arrow.Schema } & AsyncIterator<arrow.Table, arrow.Table>} RecordBatchReader */
/** @typedef {(sql: string) => Promise<RecordBatchReader>} FetchRecordBatchReader */
/** @typedef {{ orderby: Array<{ field: string; order: "asc" | "desc" }>; }} QueryState */

/** @typedef {{}} Model */

export default () => {
	/** @type {FetchRecordBatchReader} */
	let createRecordBatchReader;
	return {
		/** @type {import("npm:@anywidget/types@0.1.9").Initialize<Model>} */
		initialize({ experimental: { invoke } }) {
			/**
			 * @param {string} sql
			 * @returns {Promise<RecordBatchReader>}
			 */
			async function createRecordBatchReaderJupyter(sql) {
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
		async render({ el }) {
			let dataTableElement = await createArrowDataTable(
				createRecordBatchReader,
			);
			el.appendChild(dataTableElement.node());
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
 */
function thcol(field, minWidth, sortState) {
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
		<span class="gray" style=${{ fontWeight: 400, fontSize: "12px" }}>${formatDataTypeName(field.type)}</span>
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

class ArrowDataTable extends _HTMLElement {
	/** @type {FetchRecordBatchReader} */
	#runQuery;
	/** @type {QueryState} */
	#queryState;

	/** @type {() => Promise<void>} */
	#resetTable = async () => {};

	/** @type {{ height?: number }} */
	#options;

	/**
	 * @param {FetchRecordBatchReader} runQuery
	 * @param {{ height?: number }} options
	 */
	constructor(runQuery, options = {}) {
		super();
		this.#runQuery = runQuery;
		this.#queryState = { orderby: [] };
		this.#options = options;
		this.shadowRoot.appendChild(html`<style>${STYLES}</style>`);
	}

	async #createRowReader() {
		let sql = "SELECT * FROM df";
		if (this.#queryState.orderby.length) {
			sql += " ORDER BY " + this.#queryState.orderby
				.map((o) => `${o.field} ${o.order} NULLS LAST`)
				.join(", ");
		}
		console.debug(sql);
		let recordBatchReader = await this.#runQuery(sql);
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
						let orderby = this.#queryState.orderby.filter((o) => o.field !== field.name);
						if (toggle.value !== "unset") {
							orderby.unshift({ field: field.name, order: toggle.value });
						}
						this.#queryState.orderby = orderby;
						this.#resetTable();
					});
					return thcol(field, columnWidth, toggle);
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
  padding: 5px 6px;
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

/**
 * @param {FetchRecordBatchReader} runQuery
 * @param {{ height?: number }} options
 * @returns {Promise<ArrowDataTable>}
 */
async function createArrowDataTable(runQuery, options = {}) {
	let table = new ArrowDataTable(runQuery, options);
	await table.render();
	return table;
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
