// @deno-types="npm:htl"
import { html } from "https://esm.sh/htl@0.3.1";
// @deno-types="npm:apache-arrow"
import * as arrow from "https://esm.sh/apache-arrow@16.1.0";
// @deno-types="npm:temporal-polyfill"
import { Temporal } from "https://esm.sh/temporal-polyfill@0.2.5";

/**
 * @typedef Model
 * @prop {DataView} _ipc
 */

export default {
	/** @type {import("npm:@anywidget/types").Render<Model>} */
	render({ model, el }) {
		let ipc = model.get("_ipc");
		let table = arrow.tableFromIPC(ipc);
		let dataTableElement = createArrowDataTable(table);
		el.appendChild(dataTableElement);
	},
};

// Lib

/**
 * @param {unknown} date
 * @returns {string}
 */
function formatDate(date) {
	if (!(date instanceof Date)) {
		return "Invalid Date";
	}
	return date.toISOString().split("T")[0];
}

/**
 * @param {number} msSinceEpoch
 * @returns {string}
 */
function formatTimestamp(msSinceEpoch) {
	return Temporal.Instant.fromEpochMilliseconds(msSinceEpoch)
		.toZonedDateTimeISO("UTC")
		.toPlainDateTime()
		.toString();
}

/**
 * @param {unknown} value
 * @returns {value is undefined | null}
 */
function undefinedOrNull(value) {
	return value === undefined || value === null;
}

/**
 * @param {number} value
 * @returns {string}
 */
function formatNumber(value) {
	if (undefinedOrNull(value) || Number.isNaN(value)) {
		return stringify(value);
	}
	return value === 0 ? "0" : value.toLocaleString("en"); // handle negative zero
}

/**
 * @param {any} x
 * @returns {string}
 */
function stringify(x) {
	return `${x}`;
}

/**
 * @param {import("npm:apache-arrow").DataType} type
 * @returns {type is arrow.Int | arrow.Float | arrow.Decimal}
 */
function isNumberDataType(type) {
	return (
		arrow.DataType.isFloat(type) ||
		arrow.DataType.isInt(type) ||
		arrow.DataType.isDecimal(type)
	);
}

/**
 * @param {import("npm:apache-arrow").DataType} type
 * @returns {(value: any) => string}
 */
function formatterForType(type) {
	if (isNumberDataType(type)) return formatNumber;
	if (arrow.DataType.isTimestamp(type)) return formatTimestamp;
	if (arrow.DataType.isDate(type)) return formatDate;
	return stringify;
}

/**
 * @param {import("npm:apache-arrow").Table} table
 */
function formatof(table) {
	/** @type {Record<string, (value: any) => string>} */
	const format = Object.create(null);
	for (const field of table.schema.fields) {
		format[field.name] = formatterForType(field.type);
	}
	return format;
}

/**
 * @param {import("npm:apache-arrow").Table} table
 * @returns {Record<string, "number" | "date">}
 */
function classof(table) {
	/** @type {Record<string, "number" | "date">} */
	const classes = Object.create(null);
	for (const field of table.schema.fields) {
		if (isNumberDataType(field.type)) {
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

/** @param {arrow.DataType} type */
function formatDataType(type) {
	const dataTypeString = type.toString();
	const overrides = {
		"Timestamp<NANOSECOND>": "Timestamp<NS>",
	};
	// @ts-expect-error - TS doesn't understand that overrides is a subset of DataType
	return overrides[dataTypeString] ?? dataTypeString;
}

/**
 * @param {import("npm:apache-arrow").Field} field
 * @param {string} width
 */
function thcol(field, width) {
	// @deno-fmt-ignore
	return html.fragment`<th title=${field.name} style=${{ width }}>
	<div style=${{ display: "flex",  flexDirection: "column", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
		<span style=${{ marginBottom: "5px" }}>${field.name}</span>
		<span class="gray" style=${{ fontWeight: 400, fontSize: "12px" }}>${formatDataType(field.type)}</span>
	</div>
</th>`;
}

class ArrowTable extends HTMLElement {
	/** @type {import("npm:apache-arrow").Table} */
	#table;

	/** @param {import("npm:apache-arrow").Table} table */
	constructor(table) {
		super();
		this.attachShadow({ mode: "open" });
		this.#table = table;
	}

	connectedCallback() {
		let table = this.#table;
		{
			// apply styles
			let style = document.createElement("style");
			style.textContent = STYLES;
			this.shadowRoot?.appendChild(style);
		}
		let rows = 11.5;
		let rowHeight = 22;
		let tableLayout = "fixed";
		let columnWidth = "150px";
		let headerHeight = "50px";
		let maxHeight = `${(rows + 1) * rowHeight - 1}px`;
		let root = html`<div class="ipytable" style=${{ maxHeight }}>`;

		let cols = table.schema.fields.map((field) => field.name);
		let format = formatof(table);
		let classes = classof(table);

		let tbody = html`<tbody>`;
		// @deno-fmt-ignore
		let thead = html`<thead>
			<tr style=${{ height: headerHeight }}>
				<th></th>
				${table.schema.fields.map((field) => thcol(field, columnWidth))}
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

		/** @type {Array<arrow.StructRowProxy>} */
		let array = [];
		/** @type {Array<number>} */
		let index = [];
		let iterator = this.#table[Symbol.iterator]();
		let iterindex = 0;
		let N = this.#table.numRows;
		let n = minlengthof(rows * 2); // number of currently-shown rows

		/** @param {number} length */
		function minlengthof(length) {
			length = Math.floor(length);
			if (N !== undefined) return Math.min(N, length);
			if (length <= iterindex) return length;
			while (length > iterindex) {
				const { done, value } = iterator.next();
				if (done) return N = iterindex;
				index.push(iterindex++);
				array.push(value);
			}
			return iterindex;
		}

		root.appendChild(
			html.fragment`<table style=${{
				tableLayout,
			}}>${thead}${tbody}</table>`,
		);

		/**
		 * @param {number} i
		 * @param {number} j
		 */
		function appendRows(i, j) {
			if (iterindex === i) {
				for (; i < j; ++i) {
					appendRow(iterator.next().value, i);
				}
				iterindex = j;
			} else {
				for (let k; i < j; ++i) {
					k = index[i];
					appendRow(table.get(k), k);
				}
			}
		}

		/**
		 * @param {arrow.StructRowProxy | null} d
		 * @param {number} i
		 */
		function appendRow(d, i) {
			const itr = tr.cloneNode(true);
			if (d != null) {
				let td = itr.childNodes[0];
				td.appendChild(document.createTextNode(String(i)));
				for (let j = 0; j < cols.length; ++j) {
					td = itr.childNodes[j + 1];
					td.classList.remove("gray");
					let col = cols[j];
					/** @type {string} */
					let stringified = format[col](d[col]);
					if (
						stringified === "null" || stringified === "undefined" ||
						stringified === "NaN"
					) {
						td.classList.add("gray");
					}
					let value = document.createTextNode(stringified);
					td.appendChild(value);
				}
			}
			tbody.append(itr);
		}

		root.addEventListener("scroll", () => {
			if (
				root.scrollHeight - root.scrollTop < rows * rowHeight * 1.5 &&
				n < minlengthof(n + 1)
			) {
				appendRows(n, n = minlengthof(n + rows));
			}
		});

		{ // highlight on hover
			root.addEventListener(
				"mouseover",
				(/** @type {MouseEvent} */ event) => {
					if (event.target?.tagName === "TD") {
						const cell = event.target;
						const row = cell.parentNode;
						if (
							row.firstChild !== cell &&
							cell !== row.children[cols.length + 1]
						) {
							cell.style.border = "1px solid var(--moon-gray)";
						}
						row.style.backgroundColor = "var(--light-silver)";
					}
				},
			);
			root.addEventListener(
				"mouseout",
				(/** @type {MouseEvent} */ event) => {
					if (event.target?.tagName === "TD") {
						const cell = event.target;
						cell.style.removeProperty("border");
						const row = cell.parentNode;
						row.style.removeProperty("background-color");
					}
				},
			);
		}

		appendRows(0, n = minlengthof(rows * 2));
		this.shadowRoot?.appendChild(root);
	}
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
 * @param {arrow.Table} data
 * @returns {ArrowTable}
 */
function createArrowDataTable(data) {
	if (!customElements.get("arrow-table")) {
		customElements.define("arrow-table", ArrowTable);
	}
	let AT = customElements.get("arrow-table");
	assert(AT, "arrow-table not defined");
	// @ts-expect-error - ArrowTable is a custom element
	return new AT(data);
}
