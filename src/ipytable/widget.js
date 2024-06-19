// @deno-types="npm:htl"
import { html } from "https://esm.sh/htl@0.3.1";
// @deno-types="npm:apache-arrow@16.1.0"
import * as arrow from "https://esm.sh/apache-arrow@16.1.0";
// @deno-types="npm:@js-temporal/polyfill"
import { Temporal } from "https://esm.sh/@js-temporal/polyfill@0.4.4";
// @deno-types="npm:quick-lru@7.0.0";
import QuickLRU from "https://esm.sh/quick-lru@7.0.0";
// @deno-types="npm:@uwdata/mosaic-sql";
import * as sql from "https://esm.sh/@uwdata/mosaic-sql@0.9.0";

/** @typedef {(query: sql.Query) => AsyncIterator<arrow.Table, arrow.Table>} QueryEngine */

export default () => {
	/** @type {(query: sql.Query) => AsyncIterator<arrow.Table, arrow.Table>} */
	let runQuery;
	return {
		/** @type {import("npm:@anywidget/types@0.1.9").Initialize<{ _ipc: DataView }>} */
		initialize({ experimental }) {
			/** @type {QuickLRU<string, arrow.Table>} */
			let cache = new QuickLRU({ maxSize: 10 });
			/** @param {string} sql */
			async function cachedQuery(sql) {
				// let table = cache.get(sql);
				// if (table) return table;
				let [_, buffers] = await experimental.invoke("_run_query", {
					sql,
				});
				let table = arrow.tableFromIPC(buffers[0]);
				// cache.set(sql, table);
				return table;
			}
			/**
			 * @param {sql.Query} query
			 * @param {number} [batchSize]
			 * @returns {AsyncIterator<arrow.Table, arrow.Table>}
			 */
			function _runQuery(query, batchSize = 256) {
				let offset = 0;
				return {
					async next() {
						let sql = query
							.limit(batchSize)
							.offset(offset)
							.toString();
						let table = await cachedQuery(sql);
						offset += batchSize;
						return {
							value: table,
							done: table.numRows < batchSize,
						};
					},
				};
			}
			runQuery = _runQuery;
		},
		/** @type {import("npm:@anywidget/types@0.1.9").Render<{ _ipc: DataView }>} */
		async render({ el }) {
			let dataTableElement = await createArrowDataTable(runQuery);
			el.appendChild(dataTableElement);
		},
	};
};

// Lib

/**
 * @param {import("npm:apache-arrow").Field} field
 * @param {string} width
 */
function thcol(field, width) {
	// @deno-fmt-ignore
	return html.fragment`<th title=${field.name} style=${{ width }}>
	<div style=${{ display: "flex",  flexDirection: "column", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
		<span style=${{ marginBottom: "5px" }}>${field.name}</span>
		<span class="gray" style=${{ fontWeight: 400, fontSize: "12px" }}>${formatDataTypeName(field.type)}</span>
	</div>
</th>`;
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
	/** @type {sql.Query} */
	#query = new sql.Query().select("*").from("df");
	/** @type {QueryEngine} */
	#runQuery;

	/** @param {QueryEngine} runQuery */
	constructor(runQuery) {
		super();
		this.#runQuery = runQuery;
		{
			// apply styles
			let style = document.createElement("style");
			style.textContent = STYLES;
			this.shadowRoot?.appendChild(style);
		}
	}

	async render() {
		let rows = 11.5;
		let rowHeight = 22;
		let tableLayout = "fixed";
		let columnWidth = "150px";
		let headerHeight = "50px";
		let maxHeight = `${(rows + 1) * rowHeight - 1}px`;

		/** @type {HTMLDivElement} */
		let root = html`<div class="ipytable" style=${{ maxHeight }}>`;

		let batchIterator = this.#runQuery(this.#query);
		let batchResult = await batchIterator.next();

		let cols = batchResult.value.schema.fields.map((field) => field.name);
		let format = formatof(batchResult.value.schema);
		let classes = classof(batchResult.value.schema);

		let tbody = html`<tbody>`;
		// @deno-fmt-ignore
		let thead = html`<thead>
			<tr style=${{ height: headerHeight }}>
				<th></th>
				${batchResult.value.schema.fields.map((field) => thcol(field, columnWidth))}
				<th style=${{ width: "99%", borderLeft: "none", borderRight: "none" }}></th>
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

		/** @type {IterableIterator<arrow.StructRowProxy>} */
		let iterator = batchResult.value[Symbol.iterator]();
		/** @type {number} */
		let iterindex = 0;

		// @deno-fmt-ignore
		root.appendChild(
			html.fragment`<table style=${{ tableLayout }}>${thead}${tbody}</table>`
		);

		/**
		 * Number of rows to append
		 * @param {number} nrows
		 */
		async function appendRows(nrows) {
			while (nrows >= 0) {
				let result = iterator.next();
				if (batchResult.done && result.done) {
					// we've exhausted all rows
					break;
				}
				if (result.done) {
					// get the next batch
					batchResult = await batchIterator.next();
					// reset the iterator
					iterator = batchResult.value[Symbol.iterator]();
					continue;
				}
				// append the row and increment the index
				appendRow(result.value, iterindex);
				iterindex++;
				nrows--;
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

const STYLES = /* @css */ `\
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
  padding: 5px 7px;
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
 * @param {QueryEngine} runQuery
 * @returns {Promise<HTMLElement>}
 */
async function createArrowDataTable(runQuery) {
	let table = new ArrowDataTable(runQuery);
	await table.render();
	return table.node();
}

/**
 * @param {import("npm:apache-arrow").Schema} schema
 */
function formatof(schema) {
	/** @type {Record<string, (value: any) => string>} */
	const format = Object.create(null);
	for (const field of schema.fields) {
		format[field.name] = formatterForDataTypeValue(field.type);
	}
	return format;
}

/**
 * @param {import("npm:apache-arrow").Schema} schema
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
