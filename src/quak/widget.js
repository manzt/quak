// lib/widget.ts
import * as mc3 from "https://cdn.jsdelivr.net/npm/@uwdata/mosaic-core@0.10.0/+esm";
import * as msql3 from "https://cdn.jsdelivr.net/npm/@uwdata/mosaic-sql@0.10.0/+esm";
import * as arrow3 from "https://esm.sh/apache-arrow@16.1.0";
import * as uuid from "https://esm.sh/@lukeed/uuid@2.0.1";

// lib/clients/DataTable.ts
import * as arrow2 from "https://esm.sh/apache-arrow@16.1.0";
import * as mc2 from "https://cdn.jsdelivr.net/npm/@uwdata/mosaic-core@0.10.0/+esm";
import * as msql2 from "https://cdn.jsdelivr.net/npm/@uwdata/mosaic-sql@0.10.0/+esm";
import * as signals from "https://esm.sh/@preact/signals-core@1.6.1";
import { html } from "https://esm.sh/htl@0.3.1";

// lib/utils/formatting.ts
import { Temporal } from "https://esm.sh/@js-temporal/polyfill@0.4.4";
import * as arrow from "https://esm.sh/apache-arrow@16.1.0";
function fmt(_arrowDataTypeValue, format, log = false) {
  return (value) => {
    if (log)
      console.log(value);
    if (value === void 0 || value === null) {
      return stringify(value);
    }
    return format(value);
  };
}
function stringify(x) {
  return `${x}`;
}
function formatDataTypeName(type) {
  if (arrow.DataType.isLargeBinary(type))
    return "large binary";
  if (arrow.DataType.isLargeUtf8(type))
    return "large utf8";
  return type.toString().toLowerCase().replace("<second>", "[s]").replace("<millisecond>", "[ms]").replace("<microsecond>", "[\xB5s]").replace("<nanosecond>", "[ns]").replace("<day>", "[day]").replace("dictionary<", "dict<");
}
function formatterForDataTypeValue(type) {
  if (arrow.DataType.isNull(type)) {
    return fmt(type.TValue, stringify);
  }
  if (arrow.DataType.isInt(type) || arrow.DataType.isFloat(type)) {
    return fmt(type.TValue, (value) => {
      if (Number.isNaN(value))
        return "NaN";
      return value === 0 ? "0" : value.toLocaleString("en");
    });
  }
  if (arrow.DataType.isBinary(type) || arrow.DataType.isFixedSizeBinary(type) || arrow.DataType.isLargeBinary(type)) {
    return fmt(type.TValue, (bytes) => {
      let maxlen = 32;
      let result = "b'";
      for (let i = 0; i < Math.min(bytes.length, maxlen); i++) {
        const byte = bytes[i];
        if (byte >= 32 && byte <= 126) {
          result += String.fromCharCode(byte);
        } else {
          result += "\\x" + ("00" + byte.toString(16)).slice(-2);
        }
      }
      if (bytes.length > maxlen)
        result += "...";
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
      return Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO("UTC").toPlainDate().toString();
    });
  }
  if (arrow.DataType.isTime(type)) {
    return fmt(type.TValue, (ms) => {
      return instantFromTimeUnit(ms, type.unit).toZonedDateTimeISO("UTC").toPlainTime().toString();
    });
  }
  if (arrow.DataType.isTimestamp(type)) {
    return fmt(type.TValue, (ms) => {
      return Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO("UTC").toPlainDateTime().toString();
    });
  }
  if (arrow.DataType.isInterval(type)) {
    return fmt(type.TValue, (_value) => {
      return "TODO";
    });
  }
  if (arrow.DataType.isDuration(type)) {
    return fmt(type.TValue, (bigintValue) => {
      return durationFromTimeUnit(bigintValue, type.unit).toString();
    });
  }
  if (arrow.DataType.isList(type)) {
    return fmt(type.TValue, (value) => {
      return value.toString();
    });
  }
  if (arrow.DataType.isStruct(type)) {
    return fmt(type.TValue, (value) => {
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
function instantFromTimeUnit(value, unit) {
  if (unit === arrow.TimeUnit.SECOND) {
    if (typeof value === "bigint")
      value = Number(value);
    return Temporal.Instant.fromEpochSeconds(value);
  }
  if (unit === arrow.TimeUnit.MILLISECOND) {
    if (typeof value === "bigint")
      value = Number(value);
    return Temporal.Instant.fromEpochMilliseconds(value);
  }
  if (unit === arrow.TimeUnit.MICROSECOND) {
    if (typeof value === "number")
      value = BigInt(value);
    return Temporal.Instant.fromEpochMicroseconds(value);
  }
  if (unit === arrow.TimeUnit.NANOSECOND) {
    if (typeof value === "number")
      value = BigInt(value);
    return Temporal.Instant.fromEpochNanoseconds(value);
  }
  throw new Error("Invalid TimeUnit");
}
function durationFromTimeUnit(value, unit) {
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

// lib/utils/assert.ts
var AssertionError = class extends Error {
  /** @param message The error message. */
  constructor(message) {
    super(message);
    this.name = "AssertionError";
  }
};
function assert2(expr, msg = "") {
  if (!expr) {
    throw new AssertionError(msg);
  }
}

// lib/utils/AsyncBatchReader.ts
var AsyncBatchReader = class {
  /** the iterable batches to read */
  #batches = [];
  /** the index of the current row */
  #index = 0;
  /** resolves a promise for when the next batch is available */
  #resolve = null;
  /** the current batch */
  #current = null;
  /** A function to request more data. */
  #requestNextBatch;
  /**
   * @param requestNextBatch - a function to request more data. When
   * this function completes, it should enqueue the next batch, otherwise the
   * reader will be stuck.
   */
  constructor(requestNextBatch) {
    this.#requestNextBatch = requestNextBatch;
  }
  /**
   * Enqueue a batch of data
   *
   * The last batch should have `last: true` set,
   * so the reader can terminate when it has
   * exhausted all the data.
   *
   * @param batch - the batch of data to enqueue
   * @param options
   * @param options.last - whether this is the last batch
   */
  enqueueBatch(batch, { last }) {
    this.#batches.push({ data: batch, last });
    if (this.#resolve) {
      this.#resolve();
      this.#resolve = null;
    }
  }
  async next() {
    if (!this.#current) {
      if (this.#batches.length === 0) {
        let promise = new Promise((resolve) => {
          this.#resolve = resolve;
        });
        this.#requestNextBatch();
        await promise;
      }
      let next = this.#batches.shift();
      assert2(next, "No next batch");
      this.#current = next;
    }
    let result = this.#current.data.next();
    if (result.done) {
      if (this.#current.last) {
        return { done: true, value: void 0 };
      }
      this.#current = null;
      return this.next();
    }
    return {
      done: false,
      value: { row: result.value, index: this.#index++ }
    };
  }
};

// lib/clients/Histogram.ts
import * as mc from "https://cdn.jsdelivr.net/npm/@uwdata/mosaic-core@0.10.0/+esm";
import * as msql from "https://cdn.jsdelivr.net/npm/@uwdata/mosaic-sql@0.10.0/+esm";
import * as mplot from "https://cdn.jsdelivr.net/npm/@uwdata/mosaic-plot@0.10.0/+esm";
var Histogram = class extends mc.MosaicClient {
  type = "rectY";
  /** @type {{ table: string, column: string, type: "number" | "date" }} */
  #source;
  /** @type {HTMLElement} */
  #el = document.createElement("div");
  /** @type {Array<Channel>} */
  #channels = [];
  /** @type {Set<unknown>} */
  #markSet = /* @__PURE__ */ new Set();
  /** @type {mplot.Interval1D | undefined} */
  #interval = void 0;
  /** @type {boolean} */
  #initialized = false;
  constructor(options) {
    super(options.filterBy);
    this.#source = options;
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
      x: mplot.bin(options.column),
      y: msql.count()
    };
    for (let [channel, entry] of Object.entries(encodings)) {
      process(channel, entry);
    }
    if (options.filterBy) {
      this.#interval = new mplot.Interval1D(this, {
        channel: "x",
        selection: this.filterBy,
        field: this.#source.column,
        brush: void 0
      });
    }
  }
  /** @returns {Array<{ table: string, column: string, stats: Array<string> }>} */
  // @ts-expect-error - _field type is bad from MosaicClient
  fields() {
    const fields = /* @__PURE__ */ new Map();
    for (let { field } of this.#channels) {
      if (!field)
        continue;
      let stats = field.stats?.stats || [];
      let key = field.stats?.column ?? field;
      let entry = fields.get(key);
      if (!entry) {
        entry = /* @__PURE__ */ new Set();
        fields.set(key, entry);
      }
      stats.forEach((s) => entry.add(s));
    }
    return Array.from(
      fields,
      ([c, s]) => ({ table: this.#source.table, column: c, stats: s })
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
    let c = exact ? this.channel(channel) : this.#channels.find((c2) => c2.channel.startsWith(channel));
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
      length: d.y
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
        type: this.#source.type
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
      getAttribute(_name) {
        return void 0;
      },
      markSet: this.#markSet
    };
  }
};
function fieldEntry(channel, field) {
  return {
    channel,
    field,
    as: field instanceof msql.Ref ? field.column : channel
  };
}
function isFieldObject(channel, field) {
  if (channel === "sort" || channel === "tip") {
    return false;
  }
  return typeof field === "object" && field != null && !Array.isArray(field);
}
function isTransform(x) {
  return typeof x === "function";
}
function markQuery(channels, table, skip = []) {
  let q = msql.Query.from({ source: table });
  let dims = /* @__PURE__ */ new Set();
  let aggr = false;
  for (const c of channels) {
    const { channel, field, as } = c;
    if (skip.includes(channel))
      continue;
    if (channel === "orderby") {
      q.orderby(c.value);
    } else if (field) {
      if (field.aggregate) {
        aggr = true;
      } else {
        if (dims.has(as))
          continue;
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

// lib/clients/DataTable.ts
var DataTable = class extends mc2.MosaicClient {
  /** source options */
  #source;
  /** for the component */
  #root = document.createElement("div");
  /** shadow root for the component */
  #shadowRoot = this.#root.attachShadow({ mode: "open" });
  /** header of the table */
  #thead = document.createElement("thead");
  /** body of the table */
  #tbody = document.createElement("tbody");
  /** The SQL order by */
  #orderby = [];
  /** template row for data */
  #templateRow = void 0;
  /** div containing the table */
  #tableRoot;
  /** offset into the data */
  #offset = 0;
  /** number of rows to fetch */
  #limit = 100;
  /** whether an internal request is pending */
  #pending = false;
  /** number of rows to display */
  #rows = 11.5;
  /** height of a row */
  #rowHeight = 22;
  /** width of a column */
  #columnWidth = 125;
  /** height of the header */
  #headerHeight = "50px";
  /** the formatter for the data table entries */
  #format;
  /** @type {AsyncBatchReader<arrow.StructRowProxy> | null} */
  #reader = null;
  constructor(source) {
    super(source.filterBy);
    this.#source = source;
    this.#format = formatof(source.schema);
    this.#pending = false;
    let maxHeight = `${(this.#rows + 1) * this.#rowHeight - 1}px`;
    if (source.height) {
      this.#rows = Math.floor(source.height / this.#rowHeight);
      maxHeight = `${source.height}px`;
    }
    let root = html`<div class="quak" style=${{
      maxHeight
    }}>`;
    root.appendChild(
      html.fragment`<table class="quak" style=${{ tableLayout: "fixed" }}>${this.#thead}${this.#tbody}</table>`
    );
    this.#shadowRoot.appendChild(html`<style>${STYLES}</style>`);
    this.#shadowRoot.appendChild(root);
    this.#tableRoot = root;
    this.#tableRoot.addEventListener("scroll", async () => {
      let isAtBottom = this.#tableRoot.scrollHeight - this.#tableRoot.scrollTop < this.#rows * this.#rowHeight * 1.5;
      if (isAtBottom) {
        await this.#appendRows(this.#rows);
      }
    });
  }
  fields() {
    return this.#columns.map((column) => ({
      table: this.#source.table,
      column,
      stats: []
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
  query(filter = []) {
    return msql2.Query.from(this.#source.table).select(this.#columns).where(filter).orderby(
      this.#orderby.filter((o) => o.order !== "unset").map((o) => o.order === "asc" ? asc(o.field) : msql2.desc(o.field))
    ).limit(this.#limit).offset(this.#offset);
  }
  /**
   * A mosiac lifecycle function that is called with the results from `query`.
   * Must be synchronous, and return `this`.
   */
  queryResult(data) {
    if (!this.#pending) {
      this.#reader = new AsyncBatchReader(() => {
        this.#pending = true;
        this.requestData(this.#offset + this.#limit);
      });
      this.#tbody.replaceChildren();
      this.#offset = 0;
    }
    this.#reader?.enqueueBatch(data[Symbol.iterator](), {
      last: data.numRows < this.#limit
    });
    return this;
  }
  update() {
    if (!this.#pending) {
      this.#appendRows(this.#rows * 2);
    }
    this.#pending = false;
    return this;
  }
  requestData(offset = 0) {
    this.#offset = offset;
    let query = this.query(this.filterBy?.predicate(this));
    this.requestQuery(query);
    this.coordinator.prefetch(query.clone().offset(offset + this.#limit));
  }
  /** @param {Array<Info>} infos */
  fieldInfo(infos) {
    let classes = classof(this.#source.schema);
    this.#templateRow = html`<tr><td></td>${infos.map((info) => html.fragment`<td class=${classes[info.column]}></td>`)}
			<td style=${{ width: "99%", borderLeft: "none", borderRight: "none" }}></td>
		</tr>`;
    let observer = new IntersectionObserver((entries) => {
      for (let entry of entries) {
        let vis = (
          /** @type {any} */
          entry.target.vis
        );
        if (!vis)
          continue;
        if (entry.isIntersecting) {
          this.coordinator.connect(vis);
        } else {
          this.coordinator?.disconnect(vis);
        }
      }
    }, {
      root: this.#tableRoot
    });
    let cols = this.#source.schema.fields.map((field) => {
      let info = infos.find((c) => c.column === field.name);
      assert(info, `No info for column ${field.name}`);
      let vis = void 0;
      if (info.type === "number" || info.type === "date") {
        vis = new Histogram({
          table: this.#source.table,
          column: field.name,
          type: info.type,
          filterBy: this.#source.filterBy
        });
      }
      let th = thcol(field, this.#columnWidth, vis);
      observer.observe(th);
      return th;
    });
    signals.effect(() => {
      this.#orderby = cols.map((col, i) => ({
        field: this.#columns[i],
        order: col.sortState.value
      }));
      this.requestData();
    });
    this.#thead.appendChild(
      html`<tr style=${{ height: this.#headerHeight }}>
				<th></th>
				${cols}
				<th style=${{ width: "99%", borderLeft: "none", borderRight: "none" }}></th>
			</tr>`
    );
    {
      this.#tableRoot.addEventListener("mouseover", (event) => {
        if (isTableCellElement(event.target) && isTableRowElement(event.target.parentNode)) {
          const cell = event.target;
          const row = event.target.parentNode;
          highlight(cell, row);
        }
      });
      this.#tableRoot.addEventListener("mouseout", (event) => {
        if (isTableCellElement(event.target) && isTableRowElement(event.target.parentNode)) {
          const cell = event.target;
          const row = event.target.parentNode;
          removeHighlight(cell, row);
        }
      });
    }
    return this;
  }
  /** Number of rows to append */
  async #appendRows(nrows) {
    nrows = Math.trunc(nrows);
    while (nrows >= 0) {
      let result = await this.#reader?.next();
      if (!result || result?.done) {
        break;
      }
      this.#appendRow(result.value.row, result.value.index);
      nrows--;
      continue;
    }
  }
  #appendRow(d, i) {
    let itr = this.#templateRow?.cloneNode(true);
    assert(itr, "Must have a data row");
    let td = (
      /** @type {HTMLTableCellElement} */
      itr?.childNodes[0]
    );
    td.appendChild(document.createTextNode(String(i)));
    for (let j = 0; j < this.#columns.length; ++j) {
      td = /** @type {HTMLTableCellElement} */
      itr.childNodes[j + 1];
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
};
var TRUNCATE = (
  /** @type {const} */
  {
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis"
  }
);
function thcol(field, minWidth, vis) {
  let buttonVisible = signals.signal(false);
  let width = signals.signal(minWidth);
  let sortState = signals.signal(
    "unset"
  );
  function nextSortState() {
    sortState.value = /** @type {const} */
    {
      "unset": "asc",
      "asc": "desc",
      "desc": "unset"
    }[sortState.value];
  }
  let svg = html`<svg style=${{ width: "1.5em" }} fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
		<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 9L12 5.25L15.75 9" />
		<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 15L12 18.75L15.75 15" />
	</svg>`;
  let uparrow = svg.children[0];
  let downarrow = svg.children[1];
  let verticalResizeHandle = html`<div class="resize-handle"></div>`;
  let sortButton = html`<span aria-role="button" class="sort-button" onmousedown=${nextSortState}>${svg}</span>`;
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
    if (sortState.value === "unset")
      buttonVisible.value = true;
  });
  th.addEventListener("mouseleave", () => {
    if (sortState.value === "unset")
      buttonVisible.value = false;
  });
  th.addEventListener("dblclick", (event) => {
    if (event.offsetX < sortButton.offsetWidth && event.offsetY < sortButton.offsetHeight) {
      return;
    }
    width.value = minWidth;
  });
  verticalResizeHandle.addEventListener("mousedown", (event) => {
    event.preventDefault();
    let startX = event.clientX;
    let startWidth = th.offsetWidth - parseFloat(getComputedStyle(th).paddingLeft) - parseFloat(getComputedStyle(th).paddingRight);
    function onMouseMove(event2) {
      let dx = event2.clientX - startX;
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
var STYLES = (
  /*css*/
  `:host {
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
`
);
function formatof(schema) {
  const format = /* @__PURE__ */ Object.create(
    null
  );
  for (const field of schema.fields) {
    format[field.name] = formatterForDataTypeValue(field.type);
  }
  return format;
}
function classof(schema) {
  const classes = /* @__PURE__ */ Object.create(null);
  for (const field of schema.fields) {
    if (arrow2.DataType.isInt(field.type) || arrow2.DataType.isFloat(field.type)) {
      classes[field.name] = "number";
    }
    if (arrow2.DataType.isDate(field.type) || arrow2.DataType.isTimestamp(field.type)) {
      classes[field.name] = "date";
    }
  }
  return classes;
}
function highlight(cell, row) {
  if (row.firstChild !== cell && cell !== row.lastElementChild) {
    cell.style.border = "1px solid var(--moon-gray)";
  }
  row.style.backgroundColor = "var(--light-silver)";
}
function removeHighlight(cell, row) {
  cell.style.removeProperty("border");
  row.style.removeProperty("background-color");
}
function isTableCellElement(node) {
  return node?.tagName === "TD";
}
function isTableRowElement(node) {
  return node instanceof HTMLTableRowElement;
}
function shouldGrayoutValue(value) {
  return value === "null" || value === "undefined" || value === "NaN" || value === "TODO";
}
function asc(field) {
  let expr = msql2.desc(field);
  expr._expr[0] = expr._expr[0].replace("DESC", "ASC");
  return expr;
}

// lib/utils/defer.ts
function defer() {
  let resolve;
  let reject;
  let promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// lib/widget.ts
var widget_default = () => {
  let coordinator = new mc3.Coordinator();
  let schema;
  return {
    async initialize({ model }) {
      let logger = coordinator.logger();
      let openQueries = /* @__PURE__ */ new Map();
      function send(query, resolve, reject) {
        let id = uuid.v4();
        openQueries.set(id, {
          query,
          startTime: performance.now(),
          resolve,
          reject
        });
        model.send({ ...query, uuid: id });
      }
      model.on("msg:custom", (msg, buffers) => {
        logger.group(`query ${msg.uuid}`);
        logger.log("received message", msg, buffers);
        let query = openQueries.get(msg.uuid);
        openQueries.delete(msg.uuid);
        assert2(query, `No query found for ${msg.uuid}`);
        logger.log(
          query.query.sql,
          (performance.now() - query.startTime).toFixed(1)
        );
        if (msg.error) {
          query.reject(msg.error);
          logger.error(msg.error);
          return;
        } else {
          switch (msg.type) {
            case "arrow": {
              let table = arrow3.tableFromIPC(buffers[0].buffer);
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
        query(query) {
          let { promise, resolve, reject } = defer();
          send(query, resolve, reject);
          return promise;
        }
      };
      coordinator.databaseConnector(connector);
      let empty = await coordinator.query(
        msql3.Query.from(model.get("_table_name")).select(...model.get("_columns")).limit(0).toString()
      );
      schema = empty.schema;
      return () => {
        coordinator.clear();
      };
    },
    render({ model, el }) {
      let $brush = mc3.Selection.crossfilter();
      let table = new DataTable({
        table: model.get("_table_name"),
        schema,
        filterBy: $brush
      });
      coordinator.connect(table);
      el.appendChild(table.node());
    }
  };
};
export {
  widget_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vbGliL3dpZGdldC50cyIsICIuLi8uLi9saWIvY2xpZW50cy9EYXRhVGFibGUudHMiLCAiLi4vLi4vbGliL3V0aWxzL2Zvcm1hdHRpbmcudHMiLCAiLi4vLi4vbGliL3V0aWxzL2Fzc2VydC50cyIsICIuLi8uLi9saWIvdXRpbHMvQXN5bmNCYXRjaFJlYWRlci50cyIsICIuLi8uLi9saWIvY2xpZW50cy9IaXN0b2dyYW0udHMiLCAiLi4vLi4vbGliL3V0aWxzL2RlZmVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgKiBhcyBtYyBmcm9tIFwiQHV3ZGF0YS9tb3NhaWMtY29yZVwiO1xuaW1wb3J0ICogYXMgbXNxbCBmcm9tIFwiQHV3ZGF0YS9tb3NhaWMtc3FsXCI7XG5pbXBvcnQgKiBhcyBhcnJvdyBmcm9tIFwiYXBhY2hlLWFycm93XCI7XG5pbXBvcnQgKiBhcyB1dWlkIGZyb20gXCJAbHVrZWVkL3V1aWRcIjtcbmltcG9ydCB0eXBlICogYXMgYXcgZnJvbSBcIkBhbnl3aWRnZXQvdHlwZXNcIjtcblxuaW1wb3J0IHsgRGF0YVRhYmxlIH0gZnJvbSBcIi4vY2xpZW50cy9EYXRhVGFibGUudHNcIjtcbmltcG9ydCB7IGFzc2VydCB9IGZyb20gXCIuL3V0aWxzL2Fzc2VydC50c1wiO1xuaW1wb3J0IHsgZGVmZXIgfSBmcm9tIFwiLi91dGlscy9kZWZlci50c1wiO1xuXG50eXBlIE1vZGVsID0ge1xuXHRfdGFibGVfbmFtZTogc3RyaW5nO1xuXHRfY29sdW1uczogQXJyYXk8c3RyaW5nPjtcblx0dGVtcF9pbmRleGVzOiBib29sZWFuO1xufTtcblxuaW50ZXJmYWNlIENvbm5lY3RvciB7XG5cdHF1ZXJ5KHF1ZXJ5OiBtc3FsLlF1ZXJ5KTogUHJvbWlzZTxhcnJvdy5UYWJsZSB8IFJlY29yZDxzdHJpbmcsIHVua25vd24+Pjtcbn1cblxuaW50ZXJmYWNlIE9wZW5RdWVyeSB7XG5cdHF1ZXJ5OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblx0c3RhcnRUaW1lOiBudW1iZXI7XG5cdHJlc29sdmU6ICh4OiBhcnJvdy5UYWJsZSB8IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB2b2lkO1xuXHRyZWplY3Q6IChlcnI/OiBzdHJpbmcpID0+IHZvaWQ7XG59XG5cbmV4cG9ydCBkZWZhdWx0ICgpID0+IHtcblx0bGV0IGNvb3JkaW5hdG9yID0gbmV3IG1jLkNvb3JkaW5hdG9yKCk7XG5cdGxldCBzY2hlbWE6IGFycm93LlNjaGVtYTtcblxuXHRyZXR1cm4ge1xuXHRcdGFzeW5jIGluaXRpYWxpemUoeyBtb2RlbCB9OiBhdy5Jbml0aWFsaXplUHJvcHM8TW9kZWw+KSB7XG5cdFx0XHQvLyB0cy1leHBlY3QtZXJyb3IgLSBvayB0byBoYXZlIG5vIGFyZ3Ncblx0XHRcdGxldCBsb2dnZXIgPSBjb29yZGluYXRvci5sb2dnZXIoKTtcblx0XHRcdGxldCBvcGVuUXVlcmllcyA9IG5ldyBNYXA8c3RyaW5nLCBPcGVuUXVlcnk+KCk7XG5cblx0XHRcdC8qKlxuXHRcdFx0ICogQHBhcmFtIHF1ZXJ5IC0gdGhlIHF1ZXJ5IHRvIHNlbmRcblx0XHRcdCAqIEBwYXJhbSByZXNvbHZlIC0gdGhlIHByb21pc2UgcmVzb2x2ZSBjYWxsYmFja1xuXHRcdFx0ICogQHBhcmFtIHJlamVjdCAtIHRoZSBwcm9taXNlIHJlamVjdCBjYWxsYmFja1xuXHRcdFx0ICovXG5cdFx0XHRmdW5jdGlvbiBzZW5kKFxuXHRcdFx0XHRxdWVyeTogbXNxbC5RdWVyeSxcblx0XHRcdFx0cmVzb2x2ZTogKHZhbHVlOiBhcnJvdy5UYWJsZSB8IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB2b2lkLFxuXHRcdFx0XHRyZWplY3Q6IChyZWFzb24/OiBzdHJpbmcpID0+IHZvaWQsXG5cdFx0XHQpIHtcblx0XHRcdFx0bGV0IGlkID0gdXVpZC52NCgpO1xuXHRcdFx0XHRvcGVuUXVlcmllcy5zZXQoaWQsIHtcblx0XHRcdFx0XHRxdWVyeSxcblx0XHRcdFx0XHRzdGFydFRpbWU6IHBlcmZvcm1hbmNlLm5vdygpLFxuXHRcdFx0XHRcdHJlc29sdmUsXG5cdFx0XHRcdFx0cmVqZWN0LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0bW9kZWwuc2VuZCh7IC4uLnF1ZXJ5LCB1dWlkOiBpZCB9KTtcblx0XHRcdH1cblxuXHRcdFx0bW9kZWwub24oXCJtc2c6Y3VzdG9tXCIsIChtc2csIGJ1ZmZlcnMpID0+IHtcblx0XHRcdFx0bG9nZ2VyLmdyb3VwKGBxdWVyeSAke21zZy51dWlkfWApO1xuXHRcdFx0XHRsb2dnZXIubG9nKFwicmVjZWl2ZWQgbWVzc2FnZVwiLCBtc2csIGJ1ZmZlcnMpO1xuXHRcdFx0XHRsZXQgcXVlcnkgPSBvcGVuUXVlcmllcy5nZXQobXNnLnV1aWQpO1xuXHRcdFx0XHRvcGVuUXVlcmllcy5kZWxldGUobXNnLnV1aWQpO1xuXHRcdFx0XHRhc3NlcnQocXVlcnksIGBObyBxdWVyeSBmb3VuZCBmb3IgJHttc2cudXVpZH1gKTtcblx0XHRcdFx0bG9nZ2VyLmxvZyhcblx0XHRcdFx0XHRxdWVyeS5xdWVyeS5zcWwsXG5cdFx0XHRcdFx0KHBlcmZvcm1hbmNlLm5vdygpIC0gcXVlcnkuc3RhcnRUaW1lKS50b0ZpeGVkKDEpLFxuXHRcdFx0XHQpO1xuXHRcdFx0XHRpZiAobXNnLmVycm9yKSB7XG5cdFx0XHRcdFx0cXVlcnkucmVqZWN0KG1zZy5lcnJvcik7XG5cdFx0XHRcdFx0bG9nZ2VyLmVycm9yKG1zZy5lcnJvcik7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHN3aXRjaCAobXNnLnR5cGUpIHtcblx0XHRcdFx0XHRcdGNhc2UgXCJhcnJvd1wiOiB7XG5cdFx0XHRcdFx0XHRcdGxldCB0YWJsZSA9IGFycm93LnRhYmxlRnJvbUlQQyhidWZmZXJzWzBdLmJ1ZmZlcik7XG5cdFx0XHRcdFx0XHRcdGxvZ2dlci5sb2coXCJ0YWJsZVwiLCB0YWJsZSk7XG5cdFx0XHRcdFx0XHRcdHF1ZXJ5LnJlc29sdmUodGFibGUpO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNhc2UgXCJqc29uXCI6IHtcblx0XHRcdFx0XHRcdFx0bG9nZ2VyLmxvZyhcImpzb25cIiwgbXNnLnJlc3VsdCk7XG5cdFx0XHRcdFx0XHRcdHF1ZXJ5LnJlc29sdmUobXNnLnJlc3VsdCk7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHRcdFx0XHRxdWVyeS5yZXNvbHZlKHt9KTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGxvZ2dlci5ncm91cEVuZChcInF1ZXJ5XCIpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGxldCBjb25uZWN0b3IgPSB7XG5cdFx0XHRcdHF1ZXJ5KHF1ZXJ5KSB7XG5cdFx0XHRcdFx0bGV0IHsgcHJvbWlzZSwgcmVzb2x2ZSwgcmVqZWN0IH0gPSBkZWZlcjxcblx0XHRcdFx0XHRcdGFycm93LlRhYmxlIHwgUmVjb3JkPHN0cmluZywgdW5rbm93bj4sXG5cdFx0XHRcdFx0XHRzdHJpbmdcblx0XHRcdFx0XHQ+KCk7XG5cdFx0XHRcdFx0c2VuZChxdWVyeSwgcmVzb2x2ZSwgcmVqZWN0KTtcblx0XHRcdFx0XHRyZXR1cm4gcHJvbWlzZTtcblx0XHRcdFx0fSxcblx0XHRcdH0gc2F0aXNmaWVzIENvbm5lY3RvcjtcblxuXHRcdFx0Y29vcmRpbmF0b3IuZGF0YWJhc2VDb25uZWN0b3IoY29ubmVjdG9yKTtcblxuXHRcdFx0Ly8gZ2V0IHNvbWUgaW5pdGlhbCBkYXRhIHRvIGdldCB0aGUgc2NoZW1hXG5cdFx0XHRsZXQgZW1wdHkgPSBhd2FpdCBjb29yZGluYXRvci5xdWVyeShcblx0XHRcdFx0bXNxbC5RdWVyeVxuXHRcdFx0XHRcdC5mcm9tKG1vZGVsLmdldChcIl90YWJsZV9uYW1lXCIpKVxuXHRcdFx0XHRcdC5zZWxlY3QoLi4ubW9kZWwuZ2V0KFwiX2NvbHVtbnNcIikpXG5cdFx0XHRcdFx0LmxpbWl0KDApXG5cdFx0XHRcdFx0LnRvU3RyaW5nKCksXG5cdFx0XHQpO1xuXHRcdFx0c2NoZW1hID0gZW1wdHkuc2NoZW1hO1xuXG5cdFx0XHRyZXR1cm4gKCkgPT4ge1xuXHRcdFx0XHRjb29yZGluYXRvci5jbGVhcigpO1xuXHRcdFx0fTtcblx0XHR9LFxuXHRcdHJlbmRlcih7IG1vZGVsLCBlbCB9OiBhdy5SZW5kZXJQcm9wczxNb2RlbD4pIHtcblx0XHRcdGxldCAkYnJ1c2ggPSBtYy5TZWxlY3Rpb24uY3Jvc3NmaWx0ZXIoKTtcblx0XHRcdGxldCB0YWJsZSA9IG5ldyBEYXRhVGFibGUoe1xuXHRcdFx0XHR0YWJsZTogbW9kZWwuZ2V0KFwiX3RhYmxlX25hbWVcIiksXG5cdFx0XHRcdHNjaGVtYTogc2NoZW1hLFxuXHRcdFx0XHRmaWx0ZXJCeTogJGJydXNoLFxuXHRcdFx0fSk7XG5cdFx0XHRjb29yZGluYXRvci5jb25uZWN0KHRhYmxlKTtcblx0XHRcdGVsLmFwcGVuZENoaWxkKHRhYmxlLm5vZGUoKSk7XG5cdFx0fSxcblx0fTtcbn07XG4iLCAiLy8vIDxyZWZlcmVuY2UgbGliPVwiZG9tXCIgLz5cbmltcG9ydCAqIGFzIGFycm93IGZyb20gXCJhcGFjaGUtYXJyb3dcIjtcbmltcG9ydCAqIGFzIG1jIGZyb20gXCJAdXdkYXRhL21vc2FpYy1jb3JlXCI7XG5pbXBvcnQgKiBhcyBtc3FsIGZyb20gXCJAdXdkYXRhL21vc2FpYy1zcWxcIjtcbmltcG9ydCAqIGFzIHNpZ25hbHMgZnJvbSBcIkBwcmVhY3Qvc2lnbmFscy1jb3JlXCI7XG5pbXBvcnQgeyBodG1sIH0gZnJvbSBcImh0bFwiO1xuXG5pbXBvcnQge1xuXHRmb3JtYXREYXRhVHlwZU5hbWUsXG5cdGZvcm1hdHRlckZvckRhdGFUeXBlVmFsdWUsXG59IGZyb20gXCIuLi91dGlscy9mb3JtYXR0aW5nLnRzXCI7XG5pbXBvcnQgeyBBc3luY0JhdGNoUmVhZGVyIH0gZnJvbSBcIi4uL3V0aWxzL0FzeW5jQmF0Y2hSZWFkZXIudHNcIjtcbmltcG9ydCB7IEhpc3RvZ3JhbSB9IGZyb20gXCIuL0hpc3RvZ3JhbS50c1wiO1xuXG5pbnRlcmZhY2UgRGF0YVRhYmxlT3B0aW9ucyB7XG5cdHRhYmxlOiBzdHJpbmc7XG5cdHNjaGVtYTogYXJyb3cuU2NoZW1hO1xuXHRoZWlnaHQ/OiBudW1iZXI7XG5cdGZpbHRlckJ5PzogbWMuU2VsZWN0aW9uO1xufVxuXG4vLyBUT0RPOiBtb3JlXG50eXBlIENvbHVtblN1bW1hcnlDbGllbnQgPSBIaXN0b2dyYW07XG5cbmV4cG9ydCBjbGFzcyBEYXRhVGFibGUgZXh0ZW5kcyBtYy5Nb3NhaWNDbGllbnQge1xuXHQvKiogc291cmNlIG9wdGlvbnMgKi9cblx0I3NvdXJjZTogRGF0YVRhYmxlT3B0aW9ucztcblx0LyoqIGZvciB0aGUgY29tcG9uZW50ICovXG5cdCNyb290OiBIVE1MRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG5cdC8qKiBzaGFkb3cgcm9vdCBmb3IgdGhlIGNvbXBvbmVudCAqL1xuXHQjc2hhZG93Um9vdDogU2hhZG93Um9vdCA9IHRoaXMuI3Jvb3QuYXR0YWNoU2hhZG93KHsgbW9kZTogXCJvcGVuXCIgfSk7XG5cdC8qKiBoZWFkZXIgb2YgdGhlIHRhYmxlICovXG5cdCN0aGVhZDogSFRNTFRhYmxlU2VjdGlvbkVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwidGhlYWRcIik7XG5cdC8qKiBib2R5IG9mIHRoZSB0YWJsZSAqL1xuXHQjdGJvZHk6IEhUTUxUYWJsZVNlY3Rpb25FbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInRib2R5XCIpO1xuXHQvKiogVGhlIFNRTCBvcmRlciBieSAqL1xuXHQjb3JkZXJieTogQXJyYXk8eyBmaWVsZDogc3RyaW5nOyBvcmRlcjogXCJhc2NcIiB8IFwiZGVzY1wiIHwgXCJ1bnNldFwiIH0+ID0gW107XG5cdC8qKiB0ZW1wbGF0ZSByb3cgZm9yIGRhdGEgKi9cblx0I3RlbXBsYXRlUm93OiBIVE1MVGFibGVSb3dFbGVtZW50IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHQvKiogZGl2IGNvbnRhaW5pbmcgdGhlIHRhYmxlICovXG5cdCN0YWJsZVJvb3Q6IEhUTUxEaXZFbGVtZW50O1xuXHQvKiogb2Zmc2V0IGludG8gdGhlIGRhdGEgKi9cblx0I29mZnNldDogbnVtYmVyID0gMDtcblx0LyoqIG51bWJlciBvZiByb3dzIHRvIGZldGNoICovXG5cdCNsaW1pdDogbnVtYmVyID0gMTAwO1xuXHQvKiogd2hldGhlciBhbiBpbnRlcm5hbCByZXF1ZXN0IGlzIHBlbmRpbmcgKi9cblx0I3BlbmRpbmc6IGJvb2xlYW4gPSBmYWxzZTtcblx0LyoqIG51bWJlciBvZiByb3dzIHRvIGRpc3BsYXkgKi9cblx0I3Jvd3M6IG51bWJlciA9IDExLjU7XG5cdC8qKiBoZWlnaHQgb2YgYSByb3cgKi9cblx0I3Jvd0hlaWdodDogbnVtYmVyID0gMjI7XG5cdC8qKiB3aWR0aCBvZiBhIGNvbHVtbiAqL1xuXHQjY29sdW1uV2lkdGg6IG51bWJlciA9IDEyNTtcblx0LyoqIGhlaWdodCBvZiB0aGUgaGVhZGVyICovXG5cdCNoZWFkZXJIZWlnaHQ6IHN0cmluZyA9IFwiNTBweFwiO1xuXHQvKiogdGhlIGZvcm1hdHRlciBmb3IgdGhlIGRhdGEgdGFibGUgZW50cmllcyAqL1xuXHQjZm9ybWF0OiBSZWNvcmQ8c3RyaW5nLCAodmFsdWU6IHVua25vd24pID0+IHN0cmluZz47XG5cblx0LyoqIEB0eXBlIHtBc3luY0JhdGNoUmVhZGVyPGFycm93LlN0cnVjdFJvd1Byb3h5PiB8IG51bGx9ICovXG5cdCNyZWFkZXI6IEFzeW5jQmF0Y2hSZWFkZXI8YXJyb3cuU3RydWN0Um93UHJveHk+IHwgbnVsbCA9IG51bGw7XG5cblx0Y29uc3RydWN0b3Ioc291cmNlOiBEYXRhVGFibGVPcHRpb25zKSB7XG5cdFx0c3VwZXIoc291cmNlLmZpbHRlckJ5KTtcblx0XHR0aGlzLiNzb3VyY2UgPSBzb3VyY2U7XG5cdFx0dGhpcy4jZm9ybWF0ID0gZm9ybWF0b2Yoc291cmNlLnNjaGVtYSk7XG5cdFx0dGhpcy4jcGVuZGluZyA9IGZhbHNlO1xuXG5cdFx0bGV0IG1heEhlaWdodCA9IGAkeyh0aGlzLiNyb3dzICsgMSkgKiB0aGlzLiNyb3dIZWlnaHQgLSAxfXB4YDtcblx0XHQvLyBpZiBtYXhIZWlnaHQgaXMgc2V0LCBjYWxjdWxhdGUgdGhlIG51bWJlciBvZiByb3dzIHRvIGRpc3BsYXlcblx0XHRpZiAoc291cmNlLmhlaWdodCkge1xuXHRcdFx0dGhpcy4jcm93cyA9IE1hdGguZmxvb3Ioc291cmNlLmhlaWdodCAvIHRoaXMuI3Jvd0hlaWdodCk7XG5cdFx0XHRtYXhIZWlnaHQgPSBgJHtzb3VyY2UuaGVpZ2h0fXB4YDtcblx0XHR9XG5cblx0XHRsZXQgcm9vdDogSFRNTERpdkVsZW1lbnQgPSBodG1sYDxkaXYgY2xhc3M9XCJxdWFrXCIgc3R5bGU9JHt7XG5cdFx0XHRtYXhIZWlnaHQsXG5cdFx0fX0+YDtcblx0XHQvLyBAZGVuby1mbXQtaWdub3JlXG5cdFx0cm9vdC5hcHBlbmRDaGlsZChcblx0XHRcdGh0bWwuZnJhZ21lbnRgPHRhYmxlIGNsYXNzPVwicXVha1wiIHN0eWxlPSR7eyB0YWJsZUxheW91dDogXCJmaXhlZFwiIH19PiR7dGhpcy4jdGhlYWR9JHt0aGlzLiN0Ym9keX08L3RhYmxlPmBcblx0XHQpO1xuXHRcdHRoaXMuI3NoYWRvd1Jvb3QuYXBwZW5kQ2hpbGQoaHRtbGA8c3R5bGU+JHtTVFlMRVN9PC9zdHlsZT5gKTtcblx0XHR0aGlzLiNzaGFkb3dSb290LmFwcGVuZENoaWxkKHJvb3QpO1xuXHRcdHRoaXMuI3RhYmxlUm9vdCA9IHJvb3Q7XG5cblx0XHQvLyBzY3JvbGwgZXZlbnQgbGlzdGVuZXJcblx0XHR0aGlzLiN0YWJsZVJvb3QuYWRkRXZlbnRMaXN0ZW5lcihcInNjcm9sbFwiLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRsZXQgaXNBdEJvdHRvbSA9XG5cdFx0XHRcdHRoaXMuI3RhYmxlUm9vdC5zY3JvbGxIZWlnaHQgLSB0aGlzLiN0YWJsZVJvb3Quc2Nyb2xsVG9wIDxcblx0XHRcdFx0XHR0aGlzLiNyb3dzICogdGhpcy4jcm93SGVpZ2h0ICogMS41O1xuXHRcdFx0aWYgKGlzQXRCb3R0b20pIHtcblx0XHRcdFx0YXdhaXQgdGhpcy4jYXBwZW5kUm93cyh0aGlzLiNyb3dzKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGZpZWxkcygpOiBBcnJheTx7IHRhYmxlOiBzdHJpbmc7IGNvbHVtbjogc3RyaW5nOyBzdGF0czogQXJyYXk8c3RyaW5nPiB9PiB7XG5cdFx0cmV0dXJuIHRoaXMuI2NvbHVtbnMubWFwKChjb2x1bW4pID0+ICh7XG5cdFx0XHR0YWJsZTogdGhpcy4jc291cmNlLnRhYmxlLFxuXHRcdFx0Y29sdW1uLFxuXHRcdFx0c3RhdHM6IFtdLFxuXHRcdH0pKTtcblx0fVxuXG5cdG5vZGUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuI3Jvb3Q7XG5cdH1cblxuXHRnZXQgI2NvbHVtbnMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuI3NvdXJjZS5zY2hlbWEuZmllbGRzLm1hcCgoZmllbGQpID0+IGZpZWxkLm5hbWUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBwYXJhbSB7QXJyYXk8dW5rbm93bj59IGZpbHRlclxuXHQgKi9cblx0cXVlcnkoZmlsdGVyOiBBcnJheTx1bmtub3duPiA9IFtdKSB7XG5cdFx0cmV0dXJuIG1zcWwuUXVlcnkuZnJvbSh0aGlzLiNzb3VyY2UudGFibGUpXG5cdFx0XHQuc2VsZWN0KHRoaXMuI2NvbHVtbnMpXG5cdFx0XHQud2hlcmUoZmlsdGVyKVxuXHRcdFx0Lm9yZGVyYnkoXG5cdFx0XHRcdHRoaXMuI29yZGVyYnlcblx0XHRcdFx0XHQuZmlsdGVyKChvKSA9PiBvLm9yZGVyICE9PSBcInVuc2V0XCIpXG5cdFx0XHRcdFx0Lm1hcCgobykgPT4gby5vcmRlciA9PT0gXCJhc2NcIiA/IGFzYyhvLmZpZWxkKSA6IG1zcWwuZGVzYyhvLmZpZWxkKSksXG5cdFx0XHQpXG5cdFx0XHQubGltaXQodGhpcy4jbGltaXQpXG5cdFx0XHQub2Zmc2V0KHRoaXMuI29mZnNldCk7XG5cdH1cblxuXHQvKipcblx0ICogQSBtb3NpYWMgbGlmZWN5Y2xlIGZ1bmN0aW9uIHRoYXQgaXMgY2FsbGVkIHdpdGggdGhlIHJlc3VsdHMgZnJvbSBgcXVlcnlgLlxuXHQgKiBNdXN0IGJlIHN5bmNocm9ub3VzLCBhbmQgcmV0dXJuIGB0aGlzYC5cblx0ICovXG5cdHF1ZXJ5UmVzdWx0KGRhdGE6IGFycm93LlRhYmxlKSB7XG5cdFx0aWYgKCF0aGlzLiNwZW5kaW5nKSB7XG5cdFx0XHQvLyBkYXRhIGlzIG5vdCBmcm9tIGFuIGludGVybmFsIHJlcXVlc3QsIHNvIHJlc2V0IHRhYmxlXG5cdFx0XHR0aGlzLiNyZWFkZXIgPSBuZXcgQXN5bmNCYXRjaFJlYWRlcigoKSA9PiB7XG5cdFx0XHRcdHRoaXMuI3BlbmRpbmcgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLnJlcXVlc3REYXRhKHRoaXMuI29mZnNldCArIHRoaXMuI2xpbWl0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy4jdGJvZHkucmVwbGFjZUNoaWxkcmVuKCk7XG5cdFx0XHR0aGlzLiNvZmZzZXQgPSAwO1xuXHRcdH1cblx0XHR0aGlzLiNyZWFkZXI/LmVucXVldWVCYXRjaChkYXRhW1N5bWJvbC5pdGVyYXRvcl0oKSwge1xuXHRcdFx0bGFzdDogZGF0YS5udW1Sb3dzIDwgdGhpcy4jbGltaXQsXG5cdFx0fSk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHR1cGRhdGUoKSB7XG5cdFx0aWYgKCF0aGlzLiNwZW5kaW5nKSB7XG5cdFx0XHQvLyBvbiB0aGUgZmlyc3QgdXBkYXRlLCBwb3B1bGF0ZSB0aGUgdGFibGUgd2l0aCBpbml0aWFsIGRhdGFcblx0XHRcdHRoaXMuI2FwcGVuZFJvd3ModGhpcy4jcm93cyAqIDIpO1xuXHRcdH1cblx0XHR0aGlzLiNwZW5kaW5nID0gZmFsc2U7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRyZXF1ZXN0RGF0YShvZmZzZXQgPSAwKSB7XG5cdFx0dGhpcy4jb2Zmc2V0ID0gb2Zmc2V0O1xuXG5cdFx0Ly8gcmVxdWVzdCBuZXh0IGRhdGEgYmF0Y2hcblx0XHRsZXQgcXVlcnkgPSB0aGlzLnF1ZXJ5KHRoaXMuZmlsdGVyQnk/LnByZWRpY2F0ZSh0aGlzKSk7XG5cdFx0dGhpcy5yZXF1ZXN0UXVlcnkocXVlcnkpO1xuXG5cdFx0Ly8gcHJlZmV0Y2ggc3Vic2VxdWVudCBkYXRhIGJhdGNoXG5cdFx0dGhpcy5jb29yZGluYXRvci5wcmVmZXRjaChxdWVyeS5jbG9uZSgpLm9mZnNldChvZmZzZXQgKyB0aGlzLiNsaW1pdCkpO1xuXHR9XG5cblx0LyoqIEBwYXJhbSB7QXJyYXk8SW5mbz59IGluZm9zICovXG5cdGZpZWxkSW5mbyhpbmZvczogQXJyYXk8SW5mbz4pIHtcblx0XHRsZXQgY2xhc3NlcyA9IGNsYXNzb2YodGhpcy4jc291cmNlLnNjaGVtYSk7XG5cblx0XHQvLyBAZGVuby1mbXQtaWdub3JlXG5cdFx0dGhpcy4jdGVtcGxhdGVSb3cgPSBodG1sYDx0cj48dGQ+PC90ZD4ke1xuXHRcdFx0aW5mb3MubWFwKChpbmZvKSA9PiBodG1sLmZyYWdtZW50YDx0ZCBjbGFzcz0ke2NsYXNzZXNbaW5mby5jb2x1bW5dfT48L3RkPmApXG5cdFx0fVxuXHRcdFx0PHRkIHN0eWxlPSR7eyB3aWR0aDogXCI5OSVcIiwgYm9yZGVyTGVmdDogXCJub25lXCIsIGJvcmRlclJpZ2h0OiBcIm5vbmVcIiB9fT48L3RkPlxuXHRcdDwvdHI+YDtcblxuXHRcdGxldCBvYnNlcnZlciA9IG5ldyBJbnRlcnNlY3Rpb25PYnNlcnZlcigoZW50cmllcykgPT4ge1xuXHRcdFx0Zm9yIChsZXQgZW50cnkgb2YgZW50cmllcykge1xuXHRcdFx0XHQvKiogQHR5cGUge0NvbHVtblN1bW1hcnlDbGllbnQgfCB1bmRlZmluZWR9ICovXG5cdFx0XHRcdGxldCB2aXM6IENvbHVtblN1bW1hcnlDbGllbnQgfCB1bmRlZmluZWQgPVxuXHRcdFx0XHRcdC8qKiBAdHlwZSB7YW55fSAqLyAoZW50cnkudGFyZ2V0KS52aXM7XG5cdFx0XHRcdGlmICghdmlzKSBjb250aW51ZTtcblx0XHRcdFx0aWYgKGVudHJ5LmlzSW50ZXJzZWN0aW5nKSB7XG5cdFx0XHRcdFx0dGhpcy5jb29yZGluYXRvci5jb25uZWN0KHZpcyk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5jb29yZGluYXRvcj8uZGlzY29ubmVjdCh2aXMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSwge1xuXHRcdFx0cm9vdDogdGhpcy4jdGFibGVSb290LFxuXHRcdH0pO1xuXG5cdFx0bGV0IGNvbHMgPSB0aGlzLiNzb3VyY2Uuc2NoZW1hLmZpZWxkcy5tYXAoKGZpZWxkKSA9PiB7XG5cdFx0XHRsZXQgaW5mbyA9IGluZm9zLmZpbmQoKGMpID0+IGMuY29sdW1uID09PSBmaWVsZC5uYW1lKTtcblx0XHRcdGFzc2VydChpbmZvLCBgTm8gaW5mbyBmb3IgY29sdW1uICR7ZmllbGQubmFtZX1gKTtcblx0XHRcdGxldCB2aXM6IENvbHVtblN1bW1hcnlDbGllbnQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoaW5mby50eXBlID09PSBcIm51bWJlclwiIHx8IGluZm8udHlwZSA9PT0gXCJkYXRlXCIpIHtcblx0XHRcdFx0dmlzID0gbmV3IEhpc3RvZ3JhbSh7XG5cdFx0XHRcdFx0dGFibGU6IHRoaXMuI3NvdXJjZS50YWJsZSxcblx0XHRcdFx0XHRjb2x1bW46IGZpZWxkLm5hbWUsXG5cdFx0XHRcdFx0dHlwZTogaW5mby50eXBlLFxuXHRcdFx0XHRcdGZpbHRlckJ5OiB0aGlzLiNzb3VyY2UuZmlsdGVyQnksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0bGV0IHRoID0gdGhjb2woZmllbGQsIHRoaXMuI2NvbHVtbldpZHRoLCB2aXMpO1xuXHRcdFx0b2JzZXJ2ZXIub2JzZXJ2ZSh0aCk7XG5cdFx0XHRyZXR1cm4gdGg7XG5cdFx0fSk7XG5cblx0XHRzaWduYWxzLmVmZmVjdCgoKSA9PiB7XG5cdFx0XHR0aGlzLiNvcmRlcmJ5ID0gY29scy5tYXAoKGNvbCwgaSkgPT4gKHtcblx0XHRcdFx0ZmllbGQ6IHRoaXMuI2NvbHVtbnNbaV0sXG5cdFx0XHRcdG9yZGVyOiBjb2wuc29ydFN0YXRlLnZhbHVlLFxuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5yZXF1ZXN0RGF0YSgpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gQGRlbm8tZm10LWlnbm9yZVxuXHRcdHRoaXMuI3RoZWFkLmFwcGVuZENoaWxkKFxuXHRcdFx0aHRtbGA8dHIgc3R5bGU9JHt7IGhlaWdodDogdGhpcy4jaGVhZGVySGVpZ2h0IH19PlxuXHRcdFx0XHQ8dGg+PC90aD5cblx0XHRcdFx0JHtjb2xzfVxuXHRcdFx0XHQ8dGggc3R5bGU9JHt7IHdpZHRoOiBcIjk5JVwiLCBib3JkZXJMZWZ0OiBcIm5vbmVcIiwgYm9yZGVyUmlnaHQ6IFwibm9uZVwiIH19PjwvdGg+XG5cdFx0XHQ8L3RyPmAsXG5cdFx0KTtcblxuXHRcdC8vIGhpZ2hsaWdodCBvbiBob3ZlclxuXHRcdHtcblx0XHRcdHRoaXMuI3RhYmxlUm9vdC5hZGRFdmVudExpc3RlbmVyKFwibW91c2VvdmVyXCIsIChldmVudCkgPT4ge1xuXHRcdFx0XHRpZiAoXG5cdFx0XHRcdFx0aXNUYWJsZUNlbGxFbGVtZW50KGV2ZW50LnRhcmdldCkgJiZcblx0XHRcdFx0XHRpc1RhYmxlUm93RWxlbWVudChldmVudC50YXJnZXQucGFyZW50Tm9kZSlcblx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0Y29uc3QgY2VsbCA9IGV2ZW50LnRhcmdldDtcblx0XHRcdFx0XHRjb25zdCByb3cgPSBldmVudC50YXJnZXQucGFyZW50Tm9kZTtcblx0XHRcdFx0XHRoaWdobGlnaHQoY2VsbCwgcm93KTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLiN0YWJsZVJvb3QuYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNlb3V0XCIsIChldmVudCkgPT4ge1xuXHRcdFx0XHRpZiAoXG5cdFx0XHRcdFx0aXNUYWJsZUNlbGxFbGVtZW50KGV2ZW50LnRhcmdldCkgJiZcblx0XHRcdFx0XHRpc1RhYmxlUm93RWxlbWVudChldmVudC50YXJnZXQucGFyZW50Tm9kZSlcblx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0Y29uc3QgY2VsbCA9IGV2ZW50LnRhcmdldDtcblx0XHRcdFx0XHRjb25zdCByb3cgPSBldmVudC50YXJnZXQucGFyZW50Tm9kZTtcblx0XHRcdFx0XHRyZW1vdmVIaWdobGlnaHQoY2VsbCwgcm93KTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHQvKiogTnVtYmVyIG9mIHJvd3MgdG8gYXBwZW5kICovXG5cdGFzeW5jICNhcHBlbmRSb3dzKG5yb3dzOiBudW1iZXIpIHtcblx0XHRucm93cyA9IE1hdGgudHJ1bmMobnJvd3MpO1xuXHRcdHdoaWxlIChucm93cyA+PSAwKSB7XG5cdFx0XHRsZXQgcmVzdWx0ID0gYXdhaXQgdGhpcy4jcmVhZGVyPy5uZXh0KCk7XG5cdFx0XHRpZiAoIXJlc3VsdCB8fCByZXN1bHQ/LmRvbmUpIHtcblx0XHRcdFx0Ly8gd2UndmUgZXhoYXVzdGVkIGFsbCByb3dzXG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy4jYXBwZW5kUm93KHJlc3VsdC52YWx1ZS5yb3csIHJlc3VsdC52YWx1ZS5pbmRleCk7XG5cdFx0XHRucm93cy0tO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHR9XG5cblx0I2FwcGVuZFJvdyhkOiBhcnJvdy5TdHJ1Y3RSb3dQcm94eSwgaTogbnVtYmVyKSB7XG5cdFx0bGV0IGl0ciA9IHRoaXMuI3RlbXBsYXRlUm93Py5jbG9uZU5vZGUodHJ1ZSk7XG5cdFx0YXNzZXJ0KGl0ciwgXCJNdXN0IGhhdmUgYSBkYXRhIHJvd1wiKTtcblx0XHRsZXQgdGQgPSAvKiogQHR5cGUge0hUTUxUYWJsZUNlbGxFbGVtZW50fSAqLyAoaXRyPy5jaGlsZE5vZGVzWzBdKTtcblx0XHR0ZC5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShTdHJpbmcoaSkpKTtcblx0XHRmb3IgKGxldCBqID0gMDsgaiA8IHRoaXMuI2NvbHVtbnMubGVuZ3RoOyArK2opIHtcblx0XHRcdHRkID0gLyoqIEB0eXBlIHtIVE1MVGFibGVDZWxsRWxlbWVudH0gKi8gKGl0ci5jaGlsZE5vZGVzW2ogKyAxXSk7XG5cdFx0XHR0ZC5jbGFzc0xpc3QucmVtb3ZlKFwiZ3JheVwiKTtcblx0XHRcdGxldCBjb2wgPSB0aGlzLiNjb2x1bW5zW2pdO1xuXHRcdFx0LyoqIEB0eXBlIHtzdHJpbmd9ICovXG5cdFx0XHRsZXQgc3RyaW5naWZpZWQ6IHN0cmluZyA9IHRoaXMuI2Zvcm1hdFtjb2xdKGRbY29sXSk7XG5cdFx0XHRpZiAoc2hvdWxkR3JheW91dFZhbHVlKHN0cmluZ2lmaWVkKSkge1xuXHRcdFx0XHR0ZC5jbGFzc0xpc3QuYWRkKFwiZ3JheVwiKTtcblx0XHRcdH1cblx0XHRcdGxldCB2YWx1ZSA9IGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKHN0cmluZ2lmaWVkKTtcblx0XHRcdHRkLmFwcGVuZENoaWxkKHZhbHVlKTtcblx0XHR9XG5cdFx0dGhpcy4jdGJvZHkuYXBwZW5kKGl0cik7XG5cdH1cbn1cblxuY29uc3QgVFJVTkNBVEUgPSAvKiogQHR5cGUge2NvbnN0fSAqLyAoe1xuXHR3aGl0ZVNwYWNlOiBcIm5vd3JhcFwiLFxuXHRvdmVyZmxvdzogXCJoaWRkZW5cIixcblx0dGV4dE92ZXJmbG93OiBcImVsbGlwc2lzXCIsXG59KTtcblxuLyoqXG4gKiBAcGFyYW0ge2Fycm93LkZpZWxkfSBmaWVsZFxuICogQHBhcmFtIHtudW1iZXJ9IG1pbldpZHRoXG4gKiBAcGFyYW0ge0NvbHVtblN1bW1hcnlDbGllbnR9IFt2aXNdXG4gKi9cbmZ1bmN0aW9uIHRoY29sKGZpZWxkOiBhcnJvdy5GaWVsZCwgbWluV2lkdGg6IG51bWJlciwgdmlzOiBIaXN0b2dyYW0pIHtcblx0bGV0IGJ1dHRvblZpc2libGUgPSBzaWduYWxzLnNpZ25hbChmYWxzZSk7XG5cdGxldCB3aWR0aCA9IHNpZ25hbHMuc2lnbmFsKG1pbldpZHRoKTtcblx0bGV0IHNvcnRTdGF0ZTogc2lnbmFscy5TaWduYWw8XCJ1bnNldFwiIHwgXCJhc2NcIiB8IFwiZGVzY1wiPiA9IHNpZ25hbHMuc2lnbmFsKFxuXHRcdFwidW5zZXRcIixcblx0KTtcblxuXHRmdW5jdGlvbiBuZXh0U29ydFN0YXRlKCkge1xuXHRcdC8vIHNpbXBsZSBzdGF0ZSBtYWNoaW5lXG5cdFx0Ly8gdW5zZXQgLT4gYXNjIC0+IGRlc2MgLT4gdW5zZXRcblx0XHRzb3J0U3RhdGUudmFsdWUgPSAvKiogQHR5cGUge2NvbnN0fSAqLyAoe1xuXHRcdFx0XCJ1bnNldFwiOiBcImFzY1wiLFxuXHRcdFx0XCJhc2NcIjogXCJkZXNjXCIsXG5cdFx0XHRcImRlc2NcIjogXCJ1bnNldFwiLFxuXHRcdH0pW3NvcnRTdGF0ZS52YWx1ZV07XG5cdH1cblxuXHQvLyBAZGVuby1mbXQtaWdub3JlXG5cdGxldCBzdmcgPSBodG1sYDxzdmcgc3R5bGU9JHt7IHdpZHRoOiBcIjEuNWVtXCIgfX0gZmlsbD1cIm5vbmVcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgc3Ryb2tlLXdpZHRoPVwiMS41XCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCI+XG5cdFx0PHBhdGggc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCIgZD1cIk04LjI1IDlMMTIgNS4yNUwxNS43NSA5XCIgLz5cblx0XHQ8cGF0aCBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIiBkPVwiTTguMjUgMTVMMTIgMTguNzVMMTUuNzUgMTVcIiAvPlxuXHQ8L3N2Zz5gO1xuXHQvKiogQHR5cGUge1NWR1BhdGhFbGVtZW50fSAqL1xuXHRsZXQgdXBhcnJvdzogU1ZHUGF0aEVsZW1lbnQgPSBzdmcuY2hpbGRyZW5bMF07XG5cdC8qKiBAdHlwZSB7U1ZHUGF0aEVsZW1lbnR9ICovXG5cdGxldCBkb3duYXJyb3c6IFNWR1BhdGhFbGVtZW50ID0gc3ZnLmNoaWxkcmVuWzFdO1xuXHQvKiogQHR5cGUge0hUTUxEaXZFbGVtZW50fSAqL1xuXHRsZXQgdmVydGljYWxSZXNpemVIYW5kbGU6IEhUTUxEaXZFbGVtZW50ID1cblx0XHRodG1sYDxkaXYgY2xhc3M9XCJyZXNpemUtaGFuZGxlXCI+PC9kaXY+YDtcblx0Ly8gQGRlbm8tZm10LWlnbm9yZVxuXHRsZXQgc29ydEJ1dHRvbiA9IGh0bWxgPHNwYW4gYXJpYS1yb2xlPVwiYnV0dG9uXCIgY2xhc3M9XCJzb3J0LWJ1dHRvblwiIG9ubW91c2Vkb3duPSR7bmV4dFNvcnRTdGF0ZX0+JHtzdmd9PC9zcGFuPmA7XG5cdC8vIEBkZW5vLWZtdC1pZ25vcmVcblx0LyoqIEB0eXBlIHtIVE1MVGFibGVDZWxsRWxlbWVudH0gKi9cblx0bGV0IHRoOiBIVE1MVGFibGVDZWxsRWxlbWVudCA9IGh0bWxgPHRoIHRpdGxlPSR7ZmllbGQubmFtZX0+XG5cdFx0PGRpdiBzdHlsZT0ke3sgZGlzcGxheTogXCJmbGV4XCIsIGp1c3RpZnlDb250ZW50OiBcInNwYWNlLWJldHdlZW5cIiwgYWxpZ25JdGVtczogXCJjZW50ZXJcIiB9fT5cblx0XHRcdDxzcGFuIHN0eWxlPSR7eyBtYXJnaW5Cb3R0b206IFwiNXB4XCIsIG1heFdpZHRoOiBcIjI1MHB4XCIsIC4uLlRSVU5DQVRFIH19PiR7ZmllbGQubmFtZX08L3NwYW4+XG5cdFx0XHQke3NvcnRCdXR0b259XG5cdFx0PC9kaXY+XG5cdFx0JHt2ZXJ0aWNhbFJlc2l6ZUhhbmRsZX1cblx0XHQ8c3BhbiBjbGFzcz1cImdyYXlcIiBzdHlsZT0ke3sgZm9udFdlaWdodDogNDAwLCBmb250U2l6ZTogXCIxMnB4XCIsIHVzZXJTZWxlY3Q6IFwibm9uZVwiIH19PiR7Zm9ybWF0RGF0YVR5cGVOYW1lKGZpZWxkLnR5cGUpfTwvc3Bhbj5cblx0XHQke3Zpcz8ucGxvdD8ubm9kZSgpfVxuXHQ8L3RoPmA7XG5cblx0c2lnbmFscy5lZmZlY3QoKCkgPT4ge1xuXHRcdHVwYXJyb3cuc2V0QXR0cmlidXRlKFwic3Ryb2tlXCIsIFwidmFyKC0tbW9vbi1ncmF5KVwiKTtcblx0XHRkb3duYXJyb3cuc2V0QXR0cmlidXRlKFwic3Ryb2tlXCIsIFwidmFyKC0tbW9vbi1ncmF5KVwiKTtcblx0XHQvLyBAZGVuby1mbXQtaWdub3JlXG5cdFx0bGV0IGVsZW1lbnQgPSB7IFwiYXNjXCI6IHVwYXJyb3csIFwiZGVzY1wiOiBkb3duYXJyb3csIFwidW5zZXRcIjogbnVsbCB9W3NvcnRTdGF0ZS52YWx1ZV07XG5cdFx0ZWxlbWVudD8uc2V0QXR0cmlidXRlKFwic3Ryb2tlXCIsIFwidmFyKC0tZGFyay1ncmF5KVwiKTtcblx0fSk7XG5cblx0c2lnbmFscy5lZmZlY3QoKCkgPT4ge1xuXHRcdHNvcnRCdXR0b24uc3R5bGUudmlzaWJpbGl0eSA9IGJ1dHRvblZpc2libGUudmFsdWUgPyBcInZpc2libGVcIiA6IFwiaGlkZGVuXCI7XG5cdH0pO1xuXG5cdHNpZ25hbHMuZWZmZWN0KCgpID0+IHtcblx0XHR0aC5zdHlsZS53aWR0aCA9IGAke3dpZHRoLnZhbHVlfXB4YDtcblx0fSk7XG5cblx0dGguYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNlb3ZlclwiLCAoKSA9PiB7XG5cdFx0aWYgKHNvcnRTdGF0ZS52YWx1ZSA9PT0gXCJ1bnNldFwiKSBidXR0b25WaXNpYmxlLnZhbHVlID0gdHJ1ZTtcblx0fSk7XG5cblx0dGguYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNlbGVhdmVcIiwgKCkgPT4ge1xuXHRcdGlmIChzb3J0U3RhdGUudmFsdWUgPT09IFwidW5zZXRcIikgYnV0dG9uVmlzaWJsZS52YWx1ZSA9IGZhbHNlO1xuXHR9KTtcblxuXHR0aC5hZGRFdmVudExpc3RlbmVyKFwiZGJsY2xpY2tcIiwgKGV2ZW50KSA9PiB7XG5cdFx0Ly8gcmVzZXQgY29sdW1uIHdpZHRoIGJ1dCB3ZSBkb24ndCB3YW50IHRvIGludGVyZmVyZSB3aXRoIHNvbWVvbmVcblx0XHQvLyBkb3VibGUtY2xpY2tpbmcgdGhlIHNvcnQgYnV0dG9uXG5cdFx0Ly8gaWYgdGhlIG1vdXNlIGlzIHdpdGhpbiB0aGUgc29ydCBidXR0b24sIGRvbid0IHJlc2V0IHRoZSB3aWR0aFxuXHRcdGlmIChcblx0XHRcdGV2ZW50Lm9mZnNldFggPCBzb3J0QnV0dG9uLm9mZnNldFdpZHRoICYmXG5cdFx0XHRldmVudC5vZmZzZXRZIDwgc29ydEJ1dHRvbi5vZmZzZXRIZWlnaHRcblx0XHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0d2lkdGgudmFsdWUgPSBtaW5XaWR0aDtcblx0fSk7XG5cblx0dmVydGljYWxSZXNpemVIYW5kbGUuYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNlZG93blwiLCAoZXZlbnQpID0+IHtcblx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdGxldCBzdGFydFggPSBldmVudC5jbGllbnRYO1xuXHRcdGxldCBzdGFydFdpZHRoID0gdGgub2Zmc2V0V2lkdGggLVxuXHRcdFx0cGFyc2VGbG9hdChnZXRDb21wdXRlZFN0eWxlKHRoKS5wYWRkaW5nTGVmdCkgLVxuXHRcdFx0cGFyc2VGbG9hdChnZXRDb21wdXRlZFN0eWxlKHRoKS5wYWRkaW5nUmlnaHQpO1xuXHRcdGZ1bmN0aW9uIG9uTW91c2VNb3ZlKC8qKiBAdHlwZSB7TW91c2VFdmVudH0gKi8gZXZlbnQ6IE1vdXNlRXZlbnQpIHtcblx0XHRcdGxldCBkeCA9IGV2ZW50LmNsaWVudFggLSBzdGFydFg7XG5cdFx0XHR3aWR0aC52YWx1ZSA9IE1hdGgubWF4KG1pbldpZHRoLCBzdGFydFdpZHRoICsgZHgpO1xuXHRcdFx0dmVydGljYWxSZXNpemVIYW5kbGUuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gXCJ2YXIoLS1saWdodC1zaWx2ZXIpXCI7XG5cdFx0fVxuXHRcdGZ1bmN0aW9uIG9uTW91c2VVcCgpIHtcblx0XHRcdHZlcnRpY2FsUmVzaXplSGFuZGxlLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IFwidHJhbnNwYXJlbnRcIjtcblx0XHRcdGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtb3VzZW1vdmVcIiwgb25Nb3VzZU1vdmUpO1xuXHRcdFx0ZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1vdXNldXBcIiwgb25Nb3VzZVVwKTtcblx0XHR9XG5cdFx0ZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNlbW92ZVwiLCBvbk1vdXNlTW92ZSk7XG5cdFx0ZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNldXBcIiwgb25Nb3VzZVVwKTtcblx0fSk7XG5cblx0dmVydGljYWxSZXNpemVIYW5kbGUuYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNlb3ZlclwiLCAoKSA9PiB7XG5cdFx0dmVydGljYWxSZXNpemVIYW5kbGUuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gXCJ2YXIoLS1saWdodC1zaWx2ZXIpXCI7XG5cdH0pO1xuXG5cdHZlcnRpY2FsUmVzaXplSGFuZGxlLmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZWxlYXZlXCIsICgpID0+IHtcblx0XHR2ZXJ0aWNhbFJlc2l6ZUhhbmRsZS5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBcInRyYW5zcGFyZW50XCI7XG5cdH0pO1xuXG5cdHJldHVybiBPYmplY3QuYXNzaWduKHRoLCB7IHZpcywgc29ydFN0YXRlIH0pO1xufVxuXG5jb25zdCBTVFlMRVMgPSAvKmNzcyovIGBcXFxuOmhvc3Qge1xuICBhbGw6IGluaXRpYWw7XG4gIC0tc2Fucy1zZXJpZjogLWFwcGxlLXN5c3RlbSwgQmxpbmtNYWNTeXN0ZW1Gb250LCBcImF2ZW5pciBuZXh0XCIsIGF2ZW5pciwgaGVsdmV0aWNhLCBcImhlbHZldGljYSBuZXVlXCIsIHVidW50dSwgcm9ib3RvLCBub3RvLCBcInNlZ29lIHVpXCIsIGFyaWFsLCBzYW5zLXNlcmlmO1xuICAtLWxpZ2h0LXNpbHZlcjogI2VmZWZlZjtcbiAgLS1zcGFjaW5nLW5vbmU6IDA7XG4gIC0td2hpdGU6ICNmZmY7XG4gIC0tZ3JheTogIzkyOTI5MjtcbiAgLS1kYXJrLWdyYXk6ICMzMzM7XG4gIC0tbW9vbi1ncmF5OiAjYzRjNGM0O1xuICAtLW1pZC1ncmF5OiAjNmU2ZTZlO1xufVxuXG4uaGlnaGxpZ2h0IHtcblx0YmFja2dyb3VuZC1jb2xvcjogdmFyKC0tbGlnaHQtc2lsdmVyKTtcbn1cblxuLmhpZ2hsaWdodC1jZWxsIHtcblx0Ym9yZGVyOiAxcHggc29saWQgdmFyKC0tbW9vbi1ncmF5KTtcbn1cblxuLnF1YWsge1xuICBib3JkZXItcmFkaXVzOiAwLjJyZW07XG4gIGJvcmRlcjogMXB4IHNvbGlkIHZhcigtLWxpZ2h0LXNpbHZlcik7XG4gIG92ZXJmbG93LXk6IGF1dG87XG59XG5cbnRhYmxlIHtcbiAgYm9yZGVyLWNvbGxhcHNlOiBzZXBhcmF0ZTtcbiAgYm9yZGVyLXNwYWNpbmc6IDA7XG4gIHdoaXRlLXNwYWNlOiBub3dyYXA7XG4gIGJveC1zaXppbmc6IGJvcmRlci1ib3g7XG5cbiAgbWFyZ2luOiB2YXIoLS1zcGFjaW5nLW5vbmUpO1xuICBjb2xvcjogdmFyKC0tZGFyay1ncmF5KTtcbiAgZm9udDogMTNweCAvIDEuMiB2YXIoLS1zYW5zLXNlcmlmKTtcblxuICB3aWR0aDogMTAwJTtcbn1cblxudGhlYWQge1xuICBwb3NpdGlvbjogc3RpY2t5O1xuICB2ZXJ0aWNhbC1hbGlnbjogdG9wO1xuICB0ZXh0LWFsaWduOiBsZWZ0O1xuICB0b3A6IDA7XG59XG5cbnRkIHtcbiAgYm9yZGVyOiAxcHggc29saWQgdmFyKC0tbGlnaHQtc2lsdmVyKTtcbiAgYm9yZGVyLWJvdHRvbTogc29saWQgMXB4IHRyYW5zcGFyZW50O1xuICBib3JkZXItcmlnaHQ6IHNvbGlkIDFweCB0cmFuc3BhcmVudDtcbiAgb3ZlcmZsb3c6IGhpZGRlbjtcbiAgLW8tdGV4dC1vdmVyZmxvdzogZWxsaXBzaXM7XG4gIHRleHQtb3ZlcmZsb3c6IGVsbGlwc2lzO1xuICBwYWRkaW5nOiA0cHggNnB4O1xufVxuXG50cjpmaXJzdC1jaGlsZCB0ZCB7XG4gIGJvcmRlci10b3A6IHNvbGlkIDFweCB0cmFuc3BhcmVudDtcbn1cblxudGgge1xuICBkaXNwbGF5OiB0YWJsZS1jZWxsO1xuICB2ZXJ0aWNhbC1hbGlnbjogaW5oZXJpdDtcbiAgZm9udC13ZWlnaHQ6IGJvbGQ7XG4gIHRleHQtYWxpZ246IC1pbnRlcm5hbC1jZW50ZXI7XG4gIHVuaWNvZGUtYmlkaTogaXNvbGF0ZTtcblxuICBwb3NpdGlvbjogcmVsYXRpdmU7XG4gIGJhY2tncm91bmQ6IHZhcigtLXdoaXRlKTtcbiAgYm9yZGVyLWJvdHRvbTogc29saWQgMXB4IHZhcigtLWxpZ2h0LXNpbHZlcik7XG4gIGJvcmRlci1sZWZ0OiBzb2xpZCAxcHggdmFyKC0tbGlnaHQtc2lsdmVyKTtcbiAgcGFkZGluZzogNXB4IDZweCAwIDZweDtcbn1cblxuLm51bWJlciwgLmRhdGUge1xuICBmb250LXZhcmlhbnQtbnVtZXJpYzogdGFidWxhci1udW1zO1xufVxuXG4uZ3JheSB7XG4gIGNvbG9yOiB2YXIoLS1ncmF5KTtcbn1cblxuLm51bWJlciB7XG4gIHRleHQtYWxpZ246IHJpZ2h0O1xufVxuXG50ZDpudGgtY2hpbGQoMSksIHRoOm50aC1jaGlsZCgxKSB7XG4gIGZvbnQtdmFyaWFudC1udW1lcmljOiB0YWJ1bGFyLW51bXM7XG4gIHRleHQtYWxpZ246IGNlbnRlcjtcbiAgY29sb3I6IHZhcigtLW1vb24tZ3JheSk7XG4gIHBhZGRpbmc6IDAgNHB4O1xufVxuXG50ZDpmaXJzdC1jaGlsZCwgdGg6Zmlyc3QtY2hpbGQge1xuICBib3JkZXItbGVmdDogbm9uZTtcbn1cblxudGg6Zmlyc3QtY2hpbGQge1xuICBib3JkZXItbGVmdDogbm9uZTtcbiAgdmVydGljYWwtYWxpZ246IHRvcDtcbiAgd2lkdGg6IDIwcHg7XG4gIHBhZGRpbmc6IDdweDtcbn1cblxudGQ6bnRoLWxhc3QtY2hpbGQoMiksIHRoOm50aC1sYXN0LWNoaWxkKDIpIHtcbiAgYm9yZGVyLXJpZ2h0OiAxcHggc29saWQgdmFyKC0tbGlnaHQtc2lsdmVyKTtcbn1cblxudHI6Zmlyc3QtY2hpbGQgdGQge1xuXHRib3JkZXItdG9wOiBzb2xpZCAxcHggdHJhbnNwYXJlbnQ7XG59XG5cbi5yZXNpemUtaGFuZGxlIHtcblx0d2lkdGg6IDVweDtcblx0aGVpZ2h0OiAxMDAlO1xuXHRiYWNrZ3JvdW5kLWNvbG9yOiB0cmFuc3BhcmVudDtcblx0cG9zaXRpb246IGFic29sdXRlO1xuXHRyaWdodDogLTIuNXB4O1xuXHR0b3A6IDA7XG5cdGN1cnNvcjogZXctcmVzaXplO1xuXHR6LWluZGV4OiAxO1xufVxuXG4uc29ydC1idXR0b24ge1xuXHRjdXJzb3I6IHBvaW50ZXI7XG5cdGJhY2tncm91bmQtY29sb3I6IHZhcigtLXdoaXRlKTtcblx0dXNlci1zZWxlY3Q6IG5vbmU7XG59XG5gO1xuXG4vKipcbiAqIFJldHVybiBhIGZvcm1hdHRlciBmb3IgZWFjaCBmaWVsZCBpbiB0aGUgc2NoZW1hXG4gKi9cbmZ1bmN0aW9uIGZvcm1hdG9mKHNjaGVtYTogYXJyb3cuU2NoZW1hKSB7XG5cdGNvbnN0IGZvcm1hdDogUmVjb3JkPHN0cmluZywgKHZhbHVlOiB1bmtub3duKSA9PiBzdHJpbmc+ID0gT2JqZWN0LmNyZWF0ZShcblx0XHRudWxsLFxuXHQpO1xuXHRmb3IgKGNvbnN0IGZpZWxkIG9mIHNjaGVtYS5maWVsZHMpIHtcblx0XHRmb3JtYXRbZmllbGQubmFtZV0gPSBmb3JtYXR0ZXJGb3JEYXRhVHlwZVZhbHVlKGZpZWxkLnR5cGUpO1xuXHR9XG5cdHJldHVybiBmb3JtYXQ7XG59XG5cbi8qKlxuICogUmV0dXJuIGEgY2xhc3MgdHlwZSBvZiBlYWNoIGZpZWxkIGluIHRoZSBzY2hlbWEuXG4gKi9cbmZ1bmN0aW9uIGNsYXNzb2Yoc2NoZW1hOiBhcnJvdy5TY2hlbWEpOiBSZWNvcmQ8c3RyaW5nLCBcIm51bWJlclwiIHwgXCJkYXRlXCI+IHtcblx0Y29uc3QgY2xhc3NlczogUmVjb3JkPHN0cmluZywgXCJudW1iZXJcIiB8IFwiZGF0ZVwiPiA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdGZvciAoY29uc3QgZmllbGQgb2Ygc2NoZW1hLmZpZWxkcykge1xuXHRcdGlmIChcblx0XHRcdGFycm93LkRhdGFUeXBlLmlzSW50KGZpZWxkLnR5cGUpIHx8XG5cdFx0XHRhcnJvdy5EYXRhVHlwZS5pc0Zsb2F0KGZpZWxkLnR5cGUpXG5cdFx0KSB7XG5cdFx0XHRjbGFzc2VzW2ZpZWxkLm5hbWVdID0gXCJudW1iZXJcIjtcblx0XHR9XG5cdFx0aWYgKFxuXHRcdFx0YXJyb3cuRGF0YVR5cGUuaXNEYXRlKGZpZWxkLnR5cGUpIHx8XG5cdFx0XHRhcnJvdy5EYXRhVHlwZS5pc1RpbWVzdGFtcChmaWVsZC50eXBlKVxuXHRcdCkge1xuXHRcdFx0Y2xhc3Nlc1tmaWVsZC5uYW1lXSA9IFwiZGF0ZVwiO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gY2xhc3Nlcztcbn1cblxuZnVuY3Rpb24gaGlnaGxpZ2h0KGNlbGw6IEhUTUxUYWJsZUNlbGxFbGVtZW50LCByb3c6IEhUTUxUYWJsZVJvd0VsZW1lbnQpIHtcblx0aWYgKHJvdy5maXJzdENoaWxkICE9PSBjZWxsICYmIGNlbGwgIT09IHJvdy5sYXN0RWxlbWVudENoaWxkKSB7XG5cdFx0Y2VsbC5zdHlsZS5ib3JkZXIgPSBcIjFweCBzb2xpZCB2YXIoLS1tb29uLWdyYXkpXCI7XG5cdH1cblx0cm93LnN0eWxlLmJhY2tncm91bmRDb2xvciA9IFwidmFyKC0tbGlnaHQtc2lsdmVyKVwiO1xufVxuXG5mdW5jdGlvbiByZW1vdmVIaWdobGlnaHQoY2VsbDogSFRNTFRhYmxlQ2VsbEVsZW1lbnQsIHJvdzogSFRNTFRhYmxlUm93RWxlbWVudCkge1xuXHRjZWxsLnN0eWxlLnJlbW92ZVByb3BlcnR5KFwiYm9yZGVyXCIpO1xuXHRyb3cuc3R5bGUucmVtb3ZlUHJvcGVydHkoXCJiYWNrZ3JvdW5kLWNvbG9yXCIpO1xufVxuXG5mdW5jdGlvbiBpc1RhYmxlQ2VsbEVsZW1lbnQobm9kZTogdW5rbm93bik6IG5vZGUgaXMgSFRNTFRhYmxlRGF0YUNlbGxFbGVtZW50IHtcblx0Ly8gQHRzLWV4cGVjdC1lcnJvciAtIHRhZ05hbWUgaXMgbm90IGRlZmluZWQgb24gdW5rbm93blxuXHRyZXR1cm4gbm9kZT8udGFnTmFtZSA9PT0gXCJURFwiO1xufVxuXG5mdW5jdGlvbiBpc1RhYmxlUm93RWxlbWVudChub2RlOiB1bmtub3duKTogbm9kZSBpcyBIVE1MVGFibGVSb3dFbGVtZW50IHtcblx0cmV0dXJuIG5vZGUgaW5zdGFuY2VvZiBIVE1MVGFibGVSb3dFbGVtZW50O1xufVxuXG4vKiogQHBhcmFtIHtzdHJpbmd9IHZhbHVlICovXG5mdW5jdGlvbiBzaG91bGRHcmF5b3V0VmFsdWUodmFsdWU6IHN0cmluZykge1xuXHRyZXR1cm4gKFxuXHRcdHZhbHVlID09PSBcIm51bGxcIiB8fFxuXHRcdHZhbHVlID09PSBcInVuZGVmaW5lZFwiIHx8XG5cdFx0dmFsdWUgPT09IFwiTmFOXCIgfHxcblx0XHR2YWx1ZSA9PT0gXCJUT0RPXCJcblx0KTtcbn1cblxuLyoqXG4gKiBBIG1vc2FpYyBTUUwgZXhwcmVzc2lvbiBmb3IgYXNjZW5kaW5nIG9yZGVyXG4gKlxuICogVGhlIG5vcm1hbCBiZWhhdmlvciBpbiBTUUwgaXMgdG8gc29ydCBudWxscyBmaXJzdCB3aGVuIHNvcnRpbmcgaW4gYXNjZW5kaW5nIG9yZGVyLlxuICogVGhpcyBmdW5jdGlvbiByZXR1cm5zIGFuIGV4cHJlc3Npb24gdGhhdCBzb3J0cyBudWxscyBsYXN0IChpLmUuLCBgTlVMTFMgTEFTVGApLFxuICogbGlrZSB0aGUgYG1zcWwuZGVzY2AgZnVuY3Rpb24uXG4gKlxuICogQHBhcmFtIGZpZWxkXG4gKi9cbmZ1bmN0aW9uIGFzYyhmaWVsZDogc3RyaW5nKTogbXNxbC5FeHByIHtcblx0Ly8gZG9lc24ndCBzb3J0IG51bGxzIGZvciBhc2Ncblx0bGV0IGV4cHIgPSBtc3FsLmRlc2MoZmllbGQpO1xuXHRleHByLl9leHByWzBdID0gZXhwci5fZXhwclswXS5yZXBsYWNlKFwiREVTQ1wiLCBcIkFTQ1wiKTtcblx0cmV0dXJuIGV4cHI7XG59XG4iLCAiaW1wb3J0IHsgVGVtcG9yYWwgfSBmcm9tIFwiQGpzLXRlbXBvcmFsL3BvbHlmaWxsXCI7XG5pbXBvcnQgKiBhcyBhcnJvdyBmcm9tIFwiYXBhY2hlLWFycm93XCI7XG5cbi8qKlxuICogQSB1dGlsaXR5IGZ1bmN0aW9uIHRvIGNyZWF0ZSBhIGZvcm1hdHRlciBmb3IgYSBnaXZlbiBkYXRhIHR5cGUuXG4gKlxuICogVGhlIGRhdGF0eXBlIGlzIG9ubHkgdXNlZCBmb3IgdHlwZSBpbmZlcmVuY2UgdG8gZW5zdXJlIHRoYXQgdGhlIGZvcm1hdHRlciBpc1xuICogY29ycmVjdGx5IHR5cGVkLlxuICovXG5mdW5jdGlvbiBmbXQ8VFZhbHVlPihcblx0X2Fycm93RGF0YVR5cGVWYWx1ZTogVFZhbHVlLFxuXHRmb3JtYXQ6ICh2YWx1ZTogVFZhbHVlKSA9PiBzdHJpbmcsXG5cdGxvZyA9IGZhbHNlLFxuKTogKHZhbHVlOiBUVmFsdWUgfCBudWxsIHwgdW5kZWZpbmVkKSA9PiBzdHJpbmcge1xuXHRyZXR1cm4gKHZhbHVlKSA9PiB7XG5cdFx0aWYgKGxvZykgY29uc29sZS5sb2codmFsdWUpO1xuXHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gc3RyaW5naWZ5KHZhbHVlKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZvcm1hdCh2YWx1ZSk7XG5cdH07XG59XG5cbmZ1bmN0aW9uIHN0cmluZ2lmeSh4OiB1bmtub3duKTogc3RyaW5nIHtcblx0cmV0dXJuIGAke3h9YDtcbn1cblxuLyoqIEBwYXJhbSB7YXJyb3cuRGF0YVR5cGV9IHR5cGUgKi9cbmV4cG9ydCBmdW5jdGlvbiBmb3JtYXREYXRhVHlwZU5hbWUodHlwZTogYXJyb3cuRGF0YVR5cGUpIHtcblx0Ly8gc3BlY2lhbCBjYXNlIHNvbWUgdHlwZXNcblx0aWYgKGFycm93LkRhdGFUeXBlLmlzTGFyZ2VCaW5hcnkodHlwZSkpIHJldHVybiBcImxhcmdlIGJpbmFyeVwiO1xuXHRpZiAoYXJyb3cuRGF0YVR5cGUuaXNMYXJnZVV0ZjgodHlwZSkpIHJldHVybiBcImxhcmdlIHV0ZjhcIjtcblx0Ly8gb3RoZXJ3aXNlLCBqdXN0IHN0cmluZ2lmeSBhbmQgbG93ZXJjYXNlXG5cdHJldHVybiB0eXBlXG5cdFx0LnRvU3RyaW5nKClcblx0XHQudG9Mb3dlckNhc2UoKVxuXHRcdC5yZXBsYWNlKFwiPHNlY29uZD5cIiwgXCJbc11cIilcblx0XHQucmVwbGFjZShcIjxtaWxsaXNlY29uZD5cIiwgXCJbbXNdXCIpXG5cdFx0LnJlcGxhY2UoXCI8bWljcm9zZWNvbmQ+XCIsIFwiW1x1MDBCNXNdXCIpXG5cdFx0LnJlcGxhY2UoXCI8bmFub3NlY29uZD5cIiwgXCJbbnNdXCIpXG5cdFx0LnJlcGxhY2UoXCI8ZGF5PlwiLCBcIltkYXldXCIpXG5cdFx0LnJlcGxhY2UoXCJkaWN0aW9uYXJ5PFwiLCBcImRpY3Q8XCIpO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7YXJyb3cuRGF0YVR5cGV9IHR5cGVcbiAqIEByZXR1cm5zIHsodmFsdWU6IGFueSkgPT4gc3RyaW5nfVxuICovXG5leHBvcnQgZnVuY3Rpb24gZm9ybWF0dGVyRm9yRGF0YVR5cGVWYWx1ZShcblx0dHlwZTogYXJyb3cuRGF0YVR5cGUsXG4pOiAodmFsdWU6IGFueSkgPT4gc3RyaW5nIHtcblx0aWYgKGFycm93LkRhdGFUeXBlLmlzTnVsbCh0eXBlKSkge1xuXHRcdHJldHVybiBmbXQodHlwZS5UVmFsdWUsIHN0cmluZ2lmeSk7XG5cdH1cblxuXHRpZiAoXG5cdFx0YXJyb3cuRGF0YVR5cGUuaXNJbnQodHlwZSkgfHxcblx0XHRhcnJvdy5EYXRhVHlwZS5pc0Zsb2F0KHR5cGUpXG5cdCkge1xuXHRcdHJldHVybiBmbXQodHlwZS5UVmFsdWUsICh2YWx1ZSkgPT4ge1xuXHRcdFx0aWYgKE51bWJlci5pc05hTih2YWx1ZSkpIHJldHVybiBcIk5hTlwiO1xuXHRcdFx0cmV0dXJuIHZhbHVlID09PSAwID8gXCIwXCIgOiB2YWx1ZS50b0xvY2FsZVN0cmluZyhcImVuXCIpOyAvLyBoYW5kbGUgbmVnYXRpdmUgemVyb1xuXHRcdH0pO1xuXHR9XG5cblx0aWYgKFxuXHRcdGFycm93LkRhdGFUeXBlLmlzQmluYXJ5KHR5cGUpIHx8XG5cdFx0YXJyb3cuRGF0YVR5cGUuaXNGaXhlZFNpemVCaW5hcnkodHlwZSkgfHxcblx0XHRhcnJvdy5EYXRhVHlwZS5pc0xhcmdlQmluYXJ5KHR5cGUpXG5cdCkge1xuXHRcdHJldHVybiBmbXQodHlwZS5UVmFsdWUsIChieXRlcykgPT4ge1xuXHRcdFx0bGV0IG1heGxlbiA9IDMyO1xuXHRcdFx0bGV0IHJlc3VsdCA9IFwiYidcIjtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgTWF0aC5taW4oYnl0ZXMubGVuZ3RoLCBtYXhsZW4pOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgYnl0ZSA9IGJ5dGVzW2ldO1xuXHRcdFx0XHRpZiAoYnl0ZSA+PSAzMiAmJiBieXRlIDw9IDEyNikge1xuXHRcdFx0XHRcdC8vIEFTQ0lJIHByaW50YWJsZSBjaGFyYWN0ZXJzIHJhbmdlIGZyb20gMzIgKHNwYWNlKSB0byAxMjYgKH4pXG5cdFx0XHRcdFx0cmVzdWx0ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnl0ZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzdWx0ICs9IFwiXFxcXHhcIiArIChcIjAwXCIgKyBieXRlLnRvU3RyaW5nKDE2KSkuc2xpY2UoLTIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoYnl0ZXMubGVuZ3RoID4gbWF4bGVuKSByZXN1bHQgKz0gXCIuLi5cIjtcblx0XHRcdHJlc3VsdCArPSBcIidcIjtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSk7XG5cdH1cblxuXHRpZiAoYXJyb3cuRGF0YVR5cGUuaXNVdGY4KHR5cGUpIHx8IGFycm93LkRhdGFUeXBlLmlzTGFyZ2VVdGY4KHR5cGUpKSB7XG5cdFx0cmV0dXJuIGZtdCh0eXBlLlRWYWx1ZSwgKHRleHQpID0+IHRleHQpO1xuXHR9XG5cblx0aWYgKGFycm93LkRhdGFUeXBlLmlzQm9vbCh0eXBlKSkge1xuXHRcdHJldHVybiBmbXQodHlwZS5UVmFsdWUsIHN0cmluZ2lmeSk7XG5cdH1cblxuXHRpZiAoYXJyb3cuRGF0YVR5cGUuaXNEZWNpbWFsKHR5cGUpKSB7XG5cdFx0cmV0dXJuIGZtdCh0eXBlLlRWYWx1ZSwgKCkgPT4gXCJUT0RPXCIpO1xuXHR9XG5cblx0aWYgKGFycm93LkRhdGFUeXBlLmlzRGF0ZSh0eXBlKSkge1xuXHRcdHJldHVybiBmbXQodHlwZS5UVmFsdWUsIChtcykgPT4ge1xuXHRcdFx0Ly8gQWx3YXlzIHJldHVybnMgdmFsdWUgaW4gbWlsbGlzZWNvbmRzXG5cdFx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vYXBhY2hlL2Fycm93L2Jsb2IvODlkNjM1NDA2OGMxMWE2NmZjZWMyZjM0ZDA0MTRkYWNhMzI3ZTJlMC9qcy9zcmMvdmlzaXRvci9nZXQudHMjTDE2Ny1MMTcxXG5cdFx0XHRyZXR1cm4gVGVtcG9yYWwuSW5zdGFudFxuXHRcdFx0XHQuZnJvbUVwb2NoTWlsbGlzZWNvbmRzKG1zKVxuXHRcdFx0XHQudG9ab25lZERhdGVUaW1lSVNPKFwiVVRDXCIpXG5cdFx0XHRcdC50b1BsYWluRGF0ZSgpXG5cdFx0XHRcdC50b1N0cmluZygpO1xuXHRcdH0pO1xuXHR9XG5cblx0aWYgKGFycm93LkRhdGFUeXBlLmlzVGltZSh0eXBlKSkge1xuXHRcdHJldHVybiBmbXQodHlwZS5UVmFsdWUsIChtcykgPT4ge1xuXHRcdFx0cmV0dXJuIGluc3RhbnRGcm9tVGltZVVuaXQobXMsIHR5cGUudW5pdClcblx0XHRcdFx0LnRvWm9uZWREYXRlVGltZUlTTyhcIlVUQ1wiKVxuXHRcdFx0XHQudG9QbGFpblRpbWUoKVxuXHRcdFx0XHQudG9TdHJpbmcoKTtcblx0XHR9KTtcblx0fVxuXG5cdGlmIChhcnJvdy5EYXRhVHlwZS5pc1RpbWVzdGFtcCh0eXBlKSkge1xuXHRcdHJldHVybiBmbXQodHlwZS5UVmFsdWUsIChtcykgPT4ge1xuXHRcdFx0Ly8gQWx3YXlzIHJldHVybnMgdmFsdWUgaW4gbWlsbGlzZWNvbmRzXG5cdFx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vYXBhY2hlL2Fycm93L2Jsb2IvODlkNjM1NDA2OGMxMWE2NmZjZWMyZjM0ZDA0MTRkYWNhMzI3ZTJlMC9qcy9zcmMvdmlzaXRvci9nZXQudHMjTDE3My1MMTkwXG5cdFx0XHRyZXR1cm4gVGVtcG9yYWwuSW5zdGFudFxuXHRcdFx0XHQuZnJvbUVwb2NoTWlsbGlzZWNvbmRzKG1zKVxuXHRcdFx0XHQudG9ab25lZERhdGVUaW1lSVNPKFwiVVRDXCIpXG5cdFx0XHRcdC50b1BsYWluRGF0ZVRpbWUoKVxuXHRcdFx0XHQudG9TdHJpbmcoKTtcblx0XHR9KTtcblx0fVxuXG5cdGlmIChhcnJvdy5EYXRhVHlwZS5pc0ludGVydmFsKHR5cGUpKSB7XG5cdFx0cmV0dXJuIGZtdCh0eXBlLlRWYWx1ZSwgKF92YWx1ZSkgPT4ge1xuXHRcdFx0cmV0dXJuIFwiVE9ET1wiO1xuXHRcdH0pO1xuXHR9XG5cblx0aWYgKGFycm93LkRhdGFUeXBlLmlzRHVyYXRpb24odHlwZSkpIHtcblx0XHRyZXR1cm4gZm10KHR5cGUuVFZhbHVlLCAoYmlnaW50VmFsdWUpID0+IHtcblx0XHRcdC8vIGh0dHBzOi8vdGMzOS5lcy9wcm9wb3NhbC10ZW1wb3JhbC9kb2NzL2R1cmF0aW9uLmh0bWwjdG9TdHJpbmdcblx0XHRcdHJldHVybiBkdXJhdGlvbkZyb21UaW1lVW5pdChiaWdpbnRWYWx1ZSwgdHlwZS51bml0KS50b1N0cmluZygpO1xuXHRcdH0pO1xuXHR9XG5cblx0aWYgKGFycm93LkRhdGFUeXBlLmlzTGlzdCh0eXBlKSkge1xuXHRcdHJldHVybiBmbXQodHlwZS5UVmFsdWUsICh2YWx1ZSkgPT4ge1xuXHRcdFx0Ly8gVE9ETzogU29tZSByZWN1cnNpdmUgZm9ybWF0dGluZz9cblx0XHRcdHJldHVybiB2YWx1ZS50b1N0cmluZygpO1xuXHRcdH0pO1xuXHR9XG5cblx0aWYgKGFycm93LkRhdGFUeXBlLmlzU3RydWN0KHR5cGUpKSB7XG5cdFx0cmV0dXJuIGZtdCh0eXBlLlRWYWx1ZSwgKHZhbHVlKSA9PiB7XG5cdFx0XHQvLyBUT0RPOiBTb21lIHJlY3Vyc2l2ZSBmb3JtYXR0aW5nP1xuXHRcdFx0cmV0dXJuIHZhbHVlLnRvU3RyaW5nKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRpZiAoYXJyb3cuRGF0YVR5cGUuaXNVbmlvbih0eXBlKSkge1xuXHRcdHJldHVybiBmbXQodHlwZS5UVmFsdWUsIChfdmFsdWUpID0+IHtcblx0XHRcdHJldHVybiBcIlRPRE9cIjtcblx0XHR9KTtcblx0fVxuXHRpZiAoYXJyb3cuRGF0YVR5cGUuaXNNYXAodHlwZSkpIHtcblx0XHRyZXR1cm4gZm10KHR5cGUuVFZhbHVlLCAoX3ZhbHVlKSA9PiB7XG5cdFx0XHRyZXR1cm4gXCJUT0RPXCI7XG5cdFx0fSk7XG5cdH1cblxuXHRpZiAoYXJyb3cuRGF0YVR5cGUuaXNEaWN0aW9uYXJ5KHR5cGUpKSB7XG5cdFx0bGV0IGZvcm1hdHRlciA9IGZvcm1hdHRlckZvckRhdGFUeXBlVmFsdWUodHlwZS5kaWN0aW9uYXJ5KTtcblx0XHRyZXR1cm4gZm10KHR5cGUuVFZhbHVlLCBmb3JtYXR0ZXIpO1xuXHR9XG5cblx0cmV0dXJuICgpID0+IGBVbnN1cHBvcnRlZCB0eXBlOiAke3R5cGV9YDtcbn1cblxuLyoqXG4gKiBAcGFyYW0ge251bWJlciB8IGJpZ2ludH0gdmFsdWVcbiAqIEBwYXJhbSB7YXJyb3cuVGltZVVuaXR9IHVuaXRcbiAqL1xuZnVuY3Rpb24gaW5zdGFudEZyb21UaW1lVW5pdCh2YWx1ZTogbnVtYmVyIHwgYmlnaW50LCB1bml0OiBhcnJvdy5UaW1lVW5pdCkge1xuXHRpZiAodW5pdCA9PT0gYXJyb3cuVGltZVVuaXQuU0VDT05EKSB7XG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJiaWdpbnRcIikgdmFsdWUgPSBOdW1iZXIodmFsdWUpO1xuXHRcdHJldHVybiBUZW1wb3JhbC5JbnN0YW50LmZyb21FcG9jaFNlY29uZHModmFsdWUpO1xuXHR9XG5cdGlmICh1bml0ID09PSBhcnJvdy5UaW1lVW5pdC5NSUxMSVNFQ09ORCkge1xuXHRcdGlmICh0eXBlb2YgdmFsdWUgPT09IFwiYmlnaW50XCIpIHZhbHVlID0gTnVtYmVyKHZhbHVlKTtcblx0XHRyZXR1cm4gVGVtcG9yYWwuSW5zdGFudC5mcm9tRXBvY2hNaWxsaXNlY29uZHModmFsdWUpO1xuXHR9XG5cdGlmICh1bml0ID09PSBhcnJvdy5UaW1lVW5pdC5NSUNST1NFQ09ORCkge1xuXHRcdGlmICh0eXBlb2YgdmFsdWUgPT09IFwibnVtYmVyXCIpIHZhbHVlID0gQmlnSW50KHZhbHVlKTtcblx0XHRyZXR1cm4gVGVtcG9yYWwuSW5zdGFudC5mcm9tRXBvY2hNaWNyb3NlY29uZHModmFsdWUpO1xuXHR9XG5cdGlmICh1bml0ID09PSBhcnJvdy5UaW1lVW5pdC5OQU5PU0VDT05EKSB7XG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJudW1iZXJcIikgdmFsdWUgPSBCaWdJbnQodmFsdWUpO1xuXHRcdHJldHVybiBUZW1wb3JhbC5JbnN0YW50LmZyb21FcG9jaE5hbm9zZWNvbmRzKHZhbHVlKTtcblx0fVxuXHR0aHJvdyBuZXcgRXJyb3IoXCJJbnZhbGlkIFRpbWVVbml0XCIpO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7bnVtYmVyIHwgYmlnaW50fSB2YWx1ZVxuICogQHBhcmFtIHthcnJvdy5UaW1lVW5pdH0gdW5pdFxuICovXG5mdW5jdGlvbiBkdXJhdGlvbkZyb21UaW1lVW5pdCh2YWx1ZTogbnVtYmVyIHwgYmlnaW50LCB1bml0OiBhcnJvdy5UaW1lVW5pdCkge1xuXHQvLyBUT0RPOiBUZW1wb3JhbC5EdXJhdGlvbiBwb2x5ZmlsbCBvbmx5IHN1cHBvcnRzIG51bWJlciBub3QgYmlnaW50XG5cdHZhbHVlID0gTnVtYmVyKHZhbHVlKTtcblx0aWYgKHVuaXQgPT09IGFycm93LlRpbWVVbml0LlNFQ09ORCkge1xuXHRcdHJldHVybiBUZW1wb3JhbC5EdXJhdGlvbi5mcm9tKHsgc2Vjb25kczogdmFsdWUgfSk7XG5cdH1cblx0aWYgKHVuaXQgPT09IGFycm93LlRpbWVVbml0Lk1JTExJU0VDT05EKSB7XG5cdFx0cmV0dXJuIFRlbXBvcmFsLkR1cmF0aW9uLmZyb20oeyBtaWxsaXNlY29uZHM6IHZhbHVlIH0pO1xuXHR9XG5cdGlmICh1bml0ID09PSBhcnJvdy5UaW1lVW5pdC5NSUNST1NFQ09ORCkge1xuXHRcdHJldHVybiBUZW1wb3JhbC5EdXJhdGlvbi5mcm9tKHsgbWljcm9zZWNvbmRzOiB2YWx1ZSB9KTtcblx0fVxuXHRpZiAodW5pdCA9PT0gYXJyb3cuVGltZVVuaXQuTkFOT1NFQ09ORCkge1xuXHRcdHJldHVybiBUZW1wb3JhbC5EdXJhdGlvbi5mcm9tKHsgbmFub3NlY29uZHM6IHZhbHVlIH0pO1xuXHR9XG5cdHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgVGltZVVuaXRcIik7XG59XG4iLCAiLyoqXG4gKiBFcnJvciB0aHJvd24gd2hlbiBhbiBhc3NlcnRpb24gZmFpbHMuXG4gKi9cbmV4cG9ydCBjbGFzcyBBc3NlcnRpb25FcnJvciBleHRlbmRzIEVycm9yIHtcblx0LyoqIEBwYXJhbSBtZXNzYWdlIFRoZSBlcnJvciBtZXNzYWdlLiAqL1xuXHRjb25zdHJ1Y3RvcihtZXNzYWdlOiBzdHJpbmcpIHtcblx0XHRzdXBlcihtZXNzYWdlKTtcblx0XHR0aGlzLm5hbWUgPSBcIkFzc2VydGlvbkVycm9yXCI7XG5cdH1cbn1cblxuLyoqXG4gKiBNYWtlIGFuIGFzc2VydGlvbi4gQW4gZXJyb3IgaXMgdGhyb3duIGlmIGBleHByYCBkb2VzIG5vdCBoYXZlIHRydXRoeSB2YWx1ZS5cbiAqXG4gKiBAcGFyYW0gZXhwciBUaGUgZXhwcmVzc2lvbiB0byB0ZXN0LlxuICogQHBhcmFtIG1zZyBUaGUgbWVzc2FnZSB0byBkaXNwbGF5IGlmIHRoZSBhc3NlcnRpb24gZmFpbHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhc3NlcnQoZXhwcjogdW5rbm93biwgbXNnID0gXCJcIik6IGFzc2VydHMgZXhwciB7XG5cdGlmICghZXhwcikge1xuXHRcdHRocm93IG5ldyBBc3NlcnRpb25FcnJvcihtc2cpO1xuXHR9XG59XG4iLCAiaW1wb3J0IHsgYXNzZXJ0IH0gZnJvbSBcIi4vYXNzZXJ0LnRzXCI7XG5cbmV4cG9ydCBjbGFzcyBBc3luY0JhdGNoUmVhZGVyPFQ+IHtcblx0LyoqIHRoZSBpdGVyYWJsZSBiYXRjaGVzIHRvIHJlYWQgKi9cblx0I2JhdGNoZXM6IEFycmF5PHsgZGF0YTogSXRlcmF0b3I8VD47IGxhc3Q6IGJvb2xlYW4gfT4gPSBbXTtcblx0LyoqIHRoZSBpbmRleCBvZiB0aGUgY3VycmVudCByb3cgKi9cblx0I2luZGV4OiBudW1iZXIgPSAwO1xuXHQvKiogcmVzb2x2ZXMgYSBwcm9taXNlIGZvciB3aGVuIHRoZSBuZXh0IGJhdGNoIGlzIGF2YWlsYWJsZSAqL1xuXHQjcmVzb2x2ZTogKCgpID0+IHZvaWQpIHwgbnVsbCA9IG51bGw7XG5cdC8qKiB0aGUgY3VycmVudCBiYXRjaCAqL1xuXHQjY3VycmVudDogeyBkYXRhOiBJdGVyYXRvcjxUPjsgbGFzdDogYm9vbGVhbiB9IHwgbnVsbCA9IG51bGw7XG5cdC8qKiBBIGZ1bmN0aW9uIHRvIHJlcXVlc3QgbW9yZSBkYXRhLiAqL1xuXHQjcmVxdWVzdE5leHRCYXRjaDogKCkgPT4gdm9pZDtcblx0LyoqXG5cdCAqIEBwYXJhbSByZXF1ZXN0TmV4dEJhdGNoIC0gYSBmdW5jdGlvbiB0byByZXF1ZXN0IG1vcmUgZGF0YS4gV2hlblxuXHQgKiB0aGlzIGZ1bmN0aW9uIGNvbXBsZXRlcywgaXQgc2hvdWxkIGVucXVldWUgdGhlIG5leHQgYmF0Y2gsIG90aGVyd2lzZSB0aGVcblx0ICogcmVhZGVyIHdpbGwgYmUgc3R1Y2suXG5cdCAqL1xuXHRjb25zdHJ1Y3RvcihyZXF1ZXN0TmV4dEJhdGNoOiAoKSA9PiB2b2lkKSB7XG5cdFx0dGhpcy4jcmVxdWVzdE5leHRCYXRjaCA9IHJlcXVlc3ROZXh0QmF0Y2g7XG5cdH1cblx0LyoqXG5cdCAqIEVucXVldWUgYSBiYXRjaCBvZiBkYXRhXG5cdCAqXG5cdCAqIFRoZSBsYXN0IGJhdGNoIHNob3VsZCBoYXZlIGBsYXN0OiB0cnVlYCBzZXQsXG5cdCAqIHNvIHRoZSByZWFkZXIgY2FuIHRlcm1pbmF0ZSB3aGVuIGl0IGhhc1xuXHQgKiBleGhhdXN0ZWQgYWxsIHRoZSBkYXRhLlxuXHQgKlxuXHQgKiBAcGFyYW0gYmF0Y2ggLSB0aGUgYmF0Y2ggb2YgZGF0YSB0byBlbnF1ZXVlXG5cdCAqIEBwYXJhbSBvcHRpb25zXG5cdCAqIEBwYXJhbSBvcHRpb25zLmxhc3QgLSB3aGV0aGVyIHRoaXMgaXMgdGhlIGxhc3QgYmF0Y2hcblx0ICovXG5cdGVucXVldWVCYXRjaChiYXRjaDogSXRlcmF0b3I8VD4sIHsgbGFzdCB9OiB7IGxhc3Q6IGJvb2xlYW4gfSkge1xuXHRcdHRoaXMuI2JhdGNoZXMucHVzaCh7IGRhdGE6IGJhdGNoLCBsYXN0IH0pO1xuXHRcdGlmICh0aGlzLiNyZXNvbHZlKSB7XG5cdFx0XHR0aGlzLiNyZXNvbHZlKCk7XG5cdFx0XHR0aGlzLiNyZXNvbHZlID0gbnVsbDtcblx0XHR9XG5cdH1cblx0YXN5bmMgbmV4dCgpOiBQcm9taXNlPEl0ZXJhdG9yUmVzdWx0PHsgcm93OiBUOyBpbmRleDogbnVtYmVyIH0+PiB7XG5cdFx0aWYgKCF0aGlzLiNjdXJyZW50KSB7XG5cdFx0XHRpZiAodGhpcy4jYmF0Y2hlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0LyoqIEB0eXBlIHtQcm9taXNlPHZvaWQ+fSAqL1xuXHRcdFx0XHRsZXQgcHJvbWlzZTogUHJvbWlzZTx2b2lkPiA9IG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy4jcmVzb2x2ZSA9IHJlc29sdmU7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0aGlzLiNyZXF1ZXN0TmV4dEJhdGNoKCk7XG5cdFx0XHRcdGF3YWl0IHByb21pc2U7XG5cdFx0XHR9XG5cdFx0XHRsZXQgbmV4dCA9IHRoaXMuI2JhdGNoZXMuc2hpZnQoKTtcblx0XHRcdGFzc2VydChuZXh0LCBcIk5vIG5leHQgYmF0Y2hcIik7XG5cdFx0XHR0aGlzLiNjdXJyZW50ID0gbmV4dDtcblx0XHR9XG5cdFx0bGV0IHJlc3VsdCA9IHRoaXMuI2N1cnJlbnQuZGF0YS5uZXh0KCk7XG5cdFx0aWYgKHJlc3VsdC5kb25lKSB7XG5cdFx0XHRpZiAodGhpcy4jY3VycmVudC5sYXN0KSB7XG5cdFx0XHRcdHJldHVybiB7IGRvbmU6IHRydWUsIHZhbHVlOiB1bmRlZmluZWQgfTtcblx0XHRcdH1cblx0XHRcdHRoaXMuI2N1cnJlbnQgPSBudWxsO1xuXHRcdFx0cmV0dXJuIHRoaXMubmV4dCgpO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZG9uZTogZmFsc2UsXG5cdFx0XHR2YWx1ZTogeyByb3c6IHJlc3VsdC52YWx1ZSwgaW5kZXg6IHRoaXMuI2luZGV4KysgfSxcblx0XHR9O1xuXHR9XG59XG4iLCAiaW1wb3J0ICogYXMgbWMgZnJvbSBcIkB1d2RhdGEvbW9zYWljLWNvcmVcIjtcbmltcG9ydCAqIGFzIG1zcWwgZnJvbSBcIkB1d2RhdGEvbW9zYWljLXNxbFwiO1xuaW1wb3J0ICogYXMgbXBsb3QgZnJvbSBcIkB1d2RhdGEvbW9zYWljLXBsb3RcIjtcblxuaW1wb3J0IHR5cGUgeyBDaGFubmVsLCBNYXJrIH0gZnJvbSBcIi4uL3R5cGVzLnRzXCI7XG5cbi8qKiBBbiBvcHRpb25zIGJhZyBmb3IgdGhlIEhpc3RvZ3JhbSBNb3NpYWMgY2xpZW50LiAqL1xuaW50ZXJmYWNlIEhpc3RvZ3JhbU9wdGlvbnMge1xuXHQvKiogVGhlIHRhYmxlIHRvIHF1ZXJ5LiAqL1xuXHR0YWJsZTogc3RyaW5nO1xuXHQvKiogVGhlIGNvbHVtbiB0byB1c2UgZm9yIHRoZSBoaXN0b2dyYW0uICovXG5cdGNvbHVtbjogc3RyaW5nO1xuXHQvKiogVGhlIHR5cGUgb2YgdGhlIGNvbHVtbi4gTXVzdCBiZSBcIm51bWJlclwiIG9yIFwiZGF0ZVwiLiAqL1xuXHR0eXBlOiBcIm51bWJlclwiIHwgXCJkYXRlXCI7XG5cdC8qKiBBIG1vc2FpYyBzZWxlY3Rpb24gdG8gZmlsdGVyIHRoZSBkYXRhLiAqL1xuXHRmaWx0ZXJCeT86IG1jLlNlbGVjdGlvbjtcbn1cblxuLyoqIFJlcHJlc2VudHMgYSBDcm9zcy1maWx0ZXJlZCBIaXN0b2dyYW0gKi9cbmV4cG9ydCBjbGFzcyBIaXN0b2dyYW0gZXh0ZW5kcyBtYy5Nb3NhaWNDbGllbnQgaW1wbGVtZW50cyBNYXJrIHtcblx0dHlwZSA9IFwicmVjdFlcIjtcblx0LyoqIEB0eXBlIHt7IHRhYmxlOiBzdHJpbmcsIGNvbHVtbjogc3RyaW5nLCB0eXBlOiBcIm51bWJlclwiIHwgXCJkYXRlXCIgfX0gKi9cblx0I3NvdXJjZTogeyB0YWJsZTogc3RyaW5nOyBjb2x1bW46IHN0cmluZzsgdHlwZTogXCJudW1iZXJcIiB8IFwiZGF0ZVwiIH07XG5cdC8qKiBAdHlwZSB7SFRNTEVsZW1lbnR9ICovXG5cdCNlbDogSFRNTEVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuXHQvKiogQHR5cGUge0FycmF5PENoYW5uZWw+fSAqL1xuXHQjY2hhbm5lbHM6IEFycmF5PENoYW5uZWw+ID0gW107XG5cdC8qKiBAdHlwZSB7U2V0PHVua25vd24+fSAqL1xuXHQjbWFya1NldDogU2V0PHVua25vd24+ID0gbmV3IFNldCgpO1xuXHQvKiogQHR5cGUge21wbG90LkludGVydmFsMUQgfCB1bmRlZmluZWR9ICovXG5cdCNpbnRlcnZhbDogbXBsb3QuSW50ZXJ2YWwxRCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0LyoqIEB0eXBlIHtib29sZWFufSAqL1xuXHQjaW5pdGlhbGl6ZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3RvcihvcHRpb25zOiBIaXN0b2dyYW1PcHRpb25zKSB7XG5cdFx0c3VwZXIob3B0aW9ucy5maWx0ZXJCeSk7XG5cdFx0dGhpcy4jc291cmNlID0gb3B0aW9ucztcblx0XHRsZXQgcHJvY2VzcyA9IChjaGFubmVsOiBzdHJpbmcsIGVudHJ5OiB1bmtub3duKSA9PiB7XG5cdFx0XHRpZiAoaXNUcmFuc2Zvcm0oZW50cnkpKSB7XG5cdFx0XHRcdGxldCBlbmMgPSBlbnRyeSh0aGlzLCBjaGFubmVsKTtcblx0XHRcdFx0Zm9yIChsZXQga2V5IGluIGVuYykge1xuXHRcdFx0XHRcdHByb2Nlc3Moa2V5LCBlbmNba2V5XSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoaXNGaWVsZE9iamVjdChjaGFubmVsLCBlbnRyeSkpIHtcblx0XHRcdFx0dGhpcy4jY2hhbm5lbHMucHVzaChmaWVsZEVudHJ5KGNoYW5uZWwsIGVudHJ5KSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgZW5jb2RpbmcgZm9yIGNoYW5uZWwgJHtjaGFubmVsfWApO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0bGV0IGVuY29kaW5ncyA9IHtcblx0XHRcdHg6IG1wbG90LmJpbihvcHRpb25zLmNvbHVtbiksXG5cdFx0XHR5OiBtc3FsLmNvdW50KCksXG5cdFx0fTtcblx0XHRmb3IgKGxldCBbY2hhbm5lbCwgZW50cnldIG9mIE9iamVjdC5lbnRyaWVzKGVuY29kaW5ncykpIHtcblx0XHRcdHByb2Nlc3MoY2hhbm5lbCwgZW50cnkpO1xuXHRcdH1cblx0XHRpZiAob3B0aW9ucy5maWx0ZXJCeSkge1xuXHRcdFx0dGhpcy4jaW50ZXJ2YWwgPSBuZXcgbXBsb3QuSW50ZXJ2YWwxRCh0aGlzLCB7XG5cdFx0XHRcdGNoYW5uZWw6IFwieFwiLFxuXHRcdFx0XHRzZWxlY3Rpb246IHRoaXMuZmlsdGVyQnksXG5cdFx0XHRcdGZpZWxkOiB0aGlzLiNzb3VyY2UuY29sdW1uLFxuXHRcdFx0XHRicnVzaDogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIEByZXR1cm5zIHtBcnJheTx7IHRhYmxlOiBzdHJpbmcsIGNvbHVtbjogc3RyaW5nLCBzdGF0czogQXJyYXk8c3RyaW5nPiB9Pn0gKi9cblx0Ly8gQHRzLWV4cGVjdC1lcnJvciAtIF9maWVsZCB0eXBlIGlzIGJhZCBmcm9tIE1vc2FpY0NsaWVudFxuXHRmaWVsZHMoKTogQXJyYXk8eyB0YWJsZTogc3RyaW5nOyBjb2x1bW46IHN0cmluZzsgc3RhdHM6IEFycmF5PHN0cmluZz4gfT4ge1xuXHRcdGNvbnN0IGZpZWxkcyA9IG5ldyBNYXAoKTtcblx0XHRmb3IgKGxldCB7IGZpZWxkIH0gb2YgdGhpcy4jY2hhbm5lbHMpIHtcblx0XHRcdGlmICghZmllbGQpIGNvbnRpbnVlO1xuXHRcdFx0bGV0IHN0YXRzID0gZmllbGQuc3RhdHM/LnN0YXRzIHx8IFtdO1xuXHRcdFx0bGV0IGtleSA9IGZpZWxkLnN0YXRzPy5jb2x1bW4gPz8gZmllbGQ7XG5cdFx0XHRsZXQgZW50cnkgPSBmaWVsZHMuZ2V0KGtleSk7XG5cdFx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHRcdGVudHJ5ID0gbmV3IFNldCgpO1xuXHRcdFx0XHRmaWVsZHMuc2V0KGtleSwgZW50cnkpO1xuXHRcdFx0fVxuXHRcdFx0c3RhdHMuZm9yRWFjaCgocykgPT4gZW50cnkuYWRkKHMpKTtcblx0XHR9XG5cdFx0cmV0dXJuIEFycmF5LmZyb20oXG5cdFx0XHRmaWVsZHMsXG5cdFx0XHQoW2MsIHNdKSA9PiAoeyB0YWJsZTogdGhpcy4jc291cmNlLnRhYmxlLCBjb2x1bW46IGMsIHN0YXRzOiBzIH0pLFxuXHRcdCk7XG5cdH1cblxuXHQvKiogQHBhcmFtIHtBcnJheTxJbmZvPn0gaW5mbyAqL1xuXHRmaWVsZEluZm8oaW5mbzogQXJyYXk8SW5mbz4pIHtcblx0XHRsZXQgbG9va3VwID0gT2JqZWN0LmZyb21FbnRyaWVzKGluZm8ubWFwKCh4KSA9PiBbeC5jb2x1bW4sIHhdKSk7XG5cdFx0Zm9yIChsZXQgZW50cnkgb2YgdGhpcy4jY2hhbm5lbHMpIHtcblx0XHRcdGxldCB7IGZpZWxkIH0gPSBlbnRyeTtcblx0XHRcdGlmIChmaWVsZCkge1xuXHRcdFx0XHRPYmplY3QuYXNzaWduKGVudHJ5LCBsb29rdXBbZmllbGQuc3RhdHM/LmNvbHVtbiA/PyBmaWVsZF0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9maWVsZEluZm8gPSB0cnVlO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0LyoqIEBwYXJhbSB7c3RyaW5nfSBjaGFubmVsICovXG5cdGNoYW5uZWwoY2hhbm5lbDogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHRoaXMuI2NoYW5uZWxzLmZpbmQoKGMpID0+IGMuY2hhbm5lbCA9PT0gY2hhbm5lbCk7XG5cdH1cblxuXHQvKipcblx0ICogQHBhcmFtIHtzdHJpbmd9IGNoYW5uZWxcblx0ICogQHBhcmFtIHt7IGV4YWN0PzogYm9vbGVhbiB9fSBbb3B0aW9uc11cblx0ICogQHJldHVybnMge0NoYW5uZWx9XG5cdCAqL1xuXHRjaGFubmVsRmllbGQoXG5cdFx0Y2hhbm5lbDogc3RyaW5nLFxuXHRcdHsgZXhhY3QgPSBmYWxzZSB9OiB7IGV4YWN0PzogYm9vbGVhbiB9ID0ge30sXG5cdCk6IENoYW5uZWwge1xuXHRcdGFzc2VydCh0aGlzLl9maWVsZEluZm8sIFwiRmllbGQgaW5mbyBub3Qgc2V0XCIpO1xuXHRcdGxldCBjID0gZXhhY3Rcblx0XHRcdD8gdGhpcy5jaGFubmVsKGNoYW5uZWwpXG5cdFx0XHQ6IHRoaXMuI2NoYW5uZWxzLmZpbmQoKGMpID0+IGMuY2hhbm5lbC5zdGFydHNXaXRoKGNoYW5uZWwpKTtcblx0XHRhc3NlcnQoYywgYENoYW5uZWwgJHtjaGFubmVsfSBub3QgZm91bmRgKTtcblx0XHRyZXR1cm4gYztcblx0fVxuXG5cdGhhc0ZpZWxkSW5mbygpIHtcblx0XHRyZXR1cm4gISF0aGlzLl9maWVsZEluZm87XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJuIGEgcXVlcnkgc3BlY2lmeWluZyB0aGUgZGF0YSBuZWVkZWQgYnkgdGhpcyBNYXJrIGNsaWVudC5cblx0ICogQHBhcmFtIHsqfSBbZmlsdGVyXSBUaGUgZmlsdGVyaW5nIGNyaXRlcmlhIHRvIGFwcGx5IGluIHRoZSBxdWVyeS5cblx0ICogQHJldHVybnMgeyp9IFRoZSBjbGllbnQgcXVlcnlcblx0ICovXG5cdHF1ZXJ5KGZpbHRlcjogYW55ID0gW10pOiBhbnkge1xuXHRcdHJldHVybiBtYXJrUXVlcnkodGhpcy4jY2hhbm5lbHMsIHRoaXMuI3NvdXJjZS50YWJsZSkud2hlcmUoZmlsdGVyKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBQcm92aWRlIHF1ZXJ5IHJlc3VsdCBkYXRhIHRvIHRoZSBtYXJrLlxuXHQgKiBAcGFyYW0ge2Fycm93LlRhYmxlPHsgeDE6IGFycm93LkludCwgeDI6IGFycm93LkludCwgeTogYXJyb3cuSW50IH0+fSBkYXRhXG5cdCAqL1xuXHRxdWVyeVJlc3VsdChcblx0XHRkYXRhOiBhcnJvdy5UYWJsZTx7IHgxOiBhcnJvdy5JbnQ7IHgyOiBhcnJvdy5JbnQ7IHk6IGFycm93LkludCB9Pixcblx0KSB7XG5cdFx0bGV0IGJpbnMgPSBBcnJheS5mcm9tKGRhdGEsIChkKSA9PiAoe1xuXHRcdFx0eDA6IGQueDEsXG5cdFx0XHR4MTogZC54Mixcblx0XHRcdGxlbmd0aDogZC55LFxuXHRcdH0pKTtcblx0XHRsZXQgbnVsbENvdW50ID0gMDtcblx0XHRsZXQgbnVsbEJpbkluZGV4ID0gYmlucy5maW5kSW5kZXgoKGIpID0+IGIueDAgPT0gbnVsbCk7XG5cdFx0aWYgKG51bGxCaW5JbmRleCA+PSAwKSB7XG5cdFx0XHRudWxsQ291bnQgPSBiaW5zW251bGxCaW5JbmRleF0ubGVuZ3RoO1xuXHRcdFx0Ymlucy5zcGxpY2UobnVsbEJpbkluZGV4LCAxKTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLiNpbml0aWFsaXplZCkge1xuXHRcdFx0dGhpcy5zdmcgPSBjcm9zc2ZpbHRlckhpc3RvZ3JhbShiaW5zLCB7XG5cdFx0XHRcdG51bGxDb3VudCxcblx0XHRcdFx0dHlwZTogdGhpcy4jc291cmNlLnR5cGUsXG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuI2ludGVydmFsPy5pbml0KHRoaXMuc3ZnLCBudWxsKTtcblx0XHRcdHRoaXMuI2VsLmFwcGVuZENoaWxkKHRoaXMuc3ZnKTtcblx0XHRcdHRoaXMuI2luaXRpYWxpemVkID0gdHJ1ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zdmc/LnVwZGF0ZShiaW5zLCB7IG51bGxDb3VudCB9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRnZXQgcGxvdCgpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bm9kZTogKCkgPT4gdGhpcy4jZWwsXG5cdFx0XHQvKiogQHBhcmFtIHtzdHJpbmd9IF9uYW1lICovXG5cdFx0XHRnZXRBdHRyaWJ1dGUoX25hbWU6IHN0cmluZykge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHRcdG1hcmtTZXQ6IHRoaXMuI21hcmtTZXQsXG5cdFx0fTtcblx0fVxufVxuXG4vKipcbiAqIEBwYXJhbSB7c3RyaW5nfSBjaGFubmVsXG4gKiBAcGFyYW0ge0ZpZWxkfSBmaWVsZFxuICogQHJldHVybnMge0NoYW5uZWx9XG4gKi9cbmZ1bmN0aW9uIGZpZWxkRW50cnkoY2hhbm5lbDogc3RyaW5nLCBmaWVsZDogRmllbGQpOiBDaGFubmVsIHtcblx0cmV0dXJuIHtcblx0XHRjaGFubmVsLFxuXHRcdGZpZWxkLFxuXHRcdGFzOiBmaWVsZCBpbnN0YW5jZW9mIG1zcWwuUmVmID8gZmllbGQuY29sdW1uIDogY2hhbm5lbCxcblx0fTtcbn1cblxuLyoqXG4gKiBAcGFyYW0ge3N0cmluZ30gY2hhbm5lbFxuICogQHBhcmFtIHt1bmtub3dufSBmaWVsZFxuICogQHJldHVybnMge2ZpZWxkIGlzIEZpZWxkfVxuICovXG5mdW5jdGlvbiBpc0ZpZWxkT2JqZWN0KGNoYW5uZWw6IHN0cmluZywgZmllbGQ6IHVua25vd24pOiBmaWVsZCBpcyBGaWVsZCB7XG5cdGlmIChjaGFubmVsID09PSBcInNvcnRcIiB8fCBjaGFubmVsID09PSBcInRpcFwiKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHJldHVybiAoXG5cdFx0dHlwZW9mIGZpZWxkID09PSBcIm9iamVjdFwiICYmXG5cdFx0ZmllbGQgIT0gbnVsbCAmJlxuXHRcdCFBcnJheS5pc0FycmF5KGZpZWxkKVxuXHQpO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7dW5rbm93bn0geFxuICogQHJldHVybnMge3ggaXMgKG1hcms6IE1hcmssIGNoYW5uZWw6IHN0cmluZykgPT4gUmVjb3JkPHN0cmluZywgRmllbGQ+fVxuICovXG5mdW5jdGlvbiBpc1RyYW5zZm9ybShcblx0eDogdW5rbm93bixcbik6IHggaXMgKG1hcms6IE1hcmssIGNoYW5uZWw6IHN0cmluZykgPT4gUmVjb3JkPHN0cmluZywgRmllbGQ+IHtcblx0cmV0dXJuIHR5cGVvZiB4ID09PSBcImZ1bmN0aW9uXCI7XG59XG5cbi8qKlxuICogRGVmYXVsdCBxdWVyeSBjb25zdHJ1Y3Rpb24gZm9yIGEgbWFyay5cbiAqXG4gKiBUcmFja3MgYWdncmVnYXRlcyBieSBjaGVja2luZyBmaWVsZHMgZm9yIGFuIGFnZ3JlZ2F0ZSBmbGFnLlxuICogSWYgYWdncmVnYXRlcyBhcmUgZm91bmQsIGdyb3VwcyBieSBhbGwgbm9uLWFnZ3JlZ2F0ZSBmaWVsZHMuXG4gKlxuICogQHBhcmFtIHtBcnJheTxDaGFubmVsPn0gY2hhbm5lbHMgYXJyYXkgb2YgdmlzdWFsIGVuY29kaW5nIGNoYW5uZWwgc3BlY3MuXG4gKiBAcGFyYW0ge3N0cmluZ30gdGFibGUgdGhlIHRhYmxlIHRvIHF1ZXJ5LlxuICogQHBhcmFtIHtBcnJheTxzdHJpbmc+fSBza2lwIGFuIG9wdGlvbmFsIGFycmF5IG9mIGNoYW5uZWxzIHRvIHNraXAuIE1hcmsgc3ViY2xhc3NlcyBjYW4gc2tpcCBjaGFubmVscyB0aGF0IHJlcXVpcmUgc3BlY2lhbCBoYW5kbGluZy5cbiAqIEByZXR1cm5zIHttc3FsLlF1ZXJ5fSBhIFF1ZXJ5IGluc3RhbmNlXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtYXJrUXVlcnkoXG5cdGNoYW5uZWxzOiBBcnJheTxDaGFubmVsPixcblx0dGFibGU6IHN0cmluZyxcblx0c2tpcDogQXJyYXk8c3RyaW5nPiA9IFtdLFxuKTogbXNxbC5RdWVyeSB7XG5cdGxldCBxID0gbXNxbC5RdWVyeS5mcm9tKHsgc291cmNlOiB0YWJsZSB9KTtcblx0bGV0IGRpbXMgPSBuZXcgU2V0KCk7XG5cdGxldCBhZ2dyID0gZmFsc2U7XG5cblx0Zm9yIChjb25zdCBjIG9mIGNoYW5uZWxzKSB7XG5cdFx0Y29uc3QgeyBjaGFubmVsLCBmaWVsZCwgYXMgfSA9IGM7XG5cdFx0aWYgKHNraXAuaW5jbHVkZXMoY2hhbm5lbCkpIGNvbnRpbnVlO1xuXG5cdFx0aWYgKGNoYW5uZWwgPT09IFwib3JkZXJieVwiKSB7XG5cdFx0XHRxLm9yZGVyYnkoYy52YWx1ZSk7XG5cdFx0fSBlbHNlIGlmIChmaWVsZCkge1xuXHRcdFx0aWYgKGZpZWxkLmFnZ3JlZ2F0ZSkge1xuXHRcdFx0XHRhZ2dyID0gdHJ1ZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChkaW1zLmhhcyhhcykpIGNvbnRpbnVlO1xuXHRcdFx0XHRkaW1zLmFkZChhcyk7XG5cdFx0XHR9XG5cdFx0XHRxLnNlbGVjdCh7IFthc106IGZpZWxkIH0pO1xuXHRcdH1cblx0fVxuXHRpZiAoYWdncikge1xuXHRcdHEuZ3JvdXBieShBcnJheS5mcm9tKGRpbXMpKTtcblx0fVxuXHRyZXR1cm4gcTtcbn1cbiIsICIvKipcbiAqIERlZmVyIGEgcHJvbWlzZS5cbiAqXG4gKiBUT0RPOiBTaG91bGQgdXNlIFByb21pc2Uud2l0aFJlc29sdmVycygpIHdoZW4gYXZhaWxhYmxlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZGVmZXI8U3VjY2VzcywgUmVqZWN0PigpOiB7XG5cdHByb21pc2U6IFByb21pc2U8U3VjY2Vzcz47XG5cdHJlc29sdmU6ICh2YWx1ZTogU3VjY2VzcykgPT4gdm9pZDtcblx0cmVqZWN0OiAocmVhc29uPzogUmVqZWN0KSA9PiB2b2lkO1xufSB7XG5cdGxldCByZXNvbHZlO1xuXHRsZXQgcmVqZWN0O1xuXHRsZXQgcHJvbWlzZSA9IG5ldyBQcm9taXNlPFN1Y2Nlc3M+KChyZXMsIHJlaikgPT4ge1xuXHRcdHJlc29sdmUgPSByZXM7XG5cdFx0cmVqZWN0ID0gcmVqO1xuXHR9KTtcblx0LyoqIEB0cy1leHBlY3QtZXJyb3IgLSByZXNvbHZlIGFuZCByZWplY3QgYXJlIHNldCAqL1xuXHRyZXR1cm4geyBwcm9taXNlLCByZXNvbHZlLCByZWplY3QgfTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBQSxZQUFZQSxTQUFRO0FBQ3BCLFlBQVlDLFdBQVU7QUFDdEIsWUFBWUMsWUFBVztBQUN2QixZQUFZLFVBQVU7OztBQ0Z0QixZQUFZQyxZQUFXO0FBQ3ZCLFlBQVlDLFNBQVE7QUFDcEIsWUFBWUMsV0FBVTtBQUN0QixZQUFZLGFBQWE7QUFDekIsU0FBUyxZQUFZOzs7QUNMckIsU0FBUyxnQkFBZ0I7QUFDekIsWUFBWSxXQUFXO0FBUXZCLFNBQVMsSUFDUixxQkFDQSxRQUNBLE1BQU0sT0FDeUM7QUFDL0MsU0FBTyxDQUFDLFVBQVU7QUFDakIsUUFBSTtBQUFLLGNBQVEsSUFBSSxLQUFLO0FBQzFCLFFBQUksVUFBVSxVQUFhLFVBQVUsTUFBTTtBQUMxQyxhQUFPLFVBQVUsS0FBSztBQUFBLElBQ3ZCO0FBQ0EsV0FBTyxPQUFPLEtBQUs7QUFBQSxFQUNwQjtBQUNEO0FBRUEsU0FBUyxVQUFVLEdBQW9CO0FBQ3RDLFNBQU8sR0FBRyxDQUFDO0FBQ1o7QUFHTyxTQUFTLG1CQUFtQixNQUFzQjtBQUV4RCxNQUFVLGVBQVMsY0FBYyxJQUFJO0FBQUcsV0FBTztBQUMvQyxNQUFVLGVBQVMsWUFBWSxJQUFJO0FBQUcsV0FBTztBQUU3QyxTQUFPLEtBQ0wsU0FBUyxFQUNULFlBQVksRUFDWixRQUFRLFlBQVksS0FBSyxFQUN6QixRQUFRLGlC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VUFBSSxZQUFZO0FBQUEsUUFDZixNQUFNLE9BQU87QUFDWixjQUFJLEVBQUUsU0FBUyxTQUFTLE9BQU8sSUFBSSxNQUdqQztBQUNGLGVBQUssT0FBTyxTQUFTLE1BQU07QUFDM0IsaUJBQU87QUFBQSxRQUNSO0FBQUEsTUFDRDtBQUVBLGtCQUFZLGtCQUFrQixTQUFTO0FBR3ZDLFVBQUksUUFBUSxNQUFNLFlBQVk7QUFBQSxRQUN4QixZQUNILEtBQUssTUFBTSxJQUFJLGFBQWEsQ0FBQyxFQUM3QixPQUFPLEdBQUcsTUFBTSxJQUFJLFVBQVUsQ0FBQyxFQUMvQixNQUFNLENBQUMsRUFDUCxTQUFTO0FBQUEsTUFDWjtBQUNBLGVBQVMsTUFBTTtBQUVmLGFBQU8sTUFBTTtBQUNaLG9CQUFZLE1BQU07QUFBQSxNQUNuQjtBQUFBLElBQ0Q7QUFBQSxJQUNBLE9BQU8sRUFBRSxPQUFPLEdBQUcsR0FBMEI7QUFDNUMsVUFBSSxTQUFZLGNBQVUsWUFBWTtBQUN0QyxVQUFJLFFBQVEsSUFBSSxVQUFVO0FBQUEsUUFDekIsT0FBTyxNQUFNLElBQUksYUFBYTtBQUFBLFFBQzlCO0FBQUEsUUFDQSxVQUFVO0FBQUEsTUFDWCxDQUFDO0FBQ0Qsa0JBQVksUUFBUSxLQUFLO0FBQ3pCLFNBQUcsWUFBWSxNQUFNLEtBQUssQ0FBQztBQUFBLElBQzVCO0FBQUEsRUFDRDtBQUNEOyIsCiAgIm5hbWVzIjogWyJtYyIsICJtc3FsIiwgImFycm93IiwgImFycm93IiwgIm1jIiwgIm1zcWwiLCAiYXNzZXJ0IiwgImFzc2VydCIsICJjIiwgImV2ZW50IiwgImFzc2VydCJdCn0K
