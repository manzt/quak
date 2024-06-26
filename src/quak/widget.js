import { html } from "https://esm.sh/htl@0.3.1";
// @deno-types="npm:apache-arrow@16.1.0"
import * as arrow from "https://esm.sh/apache-arrow@16.1.0";
import { Temporal } from "https://esm.sh/@js-temporal/polyfill@0.4.4";
import * as signals from "https://esm.sh/@preact/signals-core@1.6.1";
import * as uuid from "https://esm.sh/@lukeed/uuid@2.0.1";

// Ugh no types for these...
import * as mc from "https://cdn.jsdelivr.net/npm/@uwdata/mosaic-core@0.10.0/+esm";
import * as msql from "https://cdn.jsdelivr.net/npm/@uwdata/mosaic-sql@0.10.0/+esm";
import * as mplot from "https://cdn.jsdelivr.net/npm/@uwdata/mosaic-plot@0.10.0/+esm";

/** @typedef {{ _table_name: string, _columns: Array<string>, temp_indexes: boolean }} Model */
/** @typedef {(arg: { type: "exec" | "arrow", sql: msql.Query | string }) => Promise<void | arrow.Table>} QueryFn */
/** @typedef {{ query: QueryFn }} Coordinator */
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
/** @typedef {ScaleBase & import("npm:@types/d3-scale").ScaleLinear<number, number>} Scale */
/** @typedef {[number, number] | [Date, Date]} Extent */
/**
 * @typedef ScaleBase
 * @property {ScaleType} type
 * @property {Extent} domain
 * @property {[number, number]} range
 * @property {number} [base]
 * @property {number} [constant]
 * @property {number} [exponent]
 */
/** @typedef {Histogram} ColumnSummaryVis */
/** @typedef {"linear" | "log" | "pow" | "symlog" | "time"} ScaleType */
/**
 * @typedef Mark
 * @property {string} type
 * @property {{getAttribute: (name: string) => any}} plot
 * @property {(channel: string, opts?: { exact?: boolean }) => Channel} channelField
 */

export default () => {
	let coordinator = new mc.Coordinator();
	return {
		/** @type {import("npm:@anywidget/types@0.1.9").Initialize<Model>} */
		initialize({ model }) {
			// @ts-expect-error - ok to have no args
			let logger = coordinator.logger();

			/** @type Map<string, {query: Record<any, unknown>, startTime: number, resolve: (value: any) => void, reject: (reason?: any) => void}> */
			let openQueries = new Map();

			/**
			 * @param {Record<any, unknown>} query the query to send
			 * @param {(value: any) => void} resolve the promise resolve callback
			 * @param {(reason?: any) => void} reject the promise reject callback
			 */
			function send(query, resolve, reject) {
				let id = uuid.v4();
				openQueries.set(id, {
					query,
					startTime: performance.now(),
					resolve,
					reject,
				});
				model.send({ ...query, uuid: id });
			}

			model.on("msg:custom", (msg, buffers) => {
				logger.group(`query ${msg.uuid}`);
				logger.log("received message", msg, buffers);
				let query = openQueries.get(msg.uuid);
				openQueries.delete(msg.uuid);
				assert(query, `No query found for ${msg.uuid}`);
				logger.log(
					query.query.sql,
					(performance.now() - query.startTime).toFixed(1),
				);
				if (msg.error) {
					query.reject(msg.error);
					logger.error(msg.error);
					return;
				} else {
					switch (msg.type) {
						case "arrow": {
							let table = arrow.tableFromIPC(buffers[0].buffer);
							logger.log("table", table);
							query.resolve(table);
							break;
						}
						case "json": {
							logger.log("json", msg.result);
							query.resolve(msg.result);
							break;
						}
						default: {
							query.resolve({});
							break;
						}
					}
				}
				logger.groupEnd("query");
			});

			let connector = {
				/** @type {QueryFn} */
				query(query) {
					console.log(query);
					return new Promise((resolve, reject) => send(query, resolve, reject));
				},
			};

			coordinator.databaseConnector(connector);

			return () => {
				coordinator.clear();
			};
		},
		/** @type {import("npm:@anywidget/types@0.1.9").Render<Model>} */
		render({ model, el }) {
			let table = new DataTable({
				table: model.get("_table_name"),
				columns: model.get("_columns"),
			});
			coordinator.connect(table);
			el.appendChild(table.node());
		},
	};
};

/**
 * @typedef DataTableOptions
 * @property {string} table
 * @property {Array<string>} columns
 * @property {number} [height]
 */

class DataTable extends mc.MosaicClient {
	/** @type {DataTableOptions} */
	#source;
	/** @type {HTMLElement} */
	#root = document.createElement("div");
	/** @type {ShadowRoot} */
	#shadowRoot = this.#root.attachShadow({ mode: "open" });
	/** @type {HTMLTableSectionElement} */
	#thead = document.createElement("thead");
	/** @type {HTMLTableSectionElement} */
	#tbody = document.createElement("tbody");
	/** @type {Array<{ field: string, order: "asc" | "desc" }>} */
	#orderby = [];

	/** @type {TableRowReader | undefined} */
	#reader = undefined;
	/** @type {HTMLTableRowElement | undefined} */
	#dataRow = undefined;
	/** @type {HTMLDivElement} */
	#tableRoot;

	// options
	#rows = 11.5;
	#rowHeight = 22;
	#columnWidth = 125;
	#headerHeight = "50px";
	#refreshTableBody = async () => {};

	/** @param {DataTableOptions} source */
	constructor(source) {
		super(undefined);
		this.#source = source;

		let maxHeight = `${(this.#rows + 1) * this.#rowHeight - 1}px`;
		// if maxHeight is set, calculate the number of rows to display
		if (source.height) {
			this.#rows = Math.floor(source.height / this.#rowHeight);
			maxHeight = `${source.height}px`;
		}

		/** @type {HTMLDivElement} */
		let root = html`<div class="quak" style=${{ maxHeight }}>`;
		// @deno-fmt-ignore
		root.appendChild(
			html.fragment`<table class="quak" style=${{ tableLayout: "fixed" }}>${this.#thead}${this.#tbody}</table>`
		);
		this.#shadowRoot.appendChild(html`<style>${STYLES}</style>`);
		this.#shadowRoot.appendChild(root);
		this.#tableRoot = root;
	}

	/** @returns {Array<{ table: string, column: string, stats: Array<string> }>} */
	// @ts-expect-error - _field type is bad from MosaicClient
	fields() {
		return this.#source.columns.map((column) => ({
			table: this.#source.table,
			column,
			stats: [],
		}));
	}

	node() {
		return this.#root;
	}

	async #createRowReader() {
		/** @type {Coordinator} */
		let coordinator = this.coordinator;
		let query = msql.Query
			.from(this.#source.table)
			.select(...this.#source.columns);
		if (this.#orderby.length) {
			query.orderby(
				...this.#orderby.map((o) =>
					o.order === "asc" ? asc(o.field) : msql.desc(o.field)
				),
			);
		}
		console.log(query);
		let reader = new TableRowReader(coordinator, query);
		await reader.init();
		return reader;
	}

	/** @param {Array<Info>} infos */
	async #onFieldInfo(infos) {
		let reader = await this.#createRowReader();
		let classes = classof(reader.schema);
		let format = formatof(reader.schema);

		// @deno-fmt-ignore
		this.#dataRow = html`<tr><td></td>${
			infos.map((info) => html.fragment`<td class=${classes[info.column]}></td>`)
		}
			<td style=${{ width: "99%", borderLeft: "none", borderRight: "none" }}></td>
		</tr>`;

		let $brush = mc.Selection.crossfilter();

		let observer = new IntersectionObserver((entries) => {
			for (let entry of entries) {
				/** @type {ColumnSummaryVis | undefined} */
				let vis = /** @type {any} */ (entry.target).vis;
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

		let cols = reader.schema.fields.map((field) => {
			let info = infos.find((c) => c.column === field.name);
			assert(info, `No info for column ${field.name}`);
			/** @type {signals.Signal<"unset" | "asc" | "desc">} */
			let toggle = signals.signal("unset");
			signals.effect(() => {
				this.#orderby = getNextOrderby(
					this.#orderby,
					field,
					toggle.value,
				);
				this.#refreshTableBody();
			});
			/** @type {ColumnSummaryVis | undefined} */
			let vis = undefined;
			if (info.type === "number" || info.type === "date") {
				vis = new Histogram({
					table: this.#source.table,
					column: field.name,
					type: info.type,
					filterBy: $brush,
				});
			}
			let th = thcol(field, this.#columnWidth, toggle, vis);
			observer.observe(th);
			return th;
		});
		// @deno-fmt-ignore
		this.#thead.appendChild(
			html`<tr style=${{ height: this.#headerHeight }}>
				<th></th>
				${cols}
				<th style=${{ width: "99%", borderLeft: "none", borderRight: "none" }}></th>
			</tr>`,
		);

		// scroll behavior
		{
			this.#tableRoot.addEventListener("scroll", async () => {
				let isAtBottom =
					this.#tableRoot.scrollHeight - this.#tableRoot.scrollTop <
						this.#rows * this.#rowHeight * 1.5;
				if (isAtBottom) {
					await this.#appendRows(this.#rows, infos, format);
				}
			});
		}

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

		// we need to put down here so the first effect can run and not exhaust the reader
		this.#refreshTableBody = async () => {
			this.#reader = await this.#createRowReader();
			this.#tbody.innerHTML = "";
			this.#tableRoot.scrollTop = 0;
			this.#appendRows(this.#rows * 2, infos, format);
		};

		this.#refreshTableBody();
	}

	/** @param {Array<Info>} infos */
	fieldInfo(infos) {
		// Mosaic expects a synchronous return, so we wrap the handler in an async function
		this.#onFieldInfo(infos);
		return this;
	}

	/**
	 * Number of rows to append
	 * @param {number} nrows
	 * @param {Array<Info>} infos
	 * @param {Record<string, (value: any) => string>} format
	 */
	async #appendRows(nrows, infos, format) {
		nrows = Math.trunc(nrows);
		assert(this.#reader, "No reader");
		while (nrows >= 0) {
			let result = this.#reader.next();
			if (result.done) {
				// we've exhausted all rows
				break;
			}
			if (result.value.kind === "row") {
				this.#appendRow(
					result.value.data,
					result.value.index,
					infos,
					format,
				);
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
	 * @param {Array<Info>} infos
	 * @param {Record<string, (value: any) => string>} format
	 */
	#appendRow(d, i, infos, format) {
		let itr = this.#dataRow?.cloneNode(true);
		assert(itr, "Must have a data row");
		let td = /** @type {HTMLTableCellElement} */ (itr?.childNodes[0]);
		td.appendChild(document.createTextNode(String(i)));
		for (let j = 0; j < infos.length; ++j) {
			td = /** @type {HTMLTableCellElement} */ (itr.childNodes[j + 1]);
			td.classList.remove("gray");
			let col = infos[j].column;
			/** @type {string} */
			let stringified = format[col](d[col]);
			if (shouldGrayoutValue(stringified)) {
				td.classList.add("gray");
			}
			let value = document.createTextNode(stringified);
			td.appendChild(value);
		}
		this.#tbody.append(itr);
	}
}

/**
 * @param {Array<{ field: string, order: "asc" | "desc" }>} current
 * @param {arrow.Field} field
 * @param {"asc" | "desc" | "unset"} state
 */
function getNextOrderby(current, field, state) {
	let next = current.filter((o) => o.field !== field.name);
	if (state !== "unset") {
		next.unshift({ field: field.name, order: state });
	}
	return next;
}

/**
 * @typedef HistogramClientOptions
 * @property {string} table
 * @property {string} column
 * @property {"number" | "date"} type
 * @property {mc.Selection} [filterBy]
 */

/** @implements {Mark} */
class Histogram extends mc.MosaicClient {
	type = "rectY";
	/** @type {{ table: string, column: string, type: "number" | "date" }} */
	#source;
	/** @type {HTMLElement} */
	#el = document.createElement("div");
	/** @type {Array<Channel>} */
	#channels = [];
	/** @type {Set<unknown>} */
	#markSet = new Set();
	/** @type {mplot.Interval1D | undefined} */
	#interval = undefined;
	/** @type {boolean} */
	#initialized = false;

	/**
	 * @param {{ table: string, column: string, type: "number" | "date", filterBy?: mc.Selection }} source
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
			x: mplot.bin(source.column),
			y: msql.count(),
		};
		for (let [channel, entry] of Object.entries(encodings)) {
			process(channel, entry);
		}
		if (source.filterBy) {
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
		let nullCount = 0;
		let nullBinIndex = bins.findIndex((b) => b.x0 == null);
		if (nullBinIndex >= 0) {
			nullCount = bins[nullBinIndex].length;
			bins.splice(nullBinIndex, 1);
		}
		if (!this.#initialized) {
			this.svg = hist(bins, { nullCount, type: this.#source.type });
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
			getAttribute(_name) {
				return undefined;
			},
			markSet: this.#markSet,
		};
	}
}

const TRUNCATE = /** @type {const} */ ({
	whiteSpace: "nowrap",
	overflow: "hidden",
	textOverflow: "ellipsis",
});

class TableRowReader {
	#index = 0;
	#offset = 0;
	#batchSize = 256;
	/** @type {msql.Query} */
	#query;
	/** @type {Coordinator} */
	#mc;
	/** @type {arrow.Schema | undefined} */
	#schema = undefined;

	/**
	 * @param {Coordinator} mc
	 * @param {msql.Query} query
	 */
	constructor(mc, query) {
		this.#mc = mc;
		this.#query = query;
		/** @type {boolean} */
		this.done = false;
	}

	async init() {
		await this.#readNextBatch();
	}

	get schema() {
		assert(this.#schema, "No schema. Did you forget to call init()?");
		return this.#schema;
	}

	async #readNextBatch() {
		let sql = this.#query
			.clone()
			.limit(this.#batchSize)
			.offset(this.#offset);
		let table = await this.#mc.query(sql);
		assert(table, "No table");
		this.#schema = table.schema;
		this.iter = table[Symbol.iterator]();
		this.done = table.numRows < this.#batchSize;
		this.#offset += this.#batchSize;
	}

	/** @return {IteratorResult<{ kind: "batch"; readNextBatch: () => Promise<void> } | { kind: "row"; data: arrow.StructRowProxy; index: number }>} */
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
					index: this.#index++,
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

	return Object.assign(th, { vis });
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

  --dark-green: #257d54;
  --green: #2f9666;
  --light-green: #38a070;
  --lightest-green: #c5e4d6;
  --washed-green: #ecfbf5;
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

/** @param {string} field */
function asc(field) {
	// doesn't sort nulls for asc
	let expr = msql.desc(field);
	expr._expr[0] = expr._expr[0].replace("DESC", "ASC");
	return expr;
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
export function markQuery(channels, table, skip = []) {
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
let axisBottom =
	// @ts-expect-error - d3 types are incorrect
	/** @type {import("npm:@types/d3-axis").axisBottom} */ (d3.axisBottom);
let format = // @ts-expect-error - d3 types are incorrect
	/** @type {import("npm:@types/d3-format").format} */ (d3.format);

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
 * @returns {SVGSVGElement & { scale: (type: string) => Scale, update(bins: Array<Bin>, opts: { nullCount: number }): void }}
 */
function hist(
	data,
	{
		type,
		width = 125,
		height = 40,
		marginTop = 0,
		marginRight = 2,
		marginBottom = 12,
		marginLeft = 2,
		nullCount = 0,
		fillColor = "#64748b",
		nullFillColor = "#ca8a04",
	} = {},
) {
	let bins = [...data];
	bins.sort((a, b) => a.x0 - b.x0);
	let avgBinWidth = nullCount === 0 ? 0 : width / (bins.length + 1);

	let x, xAxis;
	let midFirstBin = (bins[0].x0 + bins[0].x1) / 2;
	let midLastBin = (bins[bins.length - 1].x0 + bins[bins.length - 1].x1) / 2;

	if (type === "date") {
		let interval = timeInterval(
			bins[0].x0,
			bins[bins.length - 1].x1,
			bins.length,
		);
		x = scaleTime()
			.domain([bins[0].x0, bins[bins.length - 1].x1])
			.range([marginLeft + avgBinWidth + 3, width - marginRight]);
		xAxis = axisBottom(x)
			.tickValues([midFirstBin, midLastBin])
			.tickFormat(formatMap[interval.interval])
			.tickSize(2.5);
	} else {
		x = scaleLinear()
			.domain([bins[0].x0, bins[bins.length - 1].x1])
			.range([marginLeft + avgBinWidth + 3, width - marginRight]);
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

	// background bars for the entire dataset
	svg.append("g")
		.attr("fill", "var(--moon-gray)")
		.selectAll("rect")
		.data(bins)
		.join("rect")
		.attr("x", (d) => x(d.x0) + 1)
		.attr("width", (d) => x(d.x1) - x(d.x0) - 1)
		.attr("y", (d) => y(d.length))
		.attr("height", (d) => y(0) - y(d.length));

	// Foreground bars for the current subset
	let foreGrnd = svg
		.append("g")
		.attr("fill", fillColor);

	foreGrnd
		.selectAll("rect")
		.data(bins)
		.join("rect")
		.attr("x", (d) => x(d.x0) + 1)
		.attr("width", (d) => x(d.x1) - x(d.x0) - 1)
		.attr("y", (d) => y(d.length))
		.attr("height", (d) => y(0) - y(d.length));

	// Add the null bin separately
	/** @type {{ grp: import("npm:@types/d3-selection").Selection<SVGGElement, undefined, null, undefined>, scale: import("npm:@types/d3-scale").ScaleLinear<number, number> } | undefined} */
	let nullNode = undefined;
	if (nullCount > 0) {
		let nullXScale = scaleLinear()
			.range([marginLeft, marginLeft + avgBinWidth]);

		// background bar for the null bin
		svg.append("g")
			.attr("fill", "var(--moon-gray)")
			.append("rect")
			.attr("x", nullXScale(0))
			.attr("width", nullXScale(1) - nullXScale(0))
			.attr("y", y(nullCount))
			.attr("height", y(0) - y(nullCount))
			.attr("fill", nullFillColor);

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
			.text("∅")
			.attr("font-size", "0.9em")
			.attr("font-family", "var(--sans-serif)")
			.attr("font-weight", "normal");

		nullNode = { grp: nullGrp, scale: nullXScale };
	}

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
		.attr("font-weight", "normal");

	let scales = {
		x: Object.assign(x, {
			type: "linear",
			domain: x.domain(),
			range: x.range(),
		}),
		y: Object.assign(y, {
			type: "linear",
			domain: y.domain(),
			range: y.range(),
		}),
	};
	let node = svg.node();
	assert(node, "Infallable");
	return Object.assign(node, {
		/** @param {string} type */
		scale(type) {
			// @ts-expect-error - scales is not defined
			let scale = scales[type];
			assert(scale, "Invalid scale type");
			return scale;
		},
		/**
		 * @param {Array<Bin>} bins
		 * @param {{ nullCount: number }} opts
		 */
		update(bins, { nullCount }) {
			// scales and bins are the same but the values have changed
			// update the rects
			bins = [...bins];
			bins.sort((a, b) => a.x0 - b.x0);
			foreGrnd
				.selectAll("rect")
				.data(bins)
				.join(
					(enter) =>
						enter.append("rect")
							.attr("x", (d) => x(d.x0) + 1)
							.attr("width", (d) => x(d.x1) - x(d.x0) - 1)
							.attr("y", (d) => y(d.length))
							.attr("height", (d) => y(0) - y(d.length)),
					(update) =>
						update
							.attr("x", (d) => x(d.x0) + 1)
							.attr("width", (d) => x(d.x1) - x(d.x0) - 1)
							.attr("y", (d) => y(d.length))
							.attr("height", (d) => y(0) - y(d.length)),
				);
			nullNode?.grp
				.select("rect")
				.attr("y", y(nullCount))
				.attr("height", y(0) - y(nullCount));
		},
	});
}
