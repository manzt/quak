var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc2) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc2 = __getOwnPropDesc(from, key)) || desc2.enumerable });
  }
  return to;
};
var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));

// lib/widget.ts
import * as mc3 from "https://cdn.jsdelivr.net/npm/@uwdata/mosaic-core@0.10.0/+esm";
import * as msql from "https://cdn.jsdelivr.net/npm/@uwdata/mosaic-sql@0.10.0/+esm";
import * as arrow3 from "https://esm.sh/apache-arrow@16.1.0";
import * as uuid from "https://esm.sh/@lukeed/uuid@2.0.1";

// lib/clients/DataTable.ts
import * as arrow2 from "https://esm.sh/apache-arrow@16.1.0";
import * as mc2 from "https://cdn.jsdelivr.net/npm/@uwdata/mosaic-core@0.10.0/+esm";
import { desc, Query as Query2 } from "https://cdn.jsdelivr.net/npm/@uwdata/mosaic-sql@0.10.0/+esm";
import * as signals from "https://esm.sh/@preact/signals-core@1.6.1";
import { html } from "https://esm.sh/htl@0.3.1";

// lib/utils/assert.ts
var AssertionError = class extends Error {
  /** @param message The error message. */
  constructor(message) {
    super(message);
    this.name = "AssertionError";
  }
};
function assert(expr, msg = "") {
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
      assert(next, "No next batch");
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

// lib/utils/formatting.ts
import { Temporal } from "https://esm.sh/@js-temporal/polyfill@0.4.4";
import * as arrow from "https://esm.sh/apache-arrow@16.1.0";
function fmt(_arrowDataTypeValue, format2, log = false) {
  return (value) => {
    if (log)
      console.log(value);
    if (value === void 0 || value === null) {
      return stringify(value);
    }
    return format2(value);
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

// lib/clients/Histogram.ts
import * as mc from "https://cdn.jsdelivr.net/npm/@uwdata/mosaic-core@0.10.0/+esm";
import { count, Query, Ref } from "https://cdn.jsdelivr.net/npm/@uwdata/mosaic-sql@0.10.0/+esm";
import * as mplot from "https://cdn.jsdelivr.net/npm/@uwdata/mosaic-plot@0.10.0/+esm";

// lib/d3.ts
var d3_exports = {};
__reExport(d3_exports, d3_selection_star);
__reExport(d3_exports, d3_scale_star);
__reExport(d3_exports, d3_axis_star);
__reExport(d3_exports, d3_format_star);
__reExport(d3_exports, d3_time_format_star);
import * as d3_selection_star from "https://esm.sh/d3-selection@3.0.0";
import * as d3_scale_star from "https://esm.sh/d3-scale@4.0.2";
import * as d3_axis_star from "https://esm.sh/d3-axis@3.0.0";
import * as d3_format_star from "https://esm.sh/d3-format@3.1.0";
import * as d3_time_format_star from "https://esm.sh/d3-time-format@4.1.0";

// lib/utils/tick-formatter-for-bins.ts
var YEAR = "year";
var MONTH = "month";
var DAY = "day";
var HOUR = "hour";
var MINUTE = "minute";
var SECOND = "second";
var MILLISECOND = "millisecond";
var durationSecond = 1e3;
var durationMinute = durationSecond * 60;
var durationHour = durationMinute * 60;
var durationDay = durationHour * 24;
var durationWeek = durationDay * 7;
var durationMonth = durationDay * 30;
var durationYear = durationDay * 365;
var intervals = [
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
  [YEAR, 1, durationYear]
];
var formatMap = {
  [MILLISECOND]: d3_exports.timeFormat("%L"),
  [SECOND]: d3_exports.timeFormat("%S s"),
  [MINUTE]: d3_exports.timeFormat("%H:%M"),
  [HOUR]: d3_exports.timeFormat("%H:%M"),
  [DAY]: d3_exports.timeFormat("%b %d"),
  [MONTH]: d3_exports.timeFormat("%b %Y"),
  [YEAR]: d3_exports.timeFormat("%Y")
};
function tickFormatterForBins(type, bins) {
  if (type === "number") {
    return d3_exports.format("~s");
  }
  let interval = timeInterval(
    bins[0].x0,
    bins[bins.length - 1].x1,
    bins.length
  );
  return formatMap[interval.interval];
}
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
    let interval = intervals[target / intervals[i - 1][2] < intervals[i][2] / target ? i - 1 : i];
    return { interval: interval[0], step: interval[1] };
  }
  return { interval: MILLISECOND, step: binStep(span, steps, 1) };
}
function binStep(span, steps, minstep = 0, logb = Math.LN10) {
  let v;
  const level = Math.ceil(Math.log(steps) / logb);
  let step = Math.max(
    minstep,
    Math.pow(10, Math.round(Math.log(span) / logb) - level)
  );
  while (Math.ceil(span / step) > steps)
    step *= 10;
  const div = [5, 2];
  for (let i = 0, n = div.length; i < n; ++i) {
    v = step / div[i];
    if (v >= minstep && span / v <= steps)
      step = v;
  }
  return step;
}

// lib/utils/CrossfilterHistogramPlot.ts
function CrossfilterHistogramPlot(bins, {
  type = "number",
  width = 125,
  height = 40,
  marginTop = 0,
  marginRight = 2,
  marginBottom = 12,
  marginLeft = 2,
  nullCount = 0,
  fillColor = "#64748b",
  nullFillColor = "#ca8a04",
  backgroundBarColor = "var(--moon-gray)"
}) {
  let nullBinWidth = nullCount === 0 ? 0 : 5;
  let spacing = nullBinWidth ? 4 : 0;
  let extent = (
    /** @type {const} */
    [
      Math.min(...bins.map((d) => d.x0)),
      Math.max(...bins.map((d) => d.x1))
    ]
  );
  let x = type === "date" ? d3_exports.scaleUtc() : d3_exports.scaleLinear();
  x.domain(extent).range([marginLeft + nullBinWidth + spacing, width - marginRight]).nice();
  let y = d3_exports.scaleLinear().domain([0, Math.max(nullCount, ...bins.map((d) => d.length))]).range([height - marginBottom, marginTop]);
  let svg = d3_exports.create("svg").attr("width", width).attr("height", height).attr("viewBox", [0, 0, width, height]).attr("style", "max-width: 100%; height: auto; overflow: visible;");
  {
    svg.append("g").attr("fill", backgroundBarColor).selectAll("rect").data(bins).join("rect").attr("x", (d) => x(d.x0) + 1.5).attr("width", (d) => x(d.x1) - x(d.x0) - 1.5).attr("y", (d) => y(d.length)).attr("height", (d) => y(0) - y(d.length));
  }
  let foregroundBarGroup = svg.append("g").attr("fill", fillColor);
  svg.append("g").attr("transform", `translate(0,${height - marginBottom})`).call(
    d3_exports.axisBottom(x).tickValues(x.domain()).tickFormat(tickFormatterForBins(type, bins)).tickSize(2.5)
  ).call((g) => {
    g.select(".domain").remove();
    g.attr("class", "gray");
    g.selectAll(".tick text").attr("text-anchor", (_, i) => i === 0 ? "start" : "end").attr("dx", (_, i) => i === 0 ? "-0.25em" : "0.25em");
  });
  let foregroundNullGroup = void 0;
  if (nullCount > 0) {
    let xnull = d3_exports.scaleLinear().range([marginLeft, marginLeft + nullBinWidth]);
    svg.append("g").attr("fill", backgroundBarColor).append("rect").attr("x", xnull(0)).attr("width", xnull(1) - xnull(0)).attr("y", y(nullCount)).attr("height", y(0) - y(nullCount));
    foregroundNullGroup = svg.append("g").attr("fill", nullFillColor).attr("color", nullFillColor);
    foregroundNullGroup.append("rect").attr("x", xnull(0)).attr("width", xnull(1) - xnull(0));
    let axisGroup = foregroundNullGroup.append("g").attr("transform", `translate(0,${height - marginBottom})`).append("g").attr("transform", `translate(${xnull(0.5)}, 0)`).attr("class", "tick");
    axisGroup.append("line").attr("stroke", "currentColor").attr("y2", 2.5);
    axisGroup.append("text").attr("fill", "currentColor").attr("y", 4.5).attr("dy", "0.71em").attr("text-anchor", "middle").text("\u2205").attr("font-size", "0.9em").attr("font-family", "var(--sans-serif)").attr("font-weight", "normal");
  }
  svg.selectAll(".tick").attr("font-family", "var(--sans-serif)").attr("font-weight", "normal");
  function render(bins2, nullCount2) {
    foregroundBarGroup.selectAll("rect").data(bins2).join("rect").attr("x", (d) => x(d.x0) + 1.5).attr("width", (d) => x(d.x1) - x(d.x0) - 1.5).attr("y", (d) => y(d.length)).attr("height", (d) => y(0) - y(d.length));
    foregroundNullGroup?.select("rect").attr("y", y(nullCount2)).attr("height", y(0) - y(nullCount2));
  }
  let scales = {
    x: Object.assign(x, {
      type: "linear",
      domain: x.domain(),
      range: x.range()
    }),
    y: Object.assign(y, {
      type: "linear",
      domain: y.domain(),
      range: y.range()
    })
  };
  let node = svg.node();
  assert(node, "Infallable");
  render(bins, nullCount);
  return Object.assign(node, {
    /** @param {string} type */
    scale(type2) {
      let scale = scales[type2];
      assert(scale, "Invalid scale type");
      return scale;
    },
    /**
     * @param {Array<Bin>} bins
     * @param {{ nullCount: number }} opts
     */
    update(bins2, { nullCount: nullCount2 }) {
      render(bins2, nullCount2);
    },
    reset() {
      render(bins, nullCount);
    }
  });
}

// lib/clients/Histogram.ts
var Histogram = class extends mc.MosaicClient {
  type = "rectY";
  #source;
  #el = document.createElement("div");
  #channels = [];
  #markSet = /* @__PURE__ */ new Set();
  #interval = void 0;
  #initialized = false;
  #fieldInfo = false;
  svg;
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
      y: count()
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
  fieldInfo(info) {
    let lookup = Object.fromEntries(info.map((x) => [x.column, x]));
    for (let entry of this.#channels) {
      let { field } = entry;
      if (field) {
        Object.assign(entry, lookup[field.stats?.column ?? field]);
      }
    }
    this.#fieldInfo = true;
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
    assert(this.fieldInfo, "Field info not set");
    let c = exact ? this.channel(channel) : this.#channels.find((c2) => c2.channel.startsWith(channel));
    assert(c, `Channel ${channel} not found`);
    return c;
  }
  hasFieldInfo() {
    return !!this.#fieldInfo;
  }
  /**
   * Return a query specifying the data needed by this Mark client.
   * @param filter The filtering criteria to apply in the query.
   * @returns The client query
   */
  query(filter) {
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
      this.svg = CrossfilterHistogramPlot(bins, {
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
    as: field instanceof Ref ? field.column : channel
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
  let q = Query.from({ source: table });
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
    return Query2.from(this.#source.table).select(this.#columns).where(filter).orderby(
      this.#orderby.filter((o) => o.order !== "unset").map((o) => o.order === "asc" ? asc(o.field) : desc(o.field))
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
  fieldInfo(infos) {
    let classes = classof(this.#source.schema);
    this.#templateRow = html`<tr><td></td>${infos.map((info) => html.fragment`<td class=${classes[info.column]}></td>`)}
			<td style=${{ width: "99%", borderLeft: "none", borderRight: "none" }}></td>
		</tr>`;
    let observer = new IntersectionObserver((entries) => {
      for (let entry of entries) {
        if (!isTableColumnHeaderWithSvg(entry.target))
          continue;
        let vis = entry.target.vis;
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
    let td = itr.childNodes[0];
    td.appendChild(document.createTextNode(String(i)));
    for (let j = 0; j < this.#columns.length; ++j) {
      td = itr.childNodes[j + 1];
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
    sortState.value = {
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
  const format2 = /* @__PURE__ */ Object.create(
    null
  );
  for (const field of schema.fields) {
    format2[field.name] = formatterForDataTypeValue(field.type);
  }
  return format2;
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
function isTableColumnHeaderWithSvg(node) {
  return node instanceof HTMLTableCellElement && "vis" in node;
}
function asc(field) {
  let expr = desc(field);
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
        assert(query, `No query found for ${msg.uuid}`);
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
        msql.Query.from(model.get("_table_name")).select(...model.get("_columns")).limit(0).toString()
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vbGliL3dpZGdldC50cyIsICIuLi8uLi9saWIvY2xpZW50cy9EYXRhVGFibGUudHMiLCAiLi4vLi4vbGliL3V0aWxzL2Fzc2VydC50cyIsICIuLi8uLi9saWIvdXRpbHMvQXN5bmNCYXRjaFJlYWRlci50cyIsICIuLi8uLi9saWIvdXRpbHMvZm9ybWF0dGluZy50cyIsICIuLi8uLi9saWIvY2xpZW50cy9IaXN0b2dyYW0udHMiLCAiLi4vLi4vbGliL2QzLnRzIiwgIi4uLy4uL2xpYi91dGlscy90aWNrLWZvcm1hdHRlci1mb3ItYmlucy50cyIsICIuLi8uLi9saWIvdXRpbHMvQ3Jvc3NmaWx0ZXJIaXN0b2dyYW1QbG90LnRzIiwgIi4uLy4uL2xpYi91dGlscy9kZWZlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0ICogYXMgbWMgZnJvbSBcIkB1d2RhdGEvbW9zYWljLWNvcmVcIjtcbmltcG9ydCAqIGFzIG1zcWwgZnJvbSBcIkB1d2RhdGEvbW9zYWljLXNxbFwiO1xuaW1wb3J0ICogYXMgYXJyb3cgZnJvbSBcImFwYWNoZS1hcnJvd1wiO1xuaW1wb3J0ICogYXMgdXVpZCBmcm9tIFwiQGx1a2VlZC91dWlkXCI7XG5pbXBvcnQgdHlwZSAqIGFzIGF3IGZyb20gXCJAYW55d2lkZ2V0L3R5cGVzXCI7XG5cbmltcG9ydCB7IERhdGFUYWJsZSB9IGZyb20gXCIuL2NsaWVudHMvRGF0YVRhYmxlLnRzXCI7XG5pbXBvcnQgeyBhc3NlcnQgfSBmcm9tIFwiLi91dGlscy9hc3NlcnQudHNcIjtcbmltcG9ydCB7IGRlZmVyIH0gZnJvbSBcIi4vdXRpbHMvZGVmZXIudHNcIjtcblxudHlwZSBNb2RlbCA9IHtcblx0X3RhYmxlX25hbWU6IHN0cmluZztcblx0X2NvbHVtbnM6IEFycmF5PHN0cmluZz47XG5cdHRlbXBfaW5kZXhlczogYm9vbGVhbjtcbn07XG5cbmludGVyZmFjZSBDb25uZWN0b3Ige1xuXHRxdWVyeShxdWVyeTogbXNxbC5RdWVyeSk6IFByb21pc2U8YXJyb3cuVGFibGUgfCBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPj47XG59XG5cbmludGVyZmFjZSBPcGVuUXVlcnkge1xuXHRxdWVyeTogUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdHN0YXJ0VGltZTogbnVtYmVyO1xuXHRyZXNvbHZlOiAoeDogYXJyb3cuVGFibGUgfCBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4gdm9pZDtcblx0cmVqZWN0OiAoZXJyPzogc3RyaW5nKSA9PiB2b2lkO1xufVxuXG5leHBvcnQgZGVmYXVsdCAoKSA9PiB7XG5cdGxldCBjb29yZGluYXRvciA9IG5ldyBtYy5Db29yZGluYXRvcigpO1xuXHRsZXQgc2NoZW1hOiBhcnJvdy5TY2hlbWE7XG5cblx0cmV0dXJuIHtcblx0XHRhc3luYyBpbml0aWFsaXplKHsgbW9kZWwgfTogYXcuSW5pdGlhbGl6ZVByb3BzPE1vZGVsPikge1xuXHRcdFx0Ly8gdHMtZXhwZWN0LWVycm9yIC0gb2sgdG8gaGF2ZSBubyBhcmdzXG5cdFx0XHRsZXQgbG9nZ2VyID0gY29vcmRpbmF0b3IubG9nZ2VyKCk7XG5cdFx0XHRsZXQgb3BlblF1ZXJpZXMgPSBuZXcgTWFwPHN0cmluZywgT3BlblF1ZXJ5PigpO1xuXG5cdFx0XHQvKipcblx0XHRcdCAqIEBwYXJhbSBxdWVyeSAtIHRoZSBxdWVyeSB0byBzZW5kXG5cdFx0XHQgKiBAcGFyYW0gcmVzb2x2ZSAtIHRoZSBwcm9taXNlIHJlc29sdmUgY2FsbGJhY2tcblx0XHRcdCAqIEBwYXJhbSByZWplY3QgLSB0aGUgcHJvbWlzZSByZWplY3QgY2FsbGJhY2tcblx0XHRcdCAqL1xuXHRcdFx0ZnVuY3Rpb24gc2VuZChcblx0XHRcdFx0cXVlcnk6IG1zcWwuUXVlcnksXG5cdFx0XHRcdHJlc29sdmU6ICh2YWx1ZTogYXJyb3cuVGFibGUgfCBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4gdm9pZCxcblx0XHRcdFx0cmVqZWN0OiAocmVhc29uPzogc3RyaW5nKSA9PiB2b2lkLFxuXHRcdFx0KSB7XG5cdFx0XHRcdGxldCBpZCA9IHV1aWQudjQoKTtcblx0XHRcdFx0b3BlblF1ZXJpZXMuc2V0KGlkLCB7XG5cdFx0XHRcdFx0cXVlcnksXG5cdFx0XHRcdFx0c3RhcnRUaW1lOiBwZXJmb3JtYW5jZS5ub3coKSxcblx0XHRcdFx0XHRyZXNvbHZlLFxuXHRcdFx0XHRcdHJlamVjdCxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdG1vZGVsLnNlbmQoeyAuLi5xdWVyeSwgdXVpZDogaWQgfSk7XG5cdFx0XHR9XG5cblx0XHRcdG1vZGVsLm9uKFwibXNnOmN1c3RvbVwiLCAobXNnLCBidWZmZXJzKSA9PiB7XG5cdFx0XHRcdGxvZ2dlci5ncm91cChgcXVlcnkgJHttc2cudXVpZH1gKTtcblx0XHRcdFx0bG9nZ2VyLmxvZyhcInJlY2VpdmVkIG1lc3NhZ2VcIiwgbXNnLCBidWZmZXJzKTtcblx0XHRcdFx0bGV0IHF1ZXJ5ID0gb3BlblF1ZXJpZXMuZ2V0KG1zZy51dWlkKTtcblx0XHRcdFx0b3BlblF1ZXJpZXMuZGVsZXRlKG1zZy51dWlkKTtcblx0XHRcdFx0YXNzZXJ0KHF1ZXJ5LCBgTm8gcXVlcnkgZm91bmQgZm9yICR7bXNnLnV1aWR9YCk7XG5cdFx0XHRcdGxvZ2dlci5sb2coXG5cdFx0XHRcdFx0cXVlcnkucXVlcnkuc3FsLFxuXHRcdFx0XHRcdChwZXJmb3JtYW5jZS5ub3coKSAtIHF1ZXJ5LnN0YXJ0VGltZSkudG9GaXhlZCgxKSxcblx0XHRcdFx0KTtcblx0XHRcdFx0aWYgKG1zZy5lcnJvcikge1xuXHRcdFx0XHRcdHF1ZXJ5LnJlamVjdChtc2cuZXJyb3IpO1xuXHRcdFx0XHRcdGxvZ2dlci5lcnJvcihtc2cuZXJyb3IpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzd2l0Y2ggKG1zZy50eXBlKSB7XG5cdFx0XHRcdFx0XHRjYXNlIFwiYXJyb3dcIjoge1xuXHRcdFx0XHRcdFx0XHRsZXQgdGFibGUgPSBhcnJvdy50YWJsZUZyb21JUEMoYnVmZmVyc1swXS5idWZmZXIpO1xuXHRcdFx0XHRcdFx0XHRsb2dnZXIubG9nKFwidGFibGVcIiwgdGFibGUpO1xuXHRcdFx0XHRcdFx0XHRxdWVyeS5yZXNvbHZlKHRhYmxlKTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjYXNlIFwianNvblwiOiB7XG5cdFx0XHRcdFx0XHRcdGxvZ2dlci5sb2coXCJqc29uXCIsIG1zZy5yZXN1bHQpO1xuXHRcdFx0XHRcdFx0XHRxdWVyeS5yZXNvbHZlKG1zZy5yZXN1bHQpO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0XHRcdFx0cXVlcnkucmVzb2x2ZSh7fSk7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRsb2dnZXIuZ3JvdXBFbmQoXCJxdWVyeVwiKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRsZXQgY29ubmVjdG9yID0ge1xuXHRcdFx0XHRxdWVyeShxdWVyeSkge1xuXHRcdFx0XHRcdGxldCB7IHByb21pc2UsIHJlc29sdmUsIHJlamVjdCB9ID0gZGVmZXI8XG5cdFx0XHRcdFx0XHRhcnJvdy5UYWJsZSB8IFJlY29yZDxzdHJpbmcsIHVua25vd24+LFxuXHRcdFx0XHRcdFx0c3RyaW5nXG5cdFx0XHRcdFx0PigpO1xuXHRcdFx0XHRcdHNlbmQocXVlcnksIHJlc29sdmUsIHJlamVjdCk7XG5cdFx0XHRcdFx0cmV0dXJuIHByb21pc2U7XG5cdFx0XHRcdH0sXG5cdFx0XHR9IHNhdGlzZmllcyBDb25uZWN0b3I7XG5cblx0XHRcdGNvb3JkaW5hdG9yLmRhdGFiYXNlQ29ubmVjdG9yKGNvbm5lY3Rvcik7XG5cblx0XHRcdC8vIGdldCBzb21lIGluaXRpYWwgZGF0YSB0byBnZXQgdGhlIHNjaGVtYVxuXHRcdFx0bGV0IGVtcHR5ID0gYXdhaXQgY29vcmRpbmF0b3IucXVlcnkoXG5cdFx0XHRcdG1zcWwuUXVlcnlcblx0XHRcdFx0XHQuZnJvbShtb2RlbC5nZXQoXCJfdGFibGVfbmFtZVwiKSlcblx0XHRcdFx0XHQuc2VsZWN0KC4uLm1vZGVsLmdldChcIl9jb2x1bW5zXCIpKVxuXHRcdFx0XHRcdC5saW1pdCgwKVxuXHRcdFx0XHRcdC50b1N0cmluZygpLFxuXHRcdFx0KTtcblx0XHRcdHNjaGVtYSA9IGVtcHR5LnNjaGVtYTtcblxuXHRcdFx0cmV0dXJuICgpID0+IHtcblx0XHRcdFx0Y29vcmRpbmF0b3IuY2xlYXIoKTtcblx0XHRcdH07XG5cdFx0fSxcblx0XHRyZW5kZXIoeyBtb2RlbCwgZWwgfTogYXcuUmVuZGVyUHJvcHM8TW9kZWw+KSB7XG5cdFx0XHRsZXQgJGJydXNoID0gbWMuU2VsZWN0aW9uLmNyb3NzZmlsdGVyKCk7XG5cdFx0XHRsZXQgdGFibGUgPSBuZXcgRGF0YVRhYmxlKHtcblx0XHRcdFx0dGFibGU6IG1vZGVsLmdldChcIl90YWJsZV9uYW1lXCIpLFxuXHRcdFx0XHRzY2hlbWE6IHNjaGVtYSxcblx0XHRcdFx0ZmlsdGVyQnk6ICRicnVzaCxcblx0XHRcdH0pO1xuXHRcdFx0Y29vcmRpbmF0b3IuY29ubmVjdCh0YWJsZSk7XG5cdFx0XHRlbC5hcHBlbmRDaGlsZCh0YWJsZS5ub2RlKCkpO1xuXHRcdH0sXG5cdH07XG59O1xuIiwgImltcG9ydCAqIGFzIGFycm93IGZyb20gXCJhcGFjaGUtYXJyb3dcIjtcblxuLy8gQGRlbm8tdHlwZXM9XCIuLi9tb3NhaWMtY29yZS5kLnRzXCJcbmltcG9ydCAqIGFzIG1jIGZyb20gXCJAdXdkYXRhL21vc2FpYy1jb3JlXCI7XG4vLyBAZGVuby10eXBlcz1cIi4uL21vc2FpYy1zcWwuZC50c1wiXG5pbXBvcnQgeyBkZXNjLCBRdWVyeSwgU1FMRXhwcmVzc2lvbiB9IGZyb20gXCJAdXdkYXRhL21vc2FpYy1zcWxcIjtcbmltcG9ydCAqIGFzIHNpZ25hbHMgZnJvbSBcIkBwcmVhY3Qvc2lnbmFscy1jb3JlXCI7XG5pbXBvcnQgeyBodG1sIH0gZnJvbSBcImh0bFwiO1xuXG5pbXBvcnQgeyBBc3luY0JhdGNoUmVhZGVyIH0gZnJvbSBcIi4uL3V0aWxzL0FzeW5jQmF0Y2hSZWFkZXIudHNcIjtcbmltcG9ydCB7IGFzc2VydCB9IGZyb20gXCIuLi91dGlscy9hc3NlcnQudHNcIjtcbmltcG9ydCB7XG5cdGZvcm1hdERhdGFUeXBlTmFtZSxcblx0Zm9ybWF0dGVyRm9yRGF0YVR5cGVWYWx1ZSxcbn0gZnJvbSBcIi4uL3V0aWxzL2Zvcm1hdHRpbmcudHNcIjtcblxuaW1wb3J0IHsgSGlzdG9ncmFtIH0gZnJvbSBcIi4vSGlzdG9ncmFtLnRzXCI7XG5pbXBvcnQgeyBJbmZvIH0gZnJvbSBcIi4uL3R5cGVzLnRzXCI7XG5cbmludGVyZmFjZSBEYXRhVGFibGVPcHRpb25zIHtcblx0dGFibGU6IHN0cmluZztcblx0c2NoZW1hOiBhcnJvdy5TY2hlbWE7XG5cdGhlaWdodD86IG51bWJlcjtcblx0ZmlsdGVyQnk/OiBtYy5TZWxlY3Rpb247XG59XG5cbi8vIFRPRE86IG1vcmVcbnR5cGUgQ29sdW1uU3VtbWFyeUNsaWVudCA9IEhpc3RvZ3JhbTtcblxuZXhwb3J0IGNsYXNzIERhdGFUYWJsZSBleHRlbmRzIG1jLk1vc2FpY0NsaWVudCB7XG5cdC8qKiBzb3VyY2Ugb3B0aW9ucyAqL1xuXHQjc291cmNlOiBEYXRhVGFibGVPcHRpb25zO1xuXHQvKiogZm9yIHRoZSBjb21wb25lbnQgKi9cblx0I3Jvb3Q6IEhUTUxFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcblx0LyoqIHNoYWRvdyByb290IGZvciB0aGUgY29tcG9uZW50ICovXG5cdCNzaGFkb3dSb290OiBTaGFkb3dSb290ID0gdGhpcy4jcm9vdC5hdHRhY2hTaGFkb3coeyBtb2RlOiBcIm9wZW5cIiB9KTtcblx0LyoqIGhlYWRlciBvZiB0aGUgdGFibGUgKi9cblx0I3RoZWFkOiBIVE1MVGFibGVTZWN0aW9uRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJ0aGVhZFwiKTtcblx0LyoqIGJvZHkgb2YgdGhlIHRhYmxlICovXG5cdCN0Ym9keTogSFRNTFRhYmxlU2VjdGlvbkVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwidGJvZHlcIik7XG5cdC8qKiBUaGUgU1FMIG9yZGVyIGJ5ICovXG5cdCNvcmRlcmJ5OiBBcnJheTx7IGZpZWxkOiBzdHJpbmc7IG9yZGVyOiBcImFzY1wiIHwgXCJkZXNjXCIgfCBcInVuc2V0XCIgfT4gPSBbXTtcblx0LyoqIHRlbXBsYXRlIHJvdyBmb3IgZGF0YSAqL1xuXHQjdGVtcGxhdGVSb3c6IEhUTUxUYWJsZVJvd0VsZW1lbnQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdC8qKiBkaXYgY29udGFpbmluZyB0aGUgdGFibGUgKi9cblx0I3RhYmxlUm9vdDogSFRNTERpdkVsZW1lbnQ7XG5cdC8qKiBvZmZzZXQgaW50byB0aGUgZGF0YSAqL1xuXHQjb2Zmc2V0OiBudW1iZXIgPSAwO1xuXHQvKiogbnVtYmVyIG9mIHJvd3MgdG8gZmV0Y2ggKi9cblx0I2xpbWl0OiBudW1iZXIgPSAxMDA7XG5cdC8qKiB3aGV0aGVyIGFuIGludGVybmFsIHJlcXVlc3QgaXMgcGVuZGluZyAqL1xuXHQjcGVuZGluZzogYm9vbGVhbiA9IGZhbHNlO1xuXHQvKiogbnVtYmVyIG9mIHJvd3MgdG8gZGlzcGxheSAqL1xuXHQjcm93czogbnVtYmVyID0gMTEuNTtcblx0LyoqIGhlaWdodCBvZiBhIHJvdyAqL1xuXHQjcm93SGVpZ2h0OiBudW1iZXIgPSAyMjtcblx0LyoqIHdpZHRoIG9mIGEgY29sdW1uICovXG5cdCNjb2x1bW5XaWR0aDogbnVtYmVyID0gMTI1O1xuXHQvKiogaGVpZ2h0IG9mIHRoZSBoZWFkZXIgKi9cblx0I2hlYWRlckhlaWdodDogc3RyaW5nID0gXCI1MHB4XCI7XG5cdC8qKiB0aGUgZm9ybWF0dGVyIGZvciB0aGUgZGF0YSB0YWJsZSBlbnRyaWVzICovXG5cdCNmb3JtYXQ6IFJlY29yZDxzdHJpbmcsICh2YWx1ZTogdW5rbm93bikgPT4gc3RyaW5nPjtcblxuXHQvKiogQHR5cGUge0FzeW5jQmF0Y2hSZWFkZXI8YXJyb3cuU3RydWN0Um93UHJveHk+IHwgbnVsbH0gKi9cblx0I3JlYWRlcjogQXN5bmNCYXRjaFJlYWRlcjxhcnJvdy5TdHJ1Y3RSb3dQcm94eT4gfCBudWxsID0gbnVsbDtcblxuXHRjb25zdHJ1Y3Rvcihzb3VyY2U6IERhdGFUYWJsZU9wdGlvbnMpIHtcblx0XHRzdXBlcihzb3VyY2UuZmlsdGVyQnkpO1xuXHRcdHRoaXMuI3NvdXJjZSA9IHNvdXJjZTtcblx0XHR0aGlzLiNmb3JtYXQgPSBmb3JtYXRvZihzb3VyY2Uuc2NoZW1hKTtcblx0XHR0aGlzLiNwZW5kaW5nID0gZmFsc2U7XG5cblx0XHRsZXQgbWF4SGVpZ2h0ID0gYCR7KHRoaXMuI3Jvd3MgKyAxKSAqIHRoaXMuI3Jvd0hlaWdodCAtIDF9cHhgO1xuXHRcdC8vIGlmIG1heEhlaWdodCBpcyBzZXQsIGNhbGN1bGF0ZSB0aGUgbnVtYmVyIG9mIHJvd3MgdG8gZGlzcGxheVxuXHRcdGlmIChzb3VyY2UuaGVpZ2h0KSB7XG5cdFx0XHR0aGlzLiNyb3dzID0gTWF0aC5mbG9vcihzb3VyY2UuaGVpZ2h0IC8gdGhpcy4jcm93SGVpZ2h0KTtcblx0XHRcdG1heEhlaWdodCA9IGAke3NvdXJjZS5oZWlnaHR9cHhgO1xuXHRcdH1cblxuXHRcdGxldCByb290OiBIVE1MRGl2RWxlbWVudCA9IGh0bWxgPGRpdiBjbGFzcz1cInF1YWtcIiBzdHlsZT0ke3tcblx0XHRcdG1heEhlaWdodCxcblx0XHR9fT5gO1xuXHRcdC8vIEBkZW5vLWZtdC1pZ25vcmVcblx0XHRyb290LmFwcGVuZENoaWxkKFxuXHRcdFx0aHRtbC5mcmFnbWVudGA8dGFibGUgY2xhc3M9XCJxdWFrXCIgc3R5bGU9JHt7IHRhYmxlTGF5b3V0OiBcImZpeGVkXCIgfX0+JHt0aGlzLiN0aGVhZH0ke3RoaXMuI3Rib2R5fTwvdGFibGU+YFxuXHRcdCk7XG5cdFx0dGhpcy4jc2hhZG93Um9vdC5hcHBlbmRDaGlsZChodG1sYDxzdHlsZT4ke1NUWUxFU308L3N0eWxlPmApO1xuXHRcdHRoaXMuI3NoYWRvd1Jvb3QuYXBwZW5kQ2hpbGQocm9vdCk7XG5cdFx0dGhpcy4jdGFibGVSb290ID0gcm9vdDtcblxuXHRcdC8vIHNjcm9sbCBldmVudCBsaXN0ZW5lclxuXHRcdHRoaXMuI3RhYmxlUm9vdC5hZGRFdmVudExpc3RlbmVyKFwic2Nyb2xsXCIsIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCBpc0F0Qm90dG9tID1cblx0XHRcdFx0dGhpcy4jdGFibGVSb290LnNjcm9sbEhlaWdodCAtIHRoaXMuI3RhYmxlUm9vdC5zY3JvbGxUb3AgPFxuXHRcdFx0XHRcdHRoaXMuI3Jvd3MgKiB0aGlzLiNyb3dIZWlnaHQgKiAxLjU7XG5cdFx0XHRpZiAoaXNBdEJvdHRvbSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLiNhcHBlbmRSb3dzKHRoaXMuI3Jvd3MpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0ZmllbGRzKCk6IEFycmF5PHsgdGFibGU6IHN0cmluZzsgY29sdW1uOiBzdHJpbmc7IHN0YXRzOiBBcnJheTxzdHJpbmc+IH0+IHtcblx0XHRyZXR1cm4gdGhpcy4jY29sdW1ucy5tYXAoKGNvbHVtbikgPT4gKHtcblx0XHRcdHRhYmxlOiB0aGlzLiNzb3VyY2UudGFibGUsXG5cdFx0XHRjb2x1bW4sXG5cdFx0XHRzdGF0czogW10sXG5cdFx0fSkpO1xuXHR9XG5cblx0bm9kZSgpIHtcblx0XHRyZXR1cm4gdGhpcy4jcm9vdDtcblx0fVxuXG5cdGdldCAjY29sdW1ucygpIHtcblx0XHRyZXR1cm4gdGhpcy4jc291cmNlLnNjaGVtYS5maWVsZHMubWFwKChmaWVsZCkgPT4gZmllbGQubmFtZSk7XG5cdH1cblxuXHQvKipcblx0ICogQHBhcmFtIHtBcnJheTx1bmtub3duPn0gZmlsdGVyXG5cdCAqL1xuXHRxdWVyeShmaWx0ZXI6IEFycmF5PHVua25vd24+ID0gW10pIHtcblx0XHRyZXR1cm4gUXVlcnkuZnJvbSh0aGlzLiNzb3VyY2UudGFibGUpXG5cdFx0XHQuc2VsZWN0KHRoaXMuI2NvbHVtbnMpXG5cdFx0XHQud2hlcmUoZmlsdGVyKVxuXHRcdFx0Lm9yZGVyYnkoXG5cdFx0XHRcdHRoaXMuI29yZGVyYnlcblx0XHRcdFx0XHQuZmlsdGVyKChvKSA9PiBvLm9yZGVyICE9PSBcInVuc2V0XCIpXG5cdFx0XHRcdFx0Lm1hcCgobykgPT4gby5vcmRlciA9PT0gXCJhc2NcIiA/IGFzYyhvLmZpZWxkKSA6IGRlc2Moby5maWVsZCkpLFxuXHRcdFx0KVxuXHRcdFx0LmxpbWl0KHRoaXMuI2xpbWl0KVxuXHRcdFx0Lm9mZnNldCh0aGlzLiNvZmZzZXQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEEgbW9zaWFjIGxpZmVjeWNsZSBmdW5jdGlvbiB0aGF0IGlzIGNhbGxlZCB3aXRoIHRoZSByZXN1bHRzIGZyb20gYHF1ZXJ5YC5cblx0ICogTXVzdCBiZSBzeW5jaHJvbm91cywgYW5kIHJldHVybiBgdGhpc2AuXG5cdCAqL1xuXHRxdWVyeVJlc3VsdChkYXRhOiBhcnJvdy5UYWJsZSkge1xuXHRcdGlmICghdGhpcy4jcGVuZGluZykge1xuXHRcdFx0Ly8gZGF0YSBpcyBub3QgZnJvbSBhbiBpbnRlcm5hbCByZXF1ZXN0LCBzbyByZXNldCB0YWJsZVxuXHRcdFx0dGhpcy4jcmVhZGVyID0gbmV3IEFzeW5jQmF0Y2hSZWFkZXIoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLiNwZW5kaW5nID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5yZXF1ZXN0RGF0YSh0aGlzLiNvZmZzZXQgKyB0aGlzLiNsaW1pdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuI3Rib2R5LnJlcGxhY2VDaGlsZHJlbigpO1xuXHRcdFx0dGhpcy4jb2Zmc2V0ID0gMDtcblx0XHR9XG5cdFx0dGhpcy4jcmVhZGVyPy5lbnF1ZXVlQmF0Y2goZGF0YVtTeW1ib2wuaXRlcmF0b3JdKCksIHtcblx0XHRcdGxhc3Q6IGRhdGEubnVtUm93cyA8IHRoaXMuI2xpbWl0LFxuXHRcdH0pO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0dXBkYXRlKCkge1xuXHRcdGlmICghdGhpcy4jcGVuZGluZykge1xuXHRcdFx0Ly8gb24gdGhlIGZpcnN0IHVwZGF0ZSwgcG9wdWxhdGUgdGhlIHRhYmxlIHdpdGggaW5pdGlhbCBkYXRhXG5cdFx0XHR0aGlzLiNhcHBlbmRSb3dzKHRoaXMuI3Jvd3MgKiAyKTtcblx0XHR9XG5cdFx0dGhpcy4jcGVuZGluZyA9IGZhbHNlO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0cmVxdWVzdERhdGEob2Zmc2V0ID0gMCkge1xuXHRcdHRoaXMuI29mZnNldCA9IG9mZnNldDtcblxuXHRcdC8vIHJlcXVlc3QgbmV4dCBkYXRhIGJhdGNoXG5cdFx0bGV0IHF1ZXJ5ID0gdGhpcy5xdWVyeSh0aGlzLmZpbHRlckJ5Py5wcmVkaWNhdGUodGhpcykpO1xuXHRcdHRoaXMucmVxdWVzdFF1ZXJ5KHF1ZXJ5KTtcblxuXHRcdC8vIHByZWZldGNoIHN1YnNlcXVlbnQgZGF0YSBiYXRjaFxuXHRcdHRoaXMuY29vcmRpbmF0b3IucHJlZmV0Y2gocXVlcnkuY2xvbmUoKS5vZmZzZXQob2Zmc2V0ICsgdGhpcy4jbGltaXQpKTtcblx0fVxuXG5cdGZpZWxkSW5mbyhpbmZvczogQXJyYXk8SW5mbz4pIHtcblx0XHRsZXQgY2xhc3NlcyA9IGNsYXNzb2YodGhpcy4jc291cmNlLnNjaGVtYSk7XG5cblx0XHQvLyBAZGVuby1mbXQtaWdub3JlXG5cdFx0dGhpcy4jdGVtcGxhdGVSb3cgPSBodG1sYDx0cj48dGQ+PC90ZD4ke1xuXHRcdFx0aW5mb3MubWFwKChpbmZvKSA9PiBodG1sLmZyYWdtZW50YDx0ZCBjbGFzcz0ke2NsYXNzZXNbaW5mby5jb2x1bW5dfT48L3RkPmApXG5cdFx0fVxuXHRcdFx0PHRkIHN0eWxlPSR7eyB3aWR0aDogXCI5OSVcIiwgYm9yZGVyTGVmdDogXCJub25lXCIsIGJvcmRlclJpZ2h0OiBcIm5vbmVcIiB9fT48L3RkPlxuXHRcdDwvdHI+YDtcblxuXHRcdGxldCBvYnNlcnZlciA9IG5ldyBJbnRlcnNlY3Rpb25PYnNlcnZlcigoZW50cmllcykgPT4ge1xuXHRcdFx0Zm9yIChsZXQgZW50cnkgb2YgZW50cmllcykge1xuXHRcdFx0XHRpZiAoIWlzVGFibGVDb2x1bW5IZWFkZXJXaXRoU3ZnKGVudHJ5LnRhcmdldCkpIGNvbnRpbnVlO1xuXHRcdFx0XHRsZXQgdmlzID0gZW50cnkudGFyZ2V0LnZpcztcblx0XHRcdFx0aWYgKCF2aXMpIGNvbnRpbnVlO1xuXHRcdFx0XHRpZiAoZW50cnkuaXNJbnRlcnNlY3RpbmcpIHtcblx0XHRcdFx0XHR0aGlzLmNvb3JkaW5hdG9yLmNvbm5lY3QodmlzKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLmNvb3JkaW5hdG9yPy5kaXNjb25uZWN0KHZpcyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LCB7XG5cdFx0XHRyb290OiB0aGlzLiN0YWJsZVJvb3QsXG5cdFx0fSk7XG5cblx0XHRsZXQgY29scyA9IHRoaXMuI3NvdXJjZS5zY2hlbWEuZmllbGRzLm1hcCgoZmllbGQpID0+IHtcblx0XHRcdGxldCBpbmZvID0gaW5mb3MuZmluZCgoYykgPT4gYy5jb2x1bW4gPT09IGZpZWxkLm5hbWUpO1xuXHRcdFx0YXNzZXJ0KGluZm8sIGBObyBpbmZvIGZvciBjb2x1bW4gJHtmaWVsZC5uYW1lfWApO1xuXHRcdFx0bGV0IHZpczogQ29sdW1uU3VtbWFyeUNsaWVudCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdGlmIChpbmZvLnR5cGUgPT09IFwibnVtYmVyXCIgfHwgaW5mby50eXBlID09PSBcImRhdGVcIikge1xuXHRcdFx0XHR2aXMgPSBuZXcgSGlzdG9ncmFtKHtcblx0XHRcdFx0XHR0YWJsZTogdGhpcy4jc291cmNlLnRhYmxlLFxuXHRcdFx0XHRcdGNvbHVtbjogZmllbGQubmFtZSxcblx0XHRcdFx0XHR0eXBlOiBpbmZvLnR5cGUsXG5cdFx0XHRcdFx0ZmlsdGVyQnk6IHRoaXMuI3NvdXJjZS5maWx0ZXJCeSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRsZXQgdGggPSB0aGNvbChmaWVsZCwgdGhpcy4jY29sdW1uV2lkdGgsIHZpcyk7XG5cdFx0XHRvYnNlcnZlci5vYnNlcnZlKHRoKTtcblx0XHRcdHJldHVybiB0aDtcblx0XHR9KTtcblxuXHRcdHNpZ25hbHMuZWZmZWN0KCgpID0+IHtcblx0XHRcdHRoaXMuI29yZGVyYnkgPSBjb2xzLm1hcCgoY29sLCBpKSA9PiAoe1xuXHRcdFx0XHRmaWVsZDogdGhpcy4jY29sdW1uc1tpXSxcblx0XHRcdFx0b3JkZXI6IGNvbC5zb3J0U3RhdGUudmFsdWUsXG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLnJlcXVlc3REYXRhKCk7XG5cdFx0fSk7XG5cblx0XHQvLyBAZGVuby1mbXQtaWdub3JlXG5cdFx0dGhpcy4jdGhlYWQuYXBwZW5kQ2hpbGQoXG5cdFx0XHRodG1sYDx0ciBzdHlsZT0ke3sgaGVpZ2h0OiB0aGlzLiNoZWFkZXJIZWlnaHQgfX0+XG5cdFx0XHRcdDx0aD48L3RoPlxuXHRcdFx0XHQke2NvbHN9XG5cdFx0XHRcdDx0aCBzdHlsZT0ke3sgd2lkdGg6IFwiOTklXCIsIGJvcmRlckxlZnQ6IFwibm9uZVwiLCBib3JkZXJSaWdodDogXCJub25lXCIgfX0+PC90aD5cblx0XHRcdDwvdHI+YCxcblx0XHQpO1xuXG5cdFx0Ly8gaGlnaGxpZ2h0IG9uIGhvdmVyXG5cdFx0e1xuXHRcdFx0dGhpcy4jdGFibGVSb290LmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZW92ZXJcIiwgKGV2ZW50KSA9PiB7XG5cdFx0XHRcdGlmIChcblx0XHRcdFx0XHRpc1RhYmxlQ2VsbEVsZW1lbnQoZXZlbnQudGFyZ2V0KSAmJlxuXHRcdFx0XHRcdGlzVGFibGVSb3dFbGVtZW50KGV2ZW50LnRhcmdldC5wYXJlbnROb2RlKVxuXHRcdFx0XHQpIHtcblx0XHRcdFx0XHRjb25zdCBjZWxsID0gZXZlbnQudGFyZ2V0O1xuXHRcdFx0XHRcdGNvbnN0IHJvdyA9IGV2ZW50LnRhcmdldC5wYXJlbnROb2RlO1xuXHRcdFx0XHRcdGhpZ2hsaWdodChjZWxsLCByb3cpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuI3RhYmxlUm9vdC5hZGRFdmVudExpc3RlbmVyKFwibW91c2VvdXRcIiwgKGV2ZW50KSA9PiB7XG5cdFx0XHRcdGlmIChcblx0XHRcdFx0XHRpc1RhYmxlQ2VsbEVsZW1lbnQoZXZlbnQudGFyZ2V0KSAmJlxuXHRcdFx0XHRcdGlzVGFibGVSb3dFbGVtZW50KGV2ZW50LnRhcmdldC5wYXJlbnROb2RlKVxuXHRcdFx0XHQpIHtcblx0XHRcdFx0XHRjb25zdCBjZWxsID0gZXZlbnQudGFyZ2V0O1xuXHRcdFx0XHRcdGNvbnN0IHJvdyA9IGV2ZW50LnRhcmdldC5wYXJlbnROb2RlO1xuXHRcdFx0XHRcdHJlbW92ZUhpZ2hsaWdodChjZWxsLCByb3cpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdC8qKiBOdW1iZXIgb2Ygcm93cyB0byBhcHBlbmQgKi9cblx0YXN5bmMgI2FwcGVuZFJvd3MobnJvd3M6IG51bWJlcikge1xuXHRcdG5yb3dzID0gTWF0aC50cnVuYyhucm93cyk7XG5cdFx0d2hpbGUgKG5yb3dzID49IDApIHtcblx0XHRcdGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLiNyZWFkZXI/Lm5leHQoKTtcblx0XHRcdGlmICghcmVzdWx0IHx8IHJlc3VsdD8uZG9uZSkge1xuXHRcdFx0XHQvLyB3ZSd2ZSBleGhhdXN0ZWQgYWxsIHJvd3Ncblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLiNhcHBlbmRSb3cocmVzdWx0LnZhbHVlLnJvdywgcmVzdWx0LnZhbHVlLmluZGV4KTtcblx0XHRcdG5yb3dzLS07XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdH1cblxuXHQjYXBwZW5kUm93KGQ6IGFycm93LlN0cnVjdFJvd1Byb3h5LCBpOiBudW1iZXIpIHtcblx0XHRsZXQgaXRyID0gdGhpcy4jdGVtcGxhdGVSb3c/LmNsb25lTm9kZSh0cnVlKTtcblx0XHRhc3NlcnQoaXRyLCBcIk11c3QgaGF2ZSBhIGRhdGEgcm93XCIpO1xuXHRcdGxldCB0ZCA9IGl0ci5jaGlsZE5vZGVzWzBdIGFzIEhUTUxUYWJsZUNlbGxFbGVtZW50O1xuXHRcdHRkLmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKFN0cmluZyhpKSkpO1xuXHRcdGZvciAobGV0IGogPSAwOyBqIDwgdGhpcy4jY29sdW1ucy5sZW5ndGg7ICsraikge1xuXHRcdFx0dGQgPSBpdHIuY2hpbGROb2Rlc1tqICsgMV0gYXMgSFRNTFRhYmxlQ2VsbEVsZW1lbnQ7XG5cdFx0XHR0ZC5jbGFzc0xpc3QucmVtb3ZlKFwiZ3JheVwiKTtcblx0XHRcdGxldCBjb2wgPSB0aGlzLiNjb2x1bW5zW2pdO1xuXHRcdFx0bGV0IHN0cmluZ2lmaWVkID0gdGhpcy4jZm9ybWF0W2NvbF0oZFtjb2xdKTtcblx0XHRcdGlmIChzaG91bGRHcmF5b3V0VmFsdWUoc3RyaW5naWZpZWQpKSB7XG5cdFx0XHRcdHRkLmNsYXNzTGlzdC5hZGQoXCJncmF5XCIpO1xuXHRcdFx0fVxuXHRcdFx0bGV0IHZhbHVlID0gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoc3RyaW5naWZpZWQpO1xuXHRcdFx0dGQuYXBwZW5kQ2hpbGQodmFsdWUpO1xuXHRcdH1cblx0XHR0aGlzLiN0Ym9keS5hcHBlbmQoaXRyKTtcblx0fVxufVxuXG5jb25zdCBUUlVOQ0FURSA9IC8qKiBAdHlwZSB7Y29uc3R9ICovICh7XG5cdHdoaXRlU3BhY2U6IFwibm93cmFwXCIsXG5cdG92ZXJmbG93OiBcImhpZGRlblwiLFxuXHR0ZXh0T3ZlcmZsb3c6IFwiZWxsaXBzaXNcIixcbn0pO1xuXG5mdW5jdGlvbiB0aGNvbChcblx0ZmllbGQ6IGFycm93LkZpZWxkLFxuXHRtaW5XaWR0aDogbnVtYmVyLFxuXHR2aXM/OiBDb2x1bW5TdW1tYXJ5Q2xpZW50LFxuKSB7XG5cdGxldCBidXR0b25WaXNpYmxlID0gc2lnbmFscy5zaWduYWwoZmFsc2UpO1xuXHRsZXQgd2lkdGggPSBzaWduYWxzLnNpZ25hbChtaW5XaWR0aCk7XG5cdGxldCBzb3J0U3RhdGU6IHNpZ25hbHMuU2lnbmFsPFwidW5zZXRcIiB8IFwiYXNjXCIgfCBcImRlc2NcIj4gPSBzaWduYWxzLnNpZ25hbChcblx0XHRcInVuc2V0XCIsXG5cdCk7XG5cblx0ZnVuY3Rpb24gbmV4dFNvcnRTdGF0ZSgpIHtcblx0XHQvLyBzaW1wbGUgc3RhdGUgbWFjaGluZVxuXHRcdC8vIHVuc2V0IC0+IGFzYyAtPiBkZXNjIC0+IHVuc2V0XG5cdFx0c29ydFN0YXRlLnZhbHVlID0gKHtcblx0XHRcdFwidW5zZXRcIjogXCJhc2NcIixcblx0XHRcdFwiYXNjXCI6IFwiZGVzY1wiLFxuXHRcdFx0XCJkZXNjXCI6IFwidW5zZXRcIixcblx0XHR9IGFzIGNvbnN0KVtzb3J0U3RhdGUudmFsdWVdO1xuXHR9XG5cblx0Ly8gQGRlbm8tZm10LWlnbm9yZVxuXHRsZXQgc3ZnID0gaHRtbGA8c3ZnIHN0eWxlPSR7eyB3aWR0aDogXCIxLjVlbVwiIH19IGZpbGw9XCJub25lXCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIHN0cm9rZS13aWR0aD1cIjEuNVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiPlxuXHRcdDxwYXRoIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiIGQ9XCJNOC4yNSA5TDEyIDUuMjVMMTUuNzUgOVwiIC8+XG5cdFx0PHBhdGggc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCIgZD1cIk04LjI1IDE1TDEyIDE4Ljc1TDE1Ljc1IDE1XCIgLz5cblx0PC9zdmc+YDtcblx0bGV0IHVwYXJyb3c6IFNWR1BhdGhFbGVtZW50ID0gc3ZnLmNoaWxkcmVuWzBdO1xuXHRsZXQgZG93bmFycm93OiBTVkdQYXRoRWxlbWVudCA9IHN2Zy5jaGlsZHJlblsxXTtcblx0bGV0IHZlcnRpY2FsUmVzaXplSGFuZGxlOiBIVE1MRGl2RWxlbWVudCA9XG5cdFx0aHRtbGA8ZGl2IGNsYXNzPVwicmVzaXplLWhhbmRsZVwiPjwvZGl2PmA7XG5cdC8vIEBkZW5vLWZtdC1pZ25vcmVcblx0bGV0IHNvcnRCdXR0b24gPSBodG1sYDxzcGFuIGFyaWEtcm9sZT1cImJ1dHRvblwiIGNsYXNzPVwic29ydC1idXR0b25cIiBvbm1vdXNlZG93bj0ke25leHRTb3J0U3RhdGV9PiR7c3ZnfTwvc3Bhbj5gO1xuXHQvLyBAZGVuby1mbXQtaWdub3JlXG5cdGxldCB0aDogSFRNTFRhYmxlQ2VsbEVsZW1lbnQgPSBodG1sYDx0aCB0aXRsZT0ke2ZpZWxkLm5hbWV9PlxuXHRcdDxkaXYgc3R5bGU9JHt7IGRpc3BsYXk6IFwiZmxleFwiLCBqdXN0aWZ5Q29udGVudDogXCJzcGFjZS1iZXR3ZWVuXCIsIGFsaWduSXRlbXM6IFwiY2VudGVyXCIgfX0+XG5cdFx0XHQ8c3BhbiBzdHlsZT0ke3sgbWFyZ2luQm90dG9tOiBcIjVweFwiLCBtYXhXaWR0aDogXCIyNTBweFwiLCAuLi5UUlVOQ0FURSB9fT4ke2ZpZWxkLm5hbWV9PC9zcGFuPlxuXHRcdFx0JHtzb3J0QnV0dG9ufVxuXHRcdDwvZGl2PlxuXHRcdCR7dmVydGljYWxSZXNpemVIYW5kbGV9XG5cdFx0PHNwYW4gY2xhc3M9XCJncmF5XCIgc3R5bGU9JHt7IGZvbnRXZWlnaHQ6IDQwMCwgZm9udFNpemU6IFwiMTJweFwiLCB1c2VyU2VsZWN0OiBcIm5vbmVcIiB9fT4ke2Zvcm1hdERhdGFUeXBlTmFtZShmaWVsZC50eXBlKX08L3NwYW4+XG5cdFx0JHt2aXM/LnBsb3Q/Lm5vZGUoKX1cblx0PC90aD5gO1xuXG5cdHNpZ25hbHMuZWZmZWN0KCgpID0+IHtcblx0XHR1cGFycm93LnNldEF0dHJpYnV0ZShcInN0cm9rZVwiLCBcInZhcigtLW1vb24tZ3JheSlcIik7XG5cdFx0ZG93bmFycm93LnNldEF0dHJpYnV0ZShcInN0cm9rZVwiLCBcInZhcigtLW1vb24tZ3JheSlcIik7XG5cdFx0Ly8gQGRlbm8tZm10LWlnbm9yZVxuXHRcdGxldCBlbGVtZW50ID0geyBcImFzY1wiOiB1cGFycm93LCBcImRlc2NcIjogZG93bmFycm93LCBcInVuc2V0XCI6IG51bGwgfVtzb3J0U3RhdGUudmFsdWVdO1xuXHRcdGVsZW1lbnQ/LnNldEF0dHJpYnV0ZShcInN0cm9rZVwiLCBcInZhcigtLWRhcmstZ3JheSlcIik7XG5cdH0pO1xuXG5cdHNpZ25hbHMuZWZmZWN0KCgpID0+IHtcblx0XHRzb3J0QnV0dG9uLnN0eWxlLnZpc2liaWxpdHkgPSBidXR0b25WaXNpYmxlLnZhbHVlID8gXCJ2aXNpYmxlXCIgOiBcImhpZGRlblwiO1xuXHR9KTtcblxuXHRzaWduYWxzLmVmZmVjdCgoKSA9PiB7XG5cdFx0dGguc3R5bGUud2lkdGggPSBgJHt3aWR0aC52YWx1ZX1weGA7XG5cdH0pO1xuXG5cdHRoLmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZW92ZXJcIiwgKCkgPT4ge1xuXHRcdGlmIChzb3J0U3RhdGUudmFsdWUgPT09IFwidW5zZXRcIikgYnV0dG9uVmlzaWJsZS52YWx1ZSA9IHRydWU7XG5cdH0pO1xuXG5cdHRoLmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZWxlYXZlXCIsICgpID0+IHtcblx0XHRpZiAoc29ydFN0YXRlLnZhbHVlID09PSBcInVuc2V0XCIpIGJ1dHRvblZpc2libGUudmFsdWUgPSBmYWxzZTtcblx0fSk7XG5cblx0dGguYWRkRXZlbnRMaXN0ZW5lcihcImRibGNsaWNrXCIsIChldmVudCkgPT4ge1xuXHRcdC8vIHJlc2V0IGNvbHVtbiB3aWR0aCBidXQgd2UgZG9uJ3Qgd2FudCB0byBpbnRlcmZlcmUgd2l0aCBzb21lb25lXG5cdFx0Ly8gZG91YmxlLWNsaWNraW5nIHRoZSBzb3J0IGJ1dHRvblxuXHRcdC8vIGlmIHRoZSBtb3VzZSBpcyB3aXRoaW4gdGhlIHNvcnQgYnV0dG9uLCBkb24ndCByZXNldCB0aGUgd2lkdGhcblx0XHRpZiAoXG5cdFx0XHRldmVudC5vZmZzZXRYIDwgc29ydEJ1dHRvbi5vZmZzZXRXaWR0aCAmJlxuXHRcdFx0ZXZlbnQub2Zmc2V0WSA8IHNvcnRCdXR0b24ub2Zmc2V0SGVpZ2h0XG5cdFx0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHdpZHRoLnZhbHVlID0gbWluV2lkdGg7XG5cdH0pO1xuXG5cdHZlcnRpY2FsUmVzaXplSGFuZGxlLmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZWRvd25cIiwgKGV2ZW50KSA9PiB7XG5cdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRsZXQgc3RhcnRYID0gZXZlbnQuY2xpZW50WDtcblx0XHRsZXQgc3RhcnRXaWR0aCA9IHRoLm9mZnNldFdpZHRoIC1cblx0XHRcdHBhcnNlRmxvYXQoZ2V0Q29tcHV0ZWRTdHlsZSh0aCkucGFkZGluZ0xlZnQpIC1cblx0XHRcdHBhcnNlRmxvYXQoZ2V0Q29tcHV0ZWRTdHlsZSh0aCkucGFkZGluZ1JpZ2h0KTtcblx0XHRmdW5jdGlvbiBvbk1vdXNlTW92ZSgvKiogQHR5cGUge01vdXNlRXZlbnR9ICovIGV2ZW50OiBNb3VzZUV2ZW50KSB7XG5cdFx0XHRsZXQgZHggPSBldmVudC5jbGllbnRYIC0gc3RhcnRYO1xuXHRcdFx0d2lkdGgudmFsdWUgPSBNYXRoLm1heChtaW5XaWR0aCwgc3RhcnRXaWR0aCArIGR4KTtcblx0XHRcdHZlcnRpY2FsUmVzaXplSGFuZGxlLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IFwidmFyKC0tbGlnaHQtc2lsdmVyKVwiO1xuXHRcdH1cblx0XHRmdW5jdGlvbiBvbk1vdXNlVXAoKSB7XG5cdFx0XHR2ZXJ0aWNhbFJlc2l6ZUhhbmRsZS5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBcInRyYW5zcGFyZW50XCI7XG5cdFx0XHRkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKFwibW91c2Vtb3ZlXCIsIG9uTW91c2VNb3ZlKTtcblx0XHRcdGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtb3VzZXVwXCIsIG9uTW91c2VVcCk7XG5cdFx0fVxuXHRcdGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZW1vdmVcIiwgb25Nb3VzZU1vdmUpO1xuXHRcdGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZXVwXCIsIG9uTW91c2VVcCk7XG5cdH0pO1xuXG5cdHZlcnRpY2FsUmVzaXplSGFuZGxlLmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZW92ZXJcIiwgKCkgPT4ge1xuXHRcdHZlcnRpY2FsUmVzaXplSGFuZGxlLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IFwidmFyKC0tbGlnaHQtc2lsdmVyKVwiO1xuXHR9KTtcblxuXHR2ZXJ0aWNhbFJlc2l6ZUhhbmRsZS5hZGRFdmVudExpc3RlbmVyKFwibW91c2VsZWF2ZVwiLCAoKSA9PiB7XG5cdFx0dmVydGljYWxSZXNpemVIYW5kbGUuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gXCJ0cmFuc3BhcmVudFwiO1xuXHR9KTtcblxuXHRyZXR1cm4gT2JqZWN0LmFzc2lnbih0aCwgeyB2aXMsIHNvcnRTdGF0ZSB9KTtcbn1cblxuY29uc3QgU1RZTEVTID0gLypjc3MqLyBgXFxcbjpob3N0IHtcbiAgYWxsOiBpbml0aWFsO1xuICAtLXNhbnMtc2VyaWY6IC1hcHBsZS1zeXN0ZW0sIEJsaW5rTWFjU3lzdGVtRm9udCwgXCJhdmVuaXIgbmV4dFwiLCBhdmVuaXIsIGhlbHZldGljYSwgXCJoZWx2ZXRpY2EgbmV1ZVwiLCB1YnVudHUsIHJvYm90bywgbm90bywgXCJzZWdvZSB1aVwiLCBhcmlhbCwgc2Fucy1zZXJpZjtcbiAgLS1saWdodC1zaWx2ZXI6ICNlZmVmZWY7XG4gIC0tc3BhY2luZy1ub25lOiAwO1xuICAtLXdoaXRlOiAjZmZmO1xuICAtLWdyYXk6ICM5MjkyOTI7XG4gIC0tZGFyay1ncmF5OiAjMzMzO1xuICAtLW1vb24tZ3JheTogI2M0YzRjNDtcbiAgLS1taWQtZ3JheTogIzZlNmU2ZTtcbn1cblxuLmhpZ2hsaWdodCB7XG5cdGJhY2tncm91bmQtY29sb3I6IHZhcigtLWxpZ2h0LXNpbHZlcik7XG59XG5cbi5oaWdobGlnaHQtY2VsbCB7XG5cdGJvcmRlcjogMXB4IHNvbGlkIHZhcigtLW1vb24tZ3JheSk7XG59XG5cbi5xdWFrIHtcbiAgYm9yZGVyLXJhZGl1czogMC4ycmVtO1xuICBib3JkZXI6IDFweCBzb2xpZCB2YXIoLS1saWdodC1zaWx2ZXIpO1xuICBvdmVyZmxvdy15OiBhdXRvO1xufVxuXG50YWJsZSB7XG4gIGJvcmRlci1jb2xsYXBzZTogc2VwYXJhdGU7XG4gIGJvcmRlci1zcGFjaW5nOiAwO1xuICB3aGl0ZS1zcGFjZTogbm93cmFwO1xuICBib3gtc2l6aW5nOiBib3JkZXItYm94O1xuXG4gIG1hcmdpbjogdmFyKC0tc3BhY2luZy1ub25lKTtcbiAgY29sb3I6IHZhcigtLWRhcmstZ3JheSk7XG4gIGZvbnQ6IDEzcHggLyAxLjIgdmFyKC0tc2Fucy1zZXJpZik7XG5cbiAgd2lkdGg6IDEwMCU7XG59XG5cbnRoZWFkIHtcbiAgcG9zaXRpb246IHN0aWNreTtcbiAgdmVydGljYWwtYWxpZ246IHRvcDtcbiAgdGV4dC1hbGlnbjogbGVmdDtcbiAgdG9wOiAwO1xufVxuXG50ZCB7XG4gIGJvcmRlcjogMXB4IHNvbGlkIHZhcigtLWxpZ2h0LXNpbHZlcik7XG4gIGJvcmRlci1ib3R0b206IHNvbGlkIDFweCB0cmFuc3BhcmVudDtcbiAgYm9yZGVyLXJpZ2h0OiBzb2xpZCAxcHggdHJhbnNwYXJlbnQ7XG4gIG92ZXJmbG93OiBoaWRkZW47XG4gIC1vLXRleHQtb3ZlcmZsb3c6IGVsbGlwc2lzO1xuICB0ZXh0LW92ZXJmbG93OiBlbGxpcHNpcztcbiAgcGFkZGluZzogNHB4IDZweDtcbn1cblxudHI6Zmlyc3QtY2hpbGQgdGQge1xuICBib3JkZXItdG9wOiBzb2xpZCAxcHggdHJhbnNwYXJlbnQ7XG59XG5cbnRoIHtcbiAgZGlzcGxheTogdGFibGUtY2VsbDtcbiAgdmVydGljYWwtYWxpZ246IGluaGVyaXQ7XG4gIGZvbnQtd2VpZ2h0OiBib2xkO1xuICB0ZXh0LWFsaWduOiAtaW50ZXJuYWwtY2VudGVyO1xuICB1bmljb2RlLWJpZGk6IGlzb2xhdGU7XG5cbiAgcG9zaXRpb246IHJlbGF0aXZlO1xuICBiYWNrZ3JvdW5kOiB2YXIoLS13aGl0ZSk7XG4gIGJvcmRlci1ib3R0b206IHNvbGlkIDFweCB2YXIoLS1saWdodC1zaWx2ZXIpO1xuICBib3JkZXItbGVmdDogc29saWQgMXB4IHZhcigtLWxpZ2h0LXNpbHZlcik7XG4gIHBhZGRpbmc6IDVweCA2cHggMCA2cHg7XG59XG5cbi5udW1iZXIsIC5kYXRlIHtcbiAgZm9udC12YXJpYW50LW51bWVyaWM6IHRhYnVsYXItbnVtcztcbn1cblxuLmdyYXkge1xuICBjb2xvcjogdmFyKC0tZ3JheSk7XG59XG5cbi5udW1iZXIge1xuICB0ZXh0LWFsaWduOiByaWdodDtcbn1cblxudGQ6bnRoLWNoaWxkKDEpLCB0aDpudGgtY2hpbGQoMSkge1xuICBmb250LXZhcmlhbnQtbnVtZXJpYzogdGFidWxhci1udW1zO1xuICB0ZXh0LWFsaWduOiBjZW50ZXI7XG4gIGNvbG9yOiB2YXIoLS1tb29uLWdyYXkpO1xuICBwYWRkaW5nOiAwIDRweDtcbn1cblxudGQ6Zmlyc3QtY2hpbGQsIHRoOmZpcnN0LWNoaWxkIHtcbiAgYm9yZGVyLWxlZnQ6IG5vbmU7XG59XG5cbnRoOmZpcnN0LWNoaWxkIHtcbiAgYm9yZGVyLWxlZnQ6IG5vbmU7XG4gIHZlcnRpY2FsLWFsaWduOiB0b3A7XG4gIHdpZHRoOiAyMHB4O1xuICBwYWRkaW5nOiA3cHg7XG59XG5cbnRkOm50aC1sYXN0LWNoaWxkKDIpLCB0aDpudGgtbGFzdC1jaGlsZCgyKSB7XG4gIGJvcmRlci1yaWdodDogMXB4IHNvbGlkIHZhcigtLWxpZ2h0LXNpbHZlcik7XG59XG5cbnRyOmZpcnN0LWNoaWxkIHRkIHtcblx0Ym9yZGVyLXRvcDogc29saWQgMXB4IHRyYW5zcGFyZW50O1xufVxuXG4ucmVzaXplLWhhbmRsZSB7XG5cdHdpZHRoOiA1cHg7XG5cdGhlaWdodDogMTAwJTtcblx0YmFja2dyb3VuZC1jb2xvcjogdHJhbnNwYXJlbnQ7XG5cdHBvc2l0aW9uOiBhYnNvbHV0ZTtcblx0cmlnaHQ6IC0yLjVweDtcblx0dG9wOiAwO1xuXHRjdXJzb3I6IGV3LXJlc2l6ZTtcblx0ei1pbmRleDogMTtcbn1cblxuLnNvcnQtYnV0dG9uIHtcblx0Y3Vyc29yOiBwb2ludGVyO1xuXHRiYWNrZ3JvdW5kLWNvbG9yOiB2YXIoLS13aGl0ZSk7XG5cdHVzZXItc2VsZWN0OiBub25lO1xufVxuYDtcblxuLyoqXG4gKiBSZXR1cm4gYSBmb3JtYXR0ZXIgZm9yIGVhY2ggZmllbGQgaW4gdGhlIHNjaGVtYVxuICovXG5mdW5jdGlvbiBmb3JtYXRvZihzY2hlbWE6IGFycm93LlNjaGVtYSkge1xuXHRjb25zdCBmb3JtYXQ6IFJlY29yZDxzdHJpbmcsICh2YWx1ZTogdW5rbm93bikgPT4gc3RyaW5nPiA9IE9iamVjdC5jcmVhdGUoXG5cdFx0bnVsbCxcblx0KTtcblx0Zm9yIChjb25zdCBmaWVsZCBvZiBzY2hlbWEuZmllbGRzKSB7XG5cdFx0Zm9ybWF0W2ZpZWxkLm5hbWVdID0gZm9ybWF0dGVyRm9yRGF0YVR5cGVWYWx1ZShmaWVsZC50eXBlKTtcblx0fVxuXHRyZXR1cm4gZm9ybWF0O1xufVxuXG4vKipcbiAqIFJldHVybiBhIGNsYXNzIHR5cGUgb2YgZWFjaCBmaWVsZCBpbiB0aGUgc2NoZW1hLlxuICovXG5mdW5jdGlvbiBjbGFzc29mKHNjaGVtYTogYXJyb3cuU2NoZW1hKTogUmVjb3JkPHN0cmluZywgXCJudW1iZXJcIiB8IFwiZGF0ZVwiPiB7XG5cdGNvbnN0IGNsYXNzZXM6IFJlY29yZDxzdHJpbmcsIFwibnVtYmVyXCIgfCBcImRhdGVcIj4gPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRmb3IgKGNvbnN0IGZpZWxkIG9mIHNjaGVtYS5maWVsZHMpIHtcblx0XHRpZiAoXG5cdFx0XHRhcnJvdy5EYXRhVHlwZS5pc0ludChmaWVsZC50eXBlKSB8fFxuXHRcdFx0YXJyb3cuRGF0YVR5cGUuaXNGbG9hdChmaWVsZC50eXBlKVxuXHRcdCkge1xuXHRcdFx0Y2xhc3Nlc1tmaWVsZC5uYW1lXSA9IFwibnVtYmVyXCI7XG5cdFx0fVxuXHRcdGlmIChcblx0XHRcdGFycm93LkRhdGFUeXBlLmlzRGF0ZShmaWVsZC50eXBlKSB8fFxuXHRcdFx0YXJyb3cuRGF0YVR5cGUuaXNUaW1lc3RhbXAoZmllbGQudHlwZSlcblx0XHQpIHtcblx0XHRcdGNsYXNzZXNbZmllbGQubmFtZV0gPSBcImRhdGVcIjtcblx0XHR9XG5cdH1cblx0cmV0dXJuIGNsYXNzZXM7XG59XG5cbmZ1bmN0aW9uIGhpZ2hsaWdodChjZWxsOiBIVE1MVGFibGVDZWxsRWxlbWVudCwgcm93OiBIVE1MVGFibGVSb3dFbGVtZW50KSB7XG5cdGlmIChyb3cuZmlyc3RDaGlsZCAhPT0gY2VsbCAmJiBjZWxsICE9PSByb3cubGFzdEVsZW1lbnRDaGlsZCkge1xuXHRcdGNlbGwuc3R5bGUuYm9yZGVyID0gXCIxcHggc29saWQgdmFyKC0tbW9vbi1ncmF5KVwiO1xuXHR9XG5cdHJvdy5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBcInZhcigtLWxpZ2h0LXNpbHZlcilcIjtcbn1cblxuZnVuY3Rpb24gcmVtb3ZlSGlnaGxpZ2h0KGNlbGw6IEhUTUxUYWJsZUNlbGxFbGVtZW50LCByb3c6IEhUTUxUYWJsZVJvd0VsZW1lbnQpIHtcblx0Y2VsbC5zdHlsZS5yZW1vdmVQcm9wZXJ0eShcImJvcmRlclwiKTtcblx0cm93LnN0eWxlLnJlbW92ZVByb3BlcnR5KFwiYmFja2dyb3VuZC1jb2xvclwiKTtcbn1cblxuZnVuY3Rpb24gaXNUYWJsZUNlbGxFbGVtZW50KG5vZGU6IHVua25vd24pOiBub2RlIGlzIEhUTUxUYWJsZURhdGFDZWxsRWxlbWVudCB7XG5cdC8vIEB0cy1leHBlY3QtZXJyb3IgLSB0YWdOYW1lIGlzIG5vdCBkZWZpbmVkIG9uIHVua25vd25cblx0cmV0dXJuIG5vZGU/LnRhZ05hbWUgPT09IFwiVERcIjtcbn1cblxuZnVuY3Rpb24gaXNUYWJsZVJvd0VsZW1lbnQobm9kZTogdW5rbm93bik6IG5vZGUgaXMgSFRNTFRhYmxlUm93RWxlbWVudCB7XG5cdHJldHVybiBub2RlIGluc3RhbmNlb2YgSFRNTFRhYmxlUm93RWxlbWVudDtcbn1cblxuLyoqIEBwYXJhbSB7c3RyaW5nfSB2YWx1ZSAqL1xuZnVuY3Rpb24gc2hvdWxkR3JheW91dFZhbHVlKHZhbHVlOiBzdHJpbmcpIHtcblx0cmV0dXJuIChcblx0XHR2YWx1ZSA9PT0gXCJudWxsXCIgfHxcblx0XHR2YWx1ZSA9PT0gXCJ1bmRlZmluZWRcIiB8fFxuXHRcdHZhbHVlID09PSBcIk5hTlwiIHx8XG5cdFx0dmFsdWUgPT09IFwiVE9ET1wiXG5cdCk7XG59XG5cbmZ1bmN0aW9uIGlzVGFibGVDb2x1bW5IZWFkZXJXaXRoU3ZnKFxuXHRub2RlOiB1bmtub3duLFxuKTogbm9kZSBpcyBSZXR1cm5UeXBlPHR5cGVvZiB0aGNvbD4ge1xuXHRyZXR1cm4gbm9kZSBpbnN0YW5jZW9mIEhUTUxUYWJsZUNlbGxFbGVtZW50ICYmIFwidmlzXCIgaW4gbm9kZTtcbn1cblxuLyoqXG4gKiBBIG1vc2FpYyBTUUwgZXhwcmVzc2lvbiBmb3IgYXNjZW5kaW5nIG9yZGVyXG4gKlxuICogVGhlIG5vcm1hbCBiZWhhdmlvciBpbiBTUUwgaXMgdG8gc29ydCBudWxscyBmaXJzdCB3aGVuIHNvcnRpbmcgaW4gYXNjZW5kaW5nIG9yZGVyLlxuICogVGhpcyBmdW5jdGlvbiByZXR1cm5zIGFuIGV4cHJlc3Npb24gdGhhdCBzb3J0cyBudWxscyBsYXN0IChpLmUuLCBgTlVMTFMgTEFTVGApLFxuICogbGlrZSB0aGUgYGRlc2NgIGZ1bmN0aW9uLlxuICpcbiAqIEBwYXJhbSBmaWVsZFxuICovXG5mdW5jdGlvbiBhc2MoZmllbGQ6IHN0cmluZyk6IFNRTEV4cHJlc3Npb24ge1xuXHQvLyBkb2Vzbid0IHNvcnQgbnVsbHMgZm9yIGFzY1xuXHRsZXQgZXhwciA9IGRlc2MoZmllbGQpO1xuXHQvLyBAdHMtZXhwZWN0LWVycm9yIC0gcHJpdmF0ZSBmaWVsZFxuXHRleHByLl9leHByWzBdID0gZXhwci5fZXhwclswXS5yZXBsYWNlKFwiREVTQ1wiLCBcIkFTQ1wiKTtcblx0cmV0dXJuIGV4cHI7XG59XG4iLCAiLyoqXG4gKiBFcnJvciB0aHJvd24gd2hlbiBhbiBhc3NlcnRpb24gZmFpbHMuXG4gKi9cbmV4cG9ydCBjbGFzcyBBc3NlcnRpb25FcnJvciBleHRlbmRzIEVycm9yIHtcblx0LyoqIEBwYXJhbSBtZXNzYWdlIFRoZSBlcnJvciBtZXNzYWdlLiAqL1xuXHRjb25zdHJ1Y3RvcihtZXNzYWdlOiBzdHJpbmcpIHtcblx0XHRzdXBlcihtZXNzYWdlKTtcblx0XHR0aGlzLm5hbWUgPSBcIkFzc2VydGlvbkVycm9yXCI7XG5cdH1cbn1cblxuLyoqXG4gKiBNYWtlIGFuIGFzc2VydGlvbi4gQW4gZXJyb3IgaXMgdGhyb3duIGlmIGBleHByYCBkb2VzIG5vdCBoYXZlIHRydXRoeSB2YWx1ZS5cbiAqXG4gKiBAcGFyYW0gZXhwciBUaGUgZXhwcmVzc2lvbiB0byB0ZXN0LlxuICogQHBhcmFtIG1zZyBUaGUgbWVzc2FnZSB0byBkaXNwbGF5IGlmIHRoZSBhc3NlcnRpb24gZmFpbHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhc3NlcnQoZXhwcjogdW5rbm93biwgbXNnID0gXCJcIik6IGFzc2VydHMgZXhwciB7XG5cdGlmICghZXhwcikge1xuXHRcdHRocm93IG5ldyBBc3NlcnRpb25FcnJvcihtc2cpO1xuXHR9XG59XG4iLCAiaW1wb3J0IHsgYXNzZXJ0IH0gZnJvbSBcIi4vYXNzZXJ0LnRzXCI7XG5cbmV4cG9ydCBjbGFzcyBBc3luY0JhdGNoUmVhZGVyPFQ+IHtcblx0LyoqIHRoZSBpdGVyYWJsZSBiYXRjaGVzIHRvIHJlYWQgKi9cblx0I2JhdGNoZXM6IEFycmF5PHsgZGF0YTogSXRlcmF0b3I8VD47IGxhc3Q6IGJvb2xlYW4gfT4gPSBbXTtcblx0LyoqIHRoZSBpbmRleCBvZiB0aGUgY3VycmVudCByb3cgKi9cblx0I2luZGV4OiBudW1iZXIgPSAwO1xuXHQvKiogcmVzb2x2ZXMgYSBwcm9taXNlIGZvciB3aGVuIHRoZSBuZXh0IGJhdGNoIGlzIGF2YWlsYWJsZSAqL1xuXHQjcmVzb2x2ZTogKCgpID0+IHZvaWQpIHwgbnVsbCA9IG51bGw7XG5cdC8qKiB0aGUgY3VycmVudCBiYXRjaCAqL1xuXHQjY3VycmVudDogeyBkYXRhOiBJdGVyYXRvcjxUPjsgbGFzdDogYm9vbGVhbiB9IHwgbnVsbCA9IG51bGw7XG5cdC8qKiBBIGZ1bmN0aW9uIHRvIHJlcXVlc3QgbW9yZSBkYXRhLiAqL1xuXHQjcmVxdWVzdE5leHRCYXRjaDogKCkgPT4gdm9pZDtcblx0LyoqXG5cdCAqIEBwYXJhbSByZXF1ZXN0TmV4dEJhdGNoIC0gYSBmdW5jdGlvbiB0byByZXF1ZXN0IG1vcmUgZGF0YS4gV2hlblxuXHQgKiB0aGlzIGZ1bmN0aW9uIGNvbXBsZXRlcywgaXQgc2hvdWxkIGVucXVldWUgdGhlIG5leHQgYmF0Y2gsIG90aGVyd2lzZSB0aGVcblx0ICogcmVhZGVyIHdpbGwgYmUgc3R1Y2suXG5cdCAqL1xuXHRjb25zdHJ1Y3RvcihyZXF1ZXN0TmV4dEJhdGNoOiAoKSA9PiB2b2lkKSB7XG5cdFx0dGhpcy4jcmVxdWVzdE5leHRCYXRjaCA9IHJlcXVlc3ROZXh0QmF0Y2g7XG5cdH1cblx0LyoqXG5cdCAqIEVucXVldWUgYSBiYXRjaCBvZiBkYXRhXG5cdCAqXG5cdCAqIFRoZSBsYXN0IGJhdGNoIHNob3VsZCBoYXZlIGBsYXN0OiB0cnVlYCBzZXQsXG5cdCAqIHNvIHRoZSByZWFkZXIgY2FuIHRlcm1pbmF0ZSB3aGVuIGl0IGhhc1xuXHQgKiBleGhhdXN0ZWQgYWxsIHRoZSBkYXRhLlxuXHQgKlxuXHQgKiBAcGFyYW0gYmF0Y2ggLSB0aGUgYmF0Y2ggb2YgZGF0YSB0byBlbnF1ZXVlXG5cdCAqIEBwYXJhbSBvcHRpb25zXG5cdCAqIEBwYXJhbSBvcHRpb25zLmxhc3QgLSB3aGV0aGVyIHRoaXMgaXMgdGhlIGxhc3QgYmF0Y2hcblx0ICovXG5cdGVucXVldWVCYXRjaChiYXRjaDogSXRlcmF0b3I8VD4sIHsgbGFzdCB9OiB7IGxhc3Q6IGJvb2xlYW4gfSkge1xuXHRcdHRoaXMuI2JhdGNoZXMucHVzaCh7IGRhdGE6IGJhdGNoLCBsYXN0IH0pO1xuXHRcdGlmICh0aGlzLiNyZXNvbHZlKSB7XG5cdFx0XHR0aGlzLiNyZXNvbHZlKCk7XG5cdFx0XHR0aGlzLiNyZXNvbHZlID0gbnVsbDtcblx0XHR9XG5cdH1cblx0YXN5bmMgbmV4dCgpOiBQcm9taXNlPEl0ZXJhdG9yUmVzdWx0PHsgcm93OiBUOyBpbmRleDogbnVtYmVyIH0+PiB7XG5cdFx0aWYgKCF0aGlzLiNjdXJyZW50KSB7XG5cdFx0XHRpZiAodGhpcy4jYmF0Y2hlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0LyoqIEB0eXBlIHtQcm9taXNlPHZvaWQ+fSAqL1xuXHRcdFx0XHRsZXQgcHJvbWlzZTogUHJvbWlzZTx2b2lkPiA9IG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy4jcmVzb2x2ZSA9IHJlc29sdmU7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0aGlzLiNyZXF1ZXN0TmV4dEJhdGNoKCk7XG5cdFx0XHRcdGF3YWl0IHByb21pc2U7XG5cdFx0XHR9XG5cdFx0XHRsZXQgbmV4dCA9IHRoaXMuI2JhdGNoZXMuc2hpZnQoKTtcblx0XHRcdGFzc2VydChuZXh0LCBcIk5vIG5leHQgYmF0Y2hcIik7XG5cdFx0XHR0aGlzLiNjdXJyZW50ID0gbmV4dDtcblx0XHR9XG5cdFx0bGV0IHJlc3VsdCA9IHRoaXMuI2N1cnJlbnQuZGF0YS5uZXh0KCk7XG5cdFx0aWYgKHJlc3VsdC5kb25lKSB7XG5cdFx0XHRpZiAodGhpcy4jY3VycmVudC5sYXN0KSB7XG5cdFx0XHRcdHJldHVybiB7IGRvbmU6IHRydWUsIHZhbHVlOiB1bmRlZmluZWQgfTtcblx0XHRcdH1cblx0XHRcdHRoaXMuI2N1cnJlbnQgPSBudWxsO1xuXHRcdFx0cmV0dXJuIHRoaXMubmV4dCgpO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZG9uZTogZmFsc2UsXG5cdFx0XHR2YWx1ZTogeyByb3c6IHJlc3VsdC52YWx1ZSwgaW5kZXg6IHRoaXMuI2luZGV4KysgfSxcblx0XHR9O1xuXHR9XG59XG4iLCAiaW1wb3J0IHsgVGVtcG9yYWwgfSBmcm9tIFwiQGpzLXRlbXBvcmFsL3BvbHlmaWxsXCI7XG5pbXBvcnQgKiBhcyBhcnJvdyBmcm9tIFwiYXBhY2hlLWFycm93XCI7XG5cbi8qKlxuICogQSB1dGlsaXR5IGZ1bmN0aW9uIHRvIGNyZWF0ZSBhIGZvcm1hdHRlciBmb3IgYSBnaXZlbiBkYXRhIHR5cGUuXG4gKlxuICogVGhlIGRhdGF0eXBlIGlzIG9ubHkgdXNlZCBmb3IgdHlwZSBpbmZlcmVuY2UgdG8gZW5zdXJlIHRoYXQgdGhlIGZvcm1hdHRlciBpc1xuICogY29ycmVjdGx5IHR5cGVkLlxuICovXG5mdW5jdGlvbiBmbXQ8VFZhbHVlPihcblx0X2Fycm93RGF0YVR5cGVWYWx1ZTogVFZhbHVlLFxuXHRmb3JtYXQ6ICh2YWx1ZTogVFZhbHVlKSA9PiBzdHJpbmcsXG5cdGxvZyA9IGZhbHNlLFxuKTogKHZhbHVlOiBUVmFsdWUgfCBudWxsIHwgdW5kZWZpbmVkKSA9PiBzdHJpbmcge1xuXHRyZXR1cm4gKHZhbHVlKSA9PiB7XG5cdFx0aWYgKGxvZykgY29uc29sZS5sb2codmFsdWUpO1xuXHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gc3RyaW5naWZ5KHZhbHVlKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZvcm1hdCh2YWx1ZSk7XG5cdH07XG59XG5cbmZ1bmN0aW9uIHN0cmluZ2lmeSh4OiB1bmtub3duKTogc3RyaW5nIHtcblx0cmV0dXJuIGAke3h9YDtcbn1cblxuLyoqIEBwYXJhbSB7YXJyb3cuRGF0YVR5cGV9IHR5cGUgKi9cbmV4cG9ydCBmdW5jdGlvbiBmb3JtYXREYXRhVHlwZU5hbWUodHlwZTogYXJyb3cuRGF0YVR5cGUpIHtcblx0Ly8gc3BlY2lhbCBjYXNlIHNvbWUgdHlwZXNcblx0aWYgKGFycm93LkRhdGFUeXBlLmlzTGFyZ2VCaW5hcnkodHlwZSkpIHJldHVybiBcImxhcmdlIGJpbmFyeVwiO1xuXHRpZiAoYXJyb3cuRGF0YVR5cGUuaXNMYXJnZVV0ZjgodHlwZSkpIHJldHVybiBcImxhcmdlIHV0ZjhcIjtcblx0Ly8gb3RoZXJ3aXNlLCBqdXN0IHN0cmluZ2lmeSBhbmQgbG93ZXJjYXNlXG5cdHJldHVybiB0eXBlXG5cdFx0LnRvU3RyaW5nKClcblx0XHQudG9Mb3dlckNhc2UoKVxuXHRcdC5yZXBsYWNlKFwiPHNlY29uZD5cIiwgXCJbc11cIilcblx0XHQucmVwbGFjZShcIjxtaWxsaXNlY29uZD5cIiwgXCJbbXNdXCIpXG5cdFx0LnJlcGxhY2UoXCI8bWljcm9zZWNvbmQ+XCIsIFwiW1x1MDBCNXNdXCIpXG5cdFx0LnJlcGxhY2UoXCI8bmFub3NlY29uZD5cIiwgXCJbbnNdXCIpXG5cdFx0LnJlcGxhY2UoXCI8ZGF5PlwiLCBcIltkYXldXCIpXG5cdFx0LnJlcGxhY2UoXCJkaWN0aW9uYXJ5PFwiLCBcImRpY3Q8XCIpO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7YXJyb3cuRGF0YVR5cGV9IHR5cGVcbiAqIEByZXR1cm5zIHsodmFsdWU6IGFueSkgPT4gc3RyaW5nfVxuICovXG5leHBvcnQgZnVuY3Rpb24gZm9ybWF0dGVyRm9yRGF0YVR5cGVWYWx1ZShcblx0dHlwZTogYXJyb3cuRGF0YVR5cGUsXG5cdC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4pOiAodmFsdWU6IGFueSkgPT4gc3RyaW5nIHtcblx0aWYgKGFycm93LkRhdGFUeXBlLmlzTnVsbCh0eXBlKSkge1xuXHRcdHJldHVybiBmbXQodHlwZS5UVmFsdWUsIHN0cmluZ2lmeSk7XG5cdH1cblxuXHRpZiAoXG5cdFx0YXJyb3cuRGF0YVR5cGUuaXNJbnQodHlwZSkgfHxcblx0XHRhcnJvdy5EYXRhVHlwZS5pc0Zsb2F0KHR5cGUpXG5cdCkge1xuXHRcdHJldHVybiBmbXQodHlwZS5UVmFsdWUsICh2YWx1ZSkgPT4ge1xuXHRcdFx0aWYgKE51bWJlci5pc05hTih2YWx1ZSkpIHJldHVybiBcIk5hTlwiO1xuXHRcdFx0cmV0dXJuIHZhbHVlID09PSAwID8gXCIwXCIgOiB2YWx1ZS50b0xvY2FsZVN0cmluZyhcImVuXCIpOyAvLyBoYW5kbGUgbmVnYXRpdmUgemVyb1xuXHRcdH0pO1xuXHR9XG5cblx0aWYgKFxuXHRcdGFycm93LkRhdGFUeXBlLmlzQmluYXJ5KHR5cGUpIHx8XG5cdFx0YXJyb3cuRGF0YVR5cGUuaXNGaXhlZFNpemVCaW5hcnkodHlwZSkgfHxcblx0XHRhcnJvdy5EYXRhVHlwZS5pc0xhcmdlQmluYXJ5KHR5cGUpXG5cdCkge1xuXHRcdHJldHVybiBmbXQodHlwZS5UVmFsdWUsIChieXRlcykgPT4ge1xuXHRcdFx0bGV0IG1heGxlbiA9IDMyO1xuXHRcdFx0bGV0IHJlc3VsdCA9IFwiYidcIjtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgTWF0aC5taW4oYnl0ZXMubGVuZ3RoLCBtYXhsZW4pOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgYnl0ZSA9IGJ5dGVzW2ldO1xuXHRcdFx0XHRpZiAoYnl0ZSA+PSAzMiAmJiBieXRlIDw9IDEyNikge1xuXHRcdFx0XHRcdC8vIEFTQ0lJIHByaW50YWJsZSBjaGFyYWN0ZXJzIHJhbmdlIGZyb20gMzIgKHNwYWNlKSB0byAxMjYgKH4pXG5cdFx0XHRcdFx0cmVzdWx0ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnl0ZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzdWx0ICs9IFwiXFxcXHhcIiArIChcIjAwXCIgKyBieXRlLnRvU3RyaW5nKDE2KSkuc2xpY2UoLTIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoYnl0ZXMubGVuZ3RoID4gbWF4bGVuKSByZXN1bHQgKz0gXCIuLi5cIjtcblx0XHRcdHJlc3VsdCArPSBcIidcIjtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSk7XG5cdH1cblxuXHRpZiAoYXJyb3cuRGF0YVR5cGUuaXNVdGY4KHR5cGUpIHx8IGFycm93LkRhdGFUeXBlLmlzTGFyZ2VVdGY4KHR5cGUpKSB7XG5cdFx0cmV0dXJuIGZtdCh0eXBlLlRWYWx1ZSwgKHRleHQpID0+IHRleHQpO1xuXHR9XG5cblx0aWYgKGFycm93LkRhdGFUeXBlLmlzQm9vbCh0eXBlKSkge1xuXHRcdHJldHVybiBmbXQodHlwZS5UVmFsdWUsIHN0cmluZ2lmeSk7XG5cdH1cblxuXHRpZiAoYXJyb3cuRGF0YVR5cGUuaXNEZWNpbWFsKHR5cGUpKSB7XG5cdFx0cmV0dXJuIGZtdCh0eXBlLlRWYWx1ZSwgKCkgPT4gXCJUT0RPXCIpO1xuXHR9XG5cblx0aWYgKGFycm93LkRhdGFUeXBlLmlzRGF0ZSh0eXBlKSkge1xuXHRcdHJldHVybiBmbXQodHlwZS5UVmFsdWUsIChtcykgPT4ge1xuXHRcdFx0Ly8gQWx3YXlzIHJldHVybnMgdmFsdWUgaW4gbWlsbGlzZWNvbmRzXG5cdFx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vYXBhY2hlL2Fycm93L2Jsb2IvODlkNjM1NDA2OGMxMWE2NmZjZWMyZjM0ZDA0MTRkYWNhMzI3ZTJlMC9qcy9zcmMvdmlzaXRvci9nZXQudHMjTDE2Ny1MMTcxXG5cdFx0XHRyZXR1cm4gVGVtcG9yYWwuSW5zdGFudFxuXHRcdFx0XHQuZnJvbUVwb2NoTWlsbGlzZWNvbmRzKG1zKVxuXHRcdFx0XHQudG9ab25lZERhdGVUaW1lSVNPKFwiVVRDXCIpXG5cdFx0XHRcdC50b1BsYWluRGF0ZSgpXG5cdFx0XHRcdC50b1N0cmluZygpO1xuXHRcdH0pO1xuXHR9XG5cblx0aWYgKGFycm93LkRhdGFUeXBlLmlzVGltZSh0eXBlKSkge1xuXHRcdHJldHVybiBmbXQodHlwZS5UVmFsdWUsIChtcykgPT4ge1xuXHRcdFx0cmV0dXJuIGluc3RhbnRGcm9tVGltZVVuaXQobXMsIHR5cGUudW5pdClcblx0XHRcdFx0LnRvWm9uZWREYXRlVGltZUlTTyhcIlVUQ1wiKVxuXHRcdFx0XHQudG9QbGFpblRpbWUoKVxuXHRcdFx0XHQudG9TdHJpbmcoKTtcblx0XHR9KTtcblx0fVxuXG5cdGlmIChhcnJvdy5EYXRhVHlwZS5pc1RpbWVzdGFtcCh0eXBlKSkge1xuXHRcdHJldHVybiBmbXQodHlwZS5UVmFsdWUsIChtcykgPT4ge1xuXHRcdFx0Ly8gQWx3YXlzIHJldHVybnMgdmFsdWUgaW4gbWlsbGlzZWNvbmRzXG5cdFx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vYXBhY2hlL2Fycm93L2Jsb2IvODlkNjM1NDA2OGMxMWE2NmZjZWMyZjM0ZDA0MTRkYWNhMzI3ZTJlMC9qcy9zcmMvdmlzaXRvci9nZXQudHMjTDE3My1MMTkwXG5cdFx0XHRyZXR1cm4gVGVtcG9yYWwuSW5zdGFudFxuXHRcdFx0XHQuZnJvbUVwb2NoTWlsbGlzZWNvbmRzKG1zKVxuXHRcdFx0XHQudG9ab25lZERhdGVUaW1lSVNPKFwiVVRDXCIpXG5cdFx0XHRcdC50b1BsYWluRGF0ZVRpbWUoKVxuXHRcdFx0XHQudG9TdHJpbmcoKTtcblx0XHR9KTtcblx0fVxuXG5cdGlmIChhcnJvdy5EYXRhVHlwZS5pc0ludGVydmFsKHR5cGUpKSB7XG5cdFx0cmV0dXJuIGZtdCh0eXBlLlRWYWx1ZSwgKF92YWx1ZSkgPT4ge1xuXHRcdFx0cmV0dXJuIFwiVE9ET1wiO1xuXHRcdH0pO1xuXHR9XG5cblx0aWYgKGFycm93LkRhdGFUeXBlLmlzRHVyYXRpb24odHlwZSkpIHtcblx0XHRyZXR1cm4gZm10KHR5cGUuVFZhbHVlLCAoYmlnaW50VmFsdWUpID0+IHtcblx0XHRcdC8vIGh0dHBzOi8vdGMzOS5lcy9wcm9wb3NhbC10ZW1wb3JhbC9kb2NzL2R1cmF0aW9uLmh0bWwjdG9TdHJpbmdcblx0XHRcdHJldHVybiBkdXJhdGlvbkZyb21UaW1lVW5pdChiaWdpbnRWYWx1ZSwgdHlwZS51bml0KS50b1N0cmluZygpO1xuXHRcdH0pO1xuXHR9XG5cblx0aWYgKGFycm93LkRhdGFUeXBlLmlzTGlzdCh0eXBlKSkge1xuXHRcdHJldHVybiBmbXQodHlwZS5UVmFsdWUsICh2YWx1ZSkgPT4ge1xuXHRcdFx0Ly8gVE9ETzogU29tZSByZWN1cnNpdmUgZm9ybWF0dGluZz9cblx0XHRcdHJldHVybiB2YWx1ZS50b1N0cmluZygpO1xuXHRcdH0pO1xuXHR9XG5cblx0aWYgKGFycm93LkRhdGFUeXBlLmlzU3RydWN0KHR5cGUpKSB7XG5cdFx0cmV0dXJuIGZtdCh0eXBlLlRWYWx1ZSwgKHZhbHVlKSA9PiB7XG5cdFx0XHQvLyBUT0RPOiBTb21lIHJlY3Vyc2l2ZSBmb3JtYXR0aW5nP1xuXHRcdFx0cmV0dXJuIHZhbHVlLnRvU3RyaW5nKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRpZiAoYXJyb3cuRGF0YVR5cGUuaXNVbmlvbih0eXBlKSkge1xuXHRcdHJldHVybiBmbXQodHlwZS5UVmFsdWUsIChfdmFsdWUpID0+IHtcblx0XHRcdHJldHVybiBcIlRPRE9cIjtcblx0XHR9KTtcblx0fVxuXHRpZiAoYXJyb3cuRGF0YVR5cGUuaXNNYXAodHlwZSkpIHtcblx0XHRyZXR1cm4gZm10KHR5cGUuVFZhbHVlLCAoX3ZhbHVlKSA9PiB7XG5cdFx0XHRyZXR1cm4gXCJUT0RPXCI7XG5cdFx0fSk7XG5cdH1cblxuXHRpZiAoYXJyb3cuRGF0YVR5cGUuaXNEaWN0aW9uYXJ5KHR5cGUpKSB7XG5cdFx0bGV0IGZvcm1hdHRlciA9IGZvcm1hdHRlckZvckRhdGFUeXBlVmFsdWUodHlwZS5kaWN0aW9uYXJ5KTtcblx0XHRyZXR1cm4gZm10KHR5cGUuVFZhbHVlLCBmb3JtYXR0ZXIpO1xuXHR9XG5cblx0cmV0dXJuICgpID0+IGBVbnN1cHBvcnRlZCB0eXBlOiAke3R5cGV9YDtcbn1cblxuLyoqXG4gKiBAcGFyYW0ge251bWJlciB8IGJpZ2ludH0gdmFsdWVcbiAqIEBwYXJhbSB7YXJyb3cuVGltZVVuaXR9IHVuaXRcbiAqL1xuZnVuY3Rpb24gaW5zdGFudEZyb21UaW1lVW5pdCh2YWx1ZTogbnVtYmVyIHwgYmlnaW50LCB1bml0OiBhcnJvdy5UaW1lVW5pdCkge1xuXHRpZiAodW5pdCA9PT0gYXJyb3cuVGltZVVuaXQuU0VDT05EKSB7XG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJiaWdpbnRcIikgdmFsdWUgPSBOdW1iZXIodmFsdWUpO1xuXHRcdHJldHVybiBUZW1wb3JhbC5JbnN0YW50LmZyb21FcG9jaFNlY29uZHModmFsdWUpO1xuXHR9XG5cdGlmICh1bml0ID09PSBhcnJvdy5UaW1lVW5pdC5NSUxMSVNFQ09ORCkge1xuXHRcdGlmICh0eXBlb2YgdmFsdWUgPT09IFwiYmlnaW50XCIpIHZhbHVlID0gTnVtYmVyKHZhbHVlKTtcblx0XHRyZXR1cm4gVGVtcG9yYWwuSW5zdGFudC5mcm9tRXBvY2hNaWxsaXNlY29uZHModmFsdWUpO1xuXHR9XG5cdGlmICh1bml0ID09PSBhcnJvdy5UaW1lVW5pdC5NSUNST1NFQ09ORCkge1xuXHRcdGlmICh0eXBlb2YgdmFsdWUgPT09IFwibnVtYmVyXCIpIHZhbHVlID0gQmlnSW50KHZhbHVlKTtcblx0XHRyZXR1cm4gVGVtcG9yYWwuSW5zdGFudC5mcm9tRXBvY2hNaWNyb3NlY29uZHModmFsdWUpO1xuXHR9XG5cdGlmICh1bml0ID09PSBhcnJvdy5UaW1lVW5pdC5OQU5PU0VDT05EKSB7XG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJudW1iZXJcIikgdmFsdWUgPSBCaWdJbnQodmFsdWUpO1xuXHRcdHJldHVybiBUZW1wb3JhbC5JbnN0YW50LmZyb21FcG9jaE5hbm9zZWNvbmRzKHZhbHVlKTtcblx0fVxuXHR0aHJvdyBuZXcgRXJyb3IoXCJJbnZhbGlkIFRpbWVVbml0XCIpO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7bnVtYmVyIHwgYmlnaW50fSB2YWx1ZVxuICogQHBhcmFtIHthcnJvdy5UaW1lVW5pdH0gdW5pdFxuICovXG5mdW5jdGlvbiBkdXJhdGlvbkZyb21UaW1lVW5pdCh2YWx1ZTogbnVtYmVyIHwgYmlnaW50LCB1bml0OiBhcnJvdy5UaW1lVW5pdCkge1xuXHQvLyBUT0RPOiBUZW1wb3JhbC5EdXJhdGlvbiBwb2x5ZmlsbCBvbmx5IHN1cHBvcnRzIG51bWJlciBub3QgYmlnaW50XG5cdHZhbHVlID0gTnVtYmVyKHZhbHVlKTtcblx0aWYgKHVuaXQgPT09IGFycm93LlRpbWVVbml0LlNFQ09ORCkge1xuXHRcdHJldHVybiBUZW1wb3JhbC5EdXJhdGlvbi5mcm9tKHsgc2Vjb25kczogdmFsdWUgfSk7XG5cdH1cblx0aWYgKHVuaXQgPT09IGFycm93LlRpbWVVbml0Lk1JTExJU0VDT05EKSB7XG5cdFx0cmV0dXJuIFRlbXBvcmFsLkR1cmF0aW9uLmZyb20oeyBtaWxsaXNlY29uZHM6IHZhbHVlIH0pO1xuXHR9XG5cdGlmICh1bml0ID09PSBhcnJvdy5UaW1lVW5pdC5NSUNST1NFQ09ORCkge1xuXHRcdHJldHVybiBUZW1wb3JhbC5EdXJhdGlvbi5mcm9tKHsgbWljcm9zZWNvbmRzOiB2YWx1ZSB9KTtcblx0fVxuXHRpZiAodW5pdCA9PT0gYXJyb3cuVGltZVVuaXQuTkFOT1NFQ09ORCkge1xuXHRcdHJldHVybiBUZW1wb3JhbC5EdXJhdGlvbi5mcm9tKHsgbmFub3NlY29uZHM6IHZhbHVlIH0pO1xuXHR9XG5cdHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgVGltZVVuaXRcIik7XG59XG4iLCAiLy8gQGRlbm8tdHlwZXM9XCIuLi9tb3NhaWMtY29yZS5kLnRzXCI7XG5pbXBvcnQgKiBhcyBtYyBmcm9tIFwiQHV3ZGF0YS9tb3NhaWMtY29yZVwiO1xuLy8gQGRlbm8tdHlwZXM9XCIuLi9tb3NhaWMtc3FsLmQudHNcIjtcbmltcG9ydCB7IGNvdW50LCBRdWVyeSwgUmVmIH0gZnJvbSBcIkB1d2RhdGEvbW9zYWljLXNxbFwiO1xuaW1wb3J0ICogYXMgbXBsb3QgZnJvbSBcIkB1d2RhdGEvbW9zYWljLXBsb3RcIjtcbmltcG9ydCB0eXBlICogYXMgYXJyb3cgZnJvbSBcImFwYWNoZS1hcnJvd1wiO1xuXG5pbXBvcnQgeyBhc3NlcnQgfSBmcm9tIFwiLi4vdXRpbHMvYXNzZXJ0LnRzXCI7XG5pbXBvcnQgeyBDcm9zc2ZpbHRlckhpc3RvZ3JhbVBsb3QgfSBmcm9tIFwiLi4vdXRpbHMvQ3Jvc3NmaWx0ZXJIaXN0b2dyYW1QbG90LnRzXCI7XG5cbmltcG9ydCB0eXBlIHsgQmluLCBDaGFubmVsLCBGaWVsZCwgSW5mbywgTWFyaywgU2NhbGUgfSBmcm9tIFwiLi4vdHlwZXMudHNcIjtcblxuLyoqIEFuIG9wdGlvbnMgYmFnIGZvciB0aGUgSGlzdG9ncmFtIE1vc2lhYyBjbGllbnQuICovXG5pbnRlcmZhY2UgSGlzdG9ncmFtT3B0aW9ucyB7XG5cdC8qKiBUaGUgdGFibGUgdG8gcXVlcnkuICovXG5cdHRhYmxlOiBzdHJpbmc7XG5cdC8qKiBUaGUgY29sdW1uIHRvIHVzZSBmb3IgdGhlIGhpc3RvZ3JhbS4gKi9cblx0Y29sdW1uOiBzdHJpbmc7XG5cdC8qKiBUaGUgdHlwZSBvZiB0aGUgY29sdW1uLiBNdXN0IGJlIFwibnVtYmVyXCIgb3IgXCJkYXRlXCIuICovXG5cdHR5cGU6IFwibnVtYmVyXCIgfCBcImRhdGVcIjtcblx0LyoqIEEgbW9zYWljIHNlbGVjdGlvbiB0byBmaWx0ZXIgdGhlIGRhdGEuICovXG5cdGZpbHRlckJ5PzogbWMuU2VsZWN0aW9uO1xufVxuXG4vKiogUmVwcmVzZW50cyBhIENyb3NzLWZpbHRlcmVkIEhpc3RvZ3JhbSAqL1xuZXhwb3J0IGNsYXNzIEhpc3RvZ3JhbSBleHRlbmRzIG1jLk1vc2FpY0NsaWVudCBpbXBsZW1lbnRzIE1hcmsge1xuXHR0eXBlID0gXCJyZWN0WVwiO1xuXHQjc291cmNlOiB7IHRhYmxlOiBzdHJpbmc7IGNvbHVtbjogc3RyaW5nOyB0eXBlOiBcIm51bWJlclwiIHwgXCJkYXRlXCIgfTtcblx0I2VsOiBIVE1MRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG5cdCNjaGFubmVsczogQXJyYXk8Q2hhbm5lbD4gPSBbXTtcblx0I21hcmtTZXQ6IFNldDx1bmtub3duPiA9IG5ldyBTZXQoKTtcblx0I2ludGVydmFsOiBtcGxvdC5JbnRlcnZhbDFEIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHQjaW5pdGlhbGl6ZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0I2ZpZWxkSW5mbzogYm9vbGVhbiA9IGZhbHNlO1xuXHRzdmc6XG5cdFx0fCBTVkdTVkdFbGVtZW50ICYge1xuXHRcdFx0c2NhbGU6ICh0eXBlOiBzdHJpbmcpID0+IFNjYWxlPG51bWJlciwgbnVtYmVyPjtcblx0XHRcdHVwZGF0ZShiaW5zOiBCaW5bXSwgb3B0czogeyBudWxsQ291bnQ6IG51bWJlciB9KTogdm9pZDtcblx0XHR9XG5cdFx0fCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3Iob3B0aW9uczogSGlzdG9ncmFtT3B0aW9ucykge1xuXHRcdHN1cGVyKG9wdGlvbnMuZmlsdGVyQnkpO1xuXHRcdHRoaXMuI3NvdXJjZSA9IG9wdGlvbnM7XG5cdFx0bGV0IHByb2Nlc3MgPSAoY2hhbm5lbDogc3RyaW5nLCBlbnRyeTogdW5rbm93bikgPT4ge1xuXHRcdFx0aWYgKGlzVHJhbnNmb3JtKGVudHJ5KSkge1xuXHRcdFx0XHRsZXQgZW5jID0gZW50cnkodGhpcywgY2hhbm5lbCk7XG5cdFx0XHRcdGZvciAobGV0IGtleSBpbiBlbmMpIHtcblx0XHRcdFx0XHRwcm9jZXNzKGtleSwgZW5jW2tleV0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGlzRmllbGRPYmplY3QoY2hhbm5lbCwgZW50cnkpKSB7XG5cdFx0XHRcdHRoaXMuI2NoYW5uZWxzLnB1c2goZmllbGRFbnRyeShjaGFubmVsLCBlbnRyeSkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIGVuY29kaW5nIGZvciBjaGFubmVsICR7Y2hhbm5lbH1gKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGxldCBlbmNvZGluZ3MgPSB7XG5cdFx0XHR4OiBtcGxvdC5iaW4ob3B0aW9ucy5jb2x1bW4pLFxuXHRcdFx0eTogY291bnQoKSxcblx0XHR9O1xuXHRcdGZvciAobGV0IFtjaGFubmVsLCBlbnRyeV0gb2YgT2JqZWN0LmVudHJpZXMoZW5jb2RpbmdzKSkge1xuXHRcdFx0cHJvY2VzcyhjaGFubmVsLCBlbnRyeSk7XG5cdFx0fVxuXHRcdGlmIChvcHRpb25zLmZpbHRlckJ5KSB7XG5cdFx0XHR0aGlzLiNpbnRlcnZhbCA9IG5ldyBtcGxvdC5JbnRlcnZhbDFEKHRoaXMsIHtcblx0XHRcdFx0Y2hhbm5lbDogXCJ4XCIsXG5cdFx0XHRcdHNlbGVjdGlvbjogdGhpcy5maWx0ZXJCeSxcblx0XHRcdFx0ZmllbGQ6IHRoaXMuI3NvdXJjZS5jb2x1bW4sXG5cdFx0XHRcdGJydXNoOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRmaWVsZHMoKSB7XG5cdFx0Y29uc3QgZmllbGRzID0gbmV3IE1hcCgpO1xuXHRcdGZvciAobGV0IHsgZmllbGQgfSBvZiB0aGlzLiNjaGFubmVscykge1xuXHRcdFx0aWYgKCFmaWVsZCkgY29udGludWU7XG5cdFx0XHRsZXQgc3RhdHMgPSBmaWVsZC5zdGF0cz8uc3RhdHMgfHwgW107XG5cdFx0XHRsZXQga2V5ID0gZmllbGQuc3RhdHM/LmNvbHVtbiA/PyBmaWVsZDtcblx0XHRcdGxldCBlbnRyeSA9IGZpZWxkcy5nZXQoa2V5KTtcblx0XHRcdGlmICghZW50cnkpIHtcblx0XHRcdFx0ZW50cnkgPSBuZXcgU2V0KCk7XG5cdFx0XHRcdGZpZWxkcy5zZXQoa2V5LCBlbnRyeSk7XG5cdFx0XHR9XG5cdFx0XHRzdGF0cy5mb3JFYWNoKChzKSA9PiBlbnRyeS5hZGQocykpO1xuXHRcdH1cblx0XHRyZXR1cm4gQXJyYXkuZnJvbShcblx0XHRcdGZpZWxkcyxcblx0XHRcdChbYywgc10pID0+ICh7IHRhYmxlOiB0aGlzLiNzb3VyY2UudGFibGUsIGNvbHVtbjogYywgc3RhdHM6IHMgfSksXG5cdFx0KTtcblx0fVxuXG5cdGZpZWxkSW5mbyhpbmZvOiBBcnJheTxJbmZvPikge1xuXHRcdGxldCBsb29rdXAgPSBPYmplY3QuZnJvbUVudHJpZXMoaW5mby5tYXAoKHgpID0+IFt4LmNvbHVtbiwgeF0pKTtcblx0XHRmb3IgKGxldCBlbnRyeSBvZiB0aGlzLiNjaGFubmVscykge1xuXHRcdFx0bGV0IHsgZmllbGQgfSA9IGVudHJ5O1xuXHRcdFx0aWYgKGZpZWxkKSB7XG5cdFx0XHRcdE9iamVjdC5hc3NpZ24oZW50cnksIGxvb2t1cFtmaWVsZC5zdGF0cz8uY29sdW1uID8/IGZpZWxkXSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuI2ZpZWxkSW5mbyA9IHRydWU7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHQvKiogQHBhcmFtIHtzdHJpbmd9IGNoYW5uZWwgKi9cblx0Y2hhbm5lbChjaGFubmVsOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gdGhpcy4jY2hhbm5lbHMuZmluZCgoYykgPT4gYy5jaGFubmVsID09PSBjaGFubmVsKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAcGFyYW0ge3N0cmluZ30gY2hhbm5lbFxuXHQgKiBAcGFyYW0ge3sgZXhhY3Q/OiBib29sZWFuIH19IFtvcHRpb25zXVxuXHQgKiBAcmV0dXJucyB7Q2hhbm5lbH1cblx0ICovXG5cdGNoYW5uZWxGaWVsZChcblx0XHRjaGFubmVsOiBzdHJpbmcsXG5cdFx0eyBleGFjdCA9IGZhbHNlIH06IHsgZXhhY3Q/OiBib29sZWFuIH0gPSB7fSxcblx0KTogQ2hhbm5lbCB7XG5cdFx0YXNzZXJ0KHRoaXMuZmllbGRJbmZvLCBcIkZpZWxkIGluZm8gbm90IHNldFwiKTtcblx0XHRsZXQgYyA9IGV4YWN0XG5cdFx0XHQ/IHRoaXMuY2hhbm5lbChjaGFubmVsKVxuXHRcdFx0OiB0aGlzLiNjaGFubmVscy5maW5kKChjKSA9PiBjLmNoYW5uZWwuc3RhcnRzV2l0aChjaGFubmVsKSk7XG5cdFx0YXNzZXJ0KGMsIGBDaGFubmVsICR7Y2hhbm5lbH0gbm90IGZvdW5kYCk7XG5cdFx0cmV0dXJuIGM7XG5cdH1cblxuXHRoYXNGaWVsZEluZm8oKSB7XG5cdFx0cmV0dXJuICEhdGhpcy4jZmllbGRJbmZvO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybiBhIHF1ZXJ5IHNwZWNpZnlpbmcgdGhlIGRhdGEgbmVlZGVkIGJ5IHRoaXMgTWFyayBjbGllbnQuXG5cdCAqIEBwYXJhbSBmaWx0ZXIgVGhlIGZpbHRlcmluZyBjcml0ZXJpYSB0byBhcHBseSBpbiB0aGUgcXVlcnkuXG5cdCAqIEByZXR1cm5zIFRoZSBjbGllbnQgcXVlcnlcblx0ICovXG5cdHF1ZXJ5KGZpbHRlcj86IEFycmF5PHVua25vd24+KTogUXVlcnkge1xuXHRcdHJldHVybiBtYXJrUXVlcnkodGhpcy4jY2hhbm5lbHMsIHRoaXMuI3NvdXJjZS50YWJsZSkud2hlcmUoZmlsdGVyKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBQcm92aWRlIHF1ZXJ5IHJlc3VsdCBkYXRhIHRvIHRoZSBtYXJrLlxuXHQgKiBAcGFyYW0ge2Fycm93LlRhYmxlPHsgeDE6IGFycm93LkludCwgeDI6IGFycm93LkludCwgeTogYXJyb3cuSW50IH0+fSBkYXRhXG5cdCAqL1xuXHRxdWVyeVJlc3VsdChcblx0XHRkYXRhOiBhcnJvdy5UYWJsZTx7IHgxOiBhcnJvdy5JbnQ7IHgyOiBhcnJvdy5JbnQ7IHk6IGFycm93LkludCB9Pixcblx0KSB7XG5cdFx0bGV0IGJpbnMgPSBBcnJheS5mcm9tKGRhdGEsIChkKSA9PiAoe1xuXHRcdFx0eDA6IGQueDEsXG5cdFx0XHR4MTogZC54Mixcblx0XHRcdGxlbmd0aDogZC55LFxuXHRcdH0pKTtcblx0XHRsZXQgbnVsbENvdW50ID0gMDtcblx0XHRsZXQgbnVsbEJpbkluZGV4ID0gYmlucy5maW5kSW5kZXgoKGIpID0+IGIueDAgPT0gbnVsbCk7XG5cdFx0aWYgKG51bGxCaW5JbmRleCA+PSAwKSB7XG5cdFx0XHRudWxsQ291bnQgPSBiaW5zW251bGxCaW5JbmRleF0ubGVuZ3RoO1xuXHRcdFx0Ymlucy5zcGxpY2UobnVsbEJpbkluZGV4LCAxKTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLiNpbml0aWFsaXplZCkge1xuXHRcdFx0dGhpcy5zdmcgPSBDcm9zc2ZpbHRlckhpc3RvZ3JhbVBsb3QoYmlucywge1xuXHRcdFx0XHRudWxsQ291bnQsXG5cdFx0XHRcdHR5cGU6IHRoaXMuI3NvdXJjZS50eXBlLFxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLiNpbnRlcnZhbD8uaW5pdCh0aGlzLnN2ZywgbnVsbCk7XG5cdFx0XHR0aGlzLiNlbC5hcHBlbmRDaGlsZCh0aGlzLnN2Zyk7XG5cdFx0XHR0aGlzLiNpbml0aWFsaXplZCA9IHRydWU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc3ZnPy51cGRhdGUoYmlucywgeyBudWxsQ291bnQgfSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0Z2V0IHBsb3QoKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG5vZGU6ICgpID0+IHRoaXMuI2VsLFxuXHRcdFx0LyoqIEBwYXJhbSB7c3RyaW5nfSBfbmFtZSAqL1xuXHRcdFx0Z2V0QXR0cmlidXRlKF9uYW1lOiBzdHJpbmcpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0XHRtYXJrU2V0OiB0aGlzLiNtYXJrU2V0LFxuXHRcdH07XG5cdH1cbn1cblxuLyoqXG4gKiBAcGFyYW0ge3N0cmluZ30gY2hhbm5lbFxuICogQHBhcmFtIHtGaWVsZH0gZmllbGRcbiAqIEByZXR1cm5zIHtDaGFubmVsfVxuICovXG5mdW5jdGlvbiBmaWVsZEVudHJ5KGNoYW5uZWw6IHN0cmluZywgZmllbGQ6IEZpZWxkKTogQ2hhbm5lbCB7XG5cdHJldHVybiB7XG5cdFx0Y2hhbm5lbCxcblx0XHRmaWVsZCxcblx0XHRhczogZmllbGQgaW5zdGFuY2VvZiBSZWYgPyBmaWVsZC5jb2x1bW4gOiBjaGFubmVsLFxuXHR9O1xufVxuXG4vKipcbiAqIEBwYXJhbSB7c3RyaW5nfSBjaGFubmVsXG4gKiBAcGFyYW0ge3Vua25vd259IGZpZWxkXG4gKiBAcmV0dXJucyB7ZmllbGQgaXMgRmllbGR9XG4gKi9cbmZ1bmN0aW9uIGlzRmllbGRPYmplY3QoY2hhbm5lbDogc3RyaW5nLCBmaWVsZDogdW5rbm93bik6IGZpZWxkIGlzIEZpZWxkIHtcblx0aWYgKGNoYW5uZWwgPT09IFwic29ydFwiIHx8IGNoYW5uZWwgPT09IFwidGlwXCIpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0cmV0dXJuIChcblx0XHR0eXBlb2YgZmllbGQgPT09IFwib2JqZWN0XCIgJiZcblx0XHRmaWVsZCAhPSBudWxsICYmXG5cdFx0IUFycmF5LmlzQXJyYXkoZmllbGQpXG5cdCk7XG59XG5cbi8qKlxuICogQHBhcmFtIHt1bmtub3dufSB4XG4gKiBAcmV0dXJucyB7eCBpcyAobWFyazogTWFyaywgY2hhbm5lbDogc3RyaW5nKSA9PiBSZWNvcmQ8c3RyaW5nLCBGaWVsZD59XG4gKi9cbmZ1bmN0aW9uIGlzVHJhbnNmb3JtKFxuXHR4OiB1bmtub3duLFxuKTogeCBpcyAobWFyazogTWFyaywgY2hhbm5lbDogc3RyaW5nKSA9PiBSZWNvcmQ8c3RyaW5nLCBGaWVsZD4ge1xuXHRyZXR1cm4gdHlwZW9mIHggPT09IFwiZnVuY3Rpb25cIjtcbn1cblxuLyoqXG4gKiBEZWZhdWx0IHF1ZXJ5IGNvbnN0cnVjdGlvbiBmb3IgYSBtYXJrLlxuICpcbiAqIFRyYWNrcyBhZ2dyZWdhdGVzIGJ5IGNoZWNraW5nIGZpZWxkcyBmb3IgYW4gYWdncmVnYXRlIGZsYWcuXG4gKiBJZiBhZ2dyZWdhdGVzIGFyZSBmb3VuZCwgZ3JvdXBzIGJ5IGFsbCBub24tYWdncmVnYXRlIGZpZWxkcy5cbiAqXG4gKiBAcGFyYW0ge0FycmF5PENoYW5uZWw+fSBjaGFubmVscyBhcnJheSBvZiB2aXN1YWwgZW5jb2RpbmcgY2hhbm5lbCBzcGVjcy5cbiAqIEBwYXJhbSB7c3RyaW5nfSB0YWJsZSB0aGUgdGFibGUgdG8gcXVlcnkuXG4gKiBAcGFyYW0ge0FycmF5PHN0cmluZz59IHNraXAgYW4gb3B0aW9uYWwgYXJyYXkgb2YgY2hhbm5lbHMgdG8gc2tpcC4gTWFyayBzdWJjbGFzc2VzIGNhbiBza2lwIGNoYW5uZWxzIHRoYXQgcmVxdWlyZSBzcGVjaWFsIGhhbmRsaW5nLlxuICogQHJldHVybnMge21zcWwuUXVlcnl9IGEgUXVlcnkgaW5zdGFuY2VcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1hcmtRdWVyeShcblx0Y2hhbm5lbHM6IEFycmF5PENoYW5uZWw+LFxuXHR0YWJsZTogc3RyaW5nLFxuXHRza2lwOiBBcnJheTxzdHJpbmc+ID0gW10sXG4pOiBRdWVyeSB7XG5cdGxldCBxID0gUXVlcnkuZnJvbSh7IHNvdXJjZTogdGFibGUgfSk7XG5cdGxldCBkaW1zID0gbmV3IFNldCgpO1xuXHRsZXQgYWdnciA9IGZhbHNlO1xuXG5cdGZvciAoY29uc3QgYyBvZiBjaGFubmVscykge1xuXHRcdGNvbnN0IHsgY2hhbm5lbCwgZmllbGQsIGFzIH0gPSBjO1xuXHRcdGlmIChza2lwLmluY2x1ZGVzKGNoYW5uZWwpKSBjb250aW51ZTtcblxuXHRcdGlmIChjaGFubmVsID09PSBcIm9yZGVyYnlcIikge1xuXHRcdFx0cS5vcmRlcmJ5KGMudmFsdWUpO1xuXHRcdH0gZWxzZSBpZiAoZmllbGQpIHtcblx0XHRcdGlmIChmaWVsZC5hZ2dyZWdhdGUpIHtcblx0XHRcdFx0YWdnciA9IHRydWU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoZGltcy5oYXMoYXMpKSBjb250aW51ZTtcblx0XHRcdFx0ZGltcy5hZGQoYXMpO1xuXHRcdFx0fVxuXHRcdFx0cS5zZWxlY3QoeyBbYXNdOiBmaWVsZCB9KTtcblx0XHR9XG5cdH1cblx0aWYgKGFnZ3IpIHtcblx0XHRxLmdyb3VwYnkoQXJyYXkuZnJvbShkaW1zKSk7XG5cdH1cblx0cmV0dXJuIHE7XG59XG4iLCAiLy8gVGhlIHR5cGVzIGZvciBkMyBhcmUgcmVhbGx5IGFubm95aW5nLlxuXG4vLyBAZGVuby10eXBlcz1cIm5wbTpAdHlwZXMvZDMtc2VsZWN0aW9uQDNcIlxuZXhwb3J0ICogZnJvbSBcImQzLXNlbGVjdGlvblwiO1xuLy8gQGRlbm8tdHlwZXM9XCJucG06QHR5cGVzL2QzLXNjYWxlQDRcIlxuZXhwb3J0ICogZnJvbSBcImQzLXNjYWxlXCI7XG4vLyBAZGVuby10eXBlcz1cIm5wbTpAdHlwZXMvZDMtYXhpc0AzXCJcbmV4cG9ydCAqIGZyb20gXCJkMy1heGlzXCI7XG4vLyBAZGVuby10eXBlcz1cIm5wbTpAdHlwZXMvZDMtZm9ybWF0QDNcIlxuZXhwb3J0ICogZnJvbSBcImQzLWZvcm1hdFwiO1xuLy8gQGRlbm8tdHlwZXM9XCJucG06QHR5cGVzL2QzLXRpbWUtZm9ybWF0QDRcIlxuZXhwb3J0ICogZnJvbSBcImQzLXRpbWUtZm9ybWF0XCI7XG4iLCAiaW1wb3J0ICogYXMgZDMgZnJvbSBcIi4uL2QzLnRzXCI7XG5pbXBvcnQgdHlwZSB7IEJpbiB9IGZyb20gXCIuLi90eXBlcy50c1wiO1xuXG5sZXQgWUVBUiA9IFwieWVhclwiO1xubGV0IE1PTlRIID0gXCJtb250aFwiO1xubGV0IERBWSA9IFwiZGF5XCI7XG5sZXQgSE9VUiA9IFwiaG91clwiO1xubGV0IE1JTlVURSA9IFwibWludXRlXCI7XG5sZXQgU0VDT05EID0gXCJzZWNvbmRcIjtcbmxldCBNSUxMSVNFQ09ORCA9IFwibWlsbGlzZWNvbmRcIjtcblxubGV0IGR1cmF0aW9uU2Vjb25kID0gMTAwMDtcbmxldCBkdXJhdGlvbk1pbnV0ZSA9IGR1cmF0aW9uU2Vjb25kICogNjA7XG5sZXQgZHVyYXRpb25Ib3VyID0gZHVyYXRpb25NaW51dGUgKiA2MDtcbmxldCBkdXJhdGlvbkRheSA9IGR1cmF0aW9uSG91ciAqIDI0O1xubGV0IGR1cmF0aW9uV2VlayA9IGR1cmF0aW9uRGF5ICogNztcbmxldCBkdXJhdGlvbk1vbnRoID0gZHVyYXRpb25EYXkgKiAzMDtcbmxldCBkdXJhdGlvblllYXIgPSBkdXJhdGlvbkRheSAqIDM2NTtcblxubGV0IGludGVydmFscyA9IFtcblx0W1NFQ09ORCwgMSwgZHVyYXRpb25TZWNvbmRdLFxuXHRbU0VDT05ELCA1LCA1ICogZHVyYXRpb25TZWNvbmRdLFxuXHRbU0VDT05ELCAxNSwgMTUgKiBkdXJhdGlvblNlY29uZF0sXG5cdFtTRUNPTkQsIDMwLCAzMCAqIGR1cmF0aW9uU2Vjb25kXSxcblx0W01JTlVURSwgMSwgZHVyYXRpb25NaW51dGVdLFxuXHRbTUlOVVRFLCA1LCA1ICogZHVyYXRpb25NaW51dGVdLFxuXHRbTUlOVVRFLCAxNSwgMTUgKiBkdXJhdGlvbk1pbnV0ZV0sXG5cdFtNSU5VVEUsIDMwLCAzMCAqIGR1cmF0aW9uTWludXRlXSxcblx0W0hPVVIsIDEsIGR1cmF0aW9uSG91cl0sXG5cdFtIT1VSLCAzLCAzICogZHVyYXRpb25Ib3VyXSxcblx0W0hPVVIsIDYsIDYgKiBkdXJhdGlvbkhvdXJdLFxuXHRbSE9VUiwgMTIsIDEyICogZHVyYXRpb25Ib3VyXSxcblx0W0RBWSwgMSwgZHVyYXRpb25EYXldLFxuXHRbREFZLCA3LCBkdXJhdGlvbldlZWtdLFxuXHRbTU9OVEgsIDEsIGR1cmF0aW9uTW9udGhdLFxuXHRbTU9OVEgsIDMsIDMgKiBkdXJhdGlvbk1vbnRoXSxcblx0W1lFQVIsIDEsIGR1cmF0aW9uWWVhcl0sXG5dIGFzIGNvbnN0O1xuXG5sZXQgZm9ybWF0TWFwID0ge1xuXHRbTUlMTElTRUNPTkRdOiBkMy50aW1lRm9ybWF0KFwiJUxcIiksXG5cdFtTRUNPTkRdOiBkMy50aW1lRm9ybWF0KFwiJVMgc1wiKSxcblx0W01JTlVURV06IGQzLnRpbWVGb3JtYXQoXCIlSDolTVwiKSxcblx0W0hPVVJdOiBkMy50aW1lRm9ybWF0KFwiJUg6JU1cIiksXG5cdFtEQVldOiBkMy50aW1lRm9ybWF0KFwiJWIgJWRcIiksXG5cdFtNT05USF06IGQzLnRpbWVGb3JtYXQoXCIlYiAlWVwiKSxcblx0W1lFQVJdOiBkMy50aW1lRm9ybWF0KFwiJVlcIiksXG59O1xuXG4vKipcbiAqIEBwYXJhbSB0eXBlIC0gdGhlIHR5cGUgb2YgZGF0YSBhcyBhIEphdmFTY3JpcHQgcHJpbWl0aXZlXG4gKiBAcGFyYW0gYmlucyAtIHRoZSBiaW4gZGF0YSB0aGF0IG5lZWRzIHRvIGJlIGZvcm1hdHRlZFxuICovXG5leHBvcnQgZnVuY3Rpb24gdGlja0Zvcm1hdHRlckZvckJpbnMoXG5cdHR5cGU6IFwiZGF0ZVwiIHwgXCJudW1iZXJcIixcblx0YmluczogQXJyYXk8QmluPixcbik6IChkOiBkMy5OdW1iZXJWYWx1ZSkgPT4gc3RyaW5nIHtcblx0aWYgKHR5cGUgPT09IFwibnVtYmVyXCIpIHtcblx0XHRyZXR1cm4gZDMuZm9ybWF0KFwifnNcIik7XG5cdH1cblx0bGV0IGludGVydmFsID0gdGltZUludGVydmFsKFxuXHRcdGJpbnNbMF0ueDAsXG5cdFx0Ymluc1tiaW5zLmxlbmd0aCAtIDFdLngxLFxuXHRcdGJpbnMubGVuZ3RoLFxuXHQpO1xuXHQvLyBAdHMtZXhwZWN0LWVycm9yIC0gZDMgb2sgd2l0aCBkYXRlIC0+IHN0cmluZyBhcyBsb25nIGFzIGl0J3MgdXRjXG5cdHJldHVybiBmb3JtYXRNYXBbaW50ZXJ2YWwuaW50ZXJ2YWxdO1xufVxuXG4vLy8gYmluIHN0dWZmIGZyb20gdmdwbG90XG5cbi8qKlxuICogQHBhcmFtIG1pblxuICogQHBhcmFtIG1heFxuICogQHBhcmFtIHN0ZXBzXG4gKi9cbmZ1bmN0aW9uIHRpbWVJbnRlcnZhbChcblx0bWluOiBudW1iZXIsXG5cdG1heDogbnVtYmVyLFxuXHRzdGVwczogbnVtYmVyLFxuKToge1xuXHRpbnRlcnZhbDogdHlwZW9mIGludGVydmFsc1tudW1iZXJdWzBdIHwgdHlwZW9mIE1JTExJU0VDT05EO1xuXHRzdGVwOiBudW1iZXI7XG59IHtcblx0Y29uc3Qgc3BhbiA9IG1heCAtIG1pbjtcblx0Y29uc3QgdGFyZ2V0ID0gc3BhbiAvIHN0ZXBzO1xuXG5cdGxldCBpID0gMDtcblx0d2hpbGUgKGkgPCBpbnRlcnZhbHMubGVuZ3RoICYmIGludGVydmFsc1tpXVsyXSA8IHRhcmdldCkge1xuXHRcdGkrKztcblx0fVxuXG5cdGlmIChpID09PSBpbnRlcnZhbHMubGVuZ3RoKSB7XG5cdFx0cmV0dXJuIHsgaW50ZXJ2YWw6IFlFQVIsIHN0ZXA6IGJpblN0ZXAoc3Bhbiwgc3RlcHMpIH07XG5cdH1cblxuXHRpZiAoaSA+IDApIHtcblx0XHRsZXQgaW50ZXJ2YWwgPSBpbnRlcnZhbHNbXG5cdFx0XHR0YXJnZXQgLyBpbnRlcnZhbHNbaSAtIDFdWzJdIDwgaW50ZXJ2YWxzW2ldWzJdIC8gdGFyZ2V0ID8gaSAtIDEgOiBpXG5cdFx0XTtcblx0XHRyZXR1cm4geyBpbnRlcnZhbDogaW50ZXJ2YWxbMF0sIHN0ZXA6IGludGVydmFsWzFdIH07XG5cdH1cblxuXHRyZXR1cm4geyBpbnRlcnZhbDogTUlMTElTRUNPTkQsIHN0ZXA6IGJpblN0ZXAoc3Bhbiwgc3RlcHMsIDEpIH07XG59XG5cbi8qKlxuICogQHBhcmFtIHtudW1iZXJ9IHNwYW5cbiAqIEBwYXJhbSB7bnVtYmVyfSBzdGVwc1xuICogQHBhcmFtIHtudW1iZXJ9IFttaW5zdGVwXVxuICogQHBhcmFtIHtudW1iZXJ9IFtsb2diXVxuICovXG5mdW5jdGlvbiBiaW5TdGVwKFxuXHRzcGFuOiBudW1iZXIsXG5cdHN0ZXBzOiBudW1iZXIsXG5cdG1pbnN0ZXA6IG51bWJlciA9IDAsXG5cdGxvZ2I6IG51bWJlciA9IE1hdGguTE4xMCxcbikge1xuXHRsZXQgdjtcblxuXHRjb25zdCBsZXZlbCA9IE1hdGguY2VpbChNYXRoLmxvZyhzdGVwcykgLyBsb2diKTtcblx0bGV0IHN0ZXAgPSBNYXRoLm1heChcblx0XHRtaW5zdGVwLFxuXHRcdE1hdGgucG93KDEwLCBNYXRoLnJvdW5kKE1hdGgubG9nKHNwYW4pIC8gbG9nYikgLSBsZXZlbCksXG5cdCk7XG5cblx0Ly8gaW5jcmVhc2Ugc3RlcCBzaXplIGlmIHRvbyBtYW55IGJpbnNcblx0d2hpbGUgKE1hdGguY2VpbChzcGFuIC8gc3RlcCkgPiBzdGVwcykgc3RlcCAqPSAxMDtcblxuXHQvLyBkZWNyZWFzZSBzdGVwIHNpemUgaWYgYWxsb3dlZFxuXHRjb25zdCBkaXYgPSBbNSwgMl07XG5cdGZvciAobGV0IGkgPSAwLCBuID0gZGl2Lmxlbmd0aDsgaSA8IG47ICsraSkge1xuXHRcdHYgPSBzdGVwIC8gZGl2W2ldO1xuXHRcdGlmICh2ID49IG1pbnN0ZXAgJiYgc3BhbiAvIHYgPD0gc3RlcHMpIHN0ZXAgPSB2O1xuXHR9XG5cblx0cmV0dXJuIHN0ZXA7XG59XG4iLCAiaW1wb3J0ICogYXMgZDMgZnJvbSBcIi4uL2QzLnRzXCI7XG5pbXBvcnQgeyBCaW4sIFNjYWxlIH0gZnJvbSBcIi4uL3R5cGVzLnRzXCI7XG5pbXBvcnQgeyBhc3NlcnQgfSBmcm9tIFwiLi4vdXRpbHMvYXNzZXJ0LnRzXCI7XG5pbXBvcnQgeyB0aWNrRm9ybWF0dGVyRm9yQmlucyB9IGZyb20gXCIuL3RpY2stZm9ybWF0dGVyLWZvci1iaW5zLnRzXCI7XG5cbmludGVyZmFjZSBIaXN0b2dyYW1PcHRpb25zIHtcblx0dHlwZTogXCJudW1iZXJcIiB8IFwiZGF0ZVwiO1xuXHR3aWR0aD86IG51bWJlcjtcblx0aGVpZ2h0PzogbnVtYmVyO1xuXHRtYXJnaW5Ub3A/OiBudW1iZXI7XG5cdG1hcmdpblJpZ2h0PzogbnVtYmVyO1xuXHRtYXJnaW5Cb3R0b20/OiBudW1iZXI7XG5cdG1hcmdpbkxlZnQ/OiBudW1iZXI7XG5cdG51bGxDb3VudD86IG51bWJlcjtcblx0ZmlsbENvbG9yPzogc3RyaW5nO1xuXHRudWxsRmlsbENvbG9yPzogc3RyaW5nO1xuXHRiYWNrZ3JvdW5kQmFyQ29sb3I/OiBzdHJpbmc7XG59XG5cbi8qKlxuICogUmV0dXJucyBhbiBTVkcgZWxlbWVudC5cbiAqXG4gKiBAcGFyYW0gYmlucyAtIHRoZSBcImNvbXBsZXRlXCIsIG9yIHRvdGFsIGJpbnMgZm9yIHRoZSBjcm9zc2ZpbHRlciBoaXN0b2dyYW0uXG4gKiBAcGFyYW0gb3B0aW9ucyAtIEEgYmFnIG9mIG9wdGlvbnMgdG8gY29uZmlndXJlIHRoZSBoaXN0b2dyYW1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIENyb3NzZmlsdGVySGlzdG9ncmFtUGxvdChcblx0YmluczogQXJyYXk8QmluPixcblx0e1xuXHRcdHR5cGUgPSBcIm51bWJlclwiLFxuXHRcdHdpZHRoID0gMTI1LFxuXHRcdGhlaWdodCA9IDQwLFxuXHRcdG1hcmdpblRvcCA9IDAsXG5cdFx0bWFyZ2luUmlnaHQgPSAyLFxuXHRcdG1hcmdpbkJvdHRvbSA9IDEyLFxuXHRcdG1hcmdpbkxlZnQgPSAyLFxuXHRcdG51bGxDb3VudCA9IDAsXG5cdFx0ZmlsbENvbG9yID0gXCIjNjQ3NDhiXCIsXG5cdFx0bnVsbEZpbGxDb2xvciA9IFwiI2NhOGEwNFwiLFxuXHRcdGJhY2tncm91bmRCYXJDb2xvciA9IFwidmFyKC0tbW9vbi1ncmF5KVwiLFxuXHR9OiBIaXN0b2dyYW1PcHRpb25zLFxuKTogU1ZHU1ZHRWxlbWVudCAmIHtcblx0c2NhbGU6ICh0eXBlOiBzdHJpbmcpID0+IFNjYWxlPG51bWJlciwgbnVtYmVyPjtcblx0dXBkYXRlKGJpbnM6IEFycmF5PEJpbj4sIG9wdHM6IHsgbnVsbENvdW50OiBudW1iZXIgfSk6IHZvaWQ7XG59IHtcblx0bGV0IG51bGxCaW5XaWR0aCA9IG51bGxDb3VudCA9PT0gMCA/IDAgOiA1O1xuXHRsZXQgc3BhY2luZyA9IG51bGxCaW5XaWR0aCA/IDQgOiAwO1xuXHRsZXQgZXh0ZW50ID0gLyoqIEB0eXBlIHtjb25zdH0gKi8gKFtcblx0XHRNYXRoLm1pbiguLi5iaW5zLm1hcCgoZCkgPT4gZC54MCkpLFxuXHRcdE1hdGgubWF4KC4uLmJpbnMubWFwKChkKSA9PiBkLngxKSksXG5cdF0pO1xuXHRsZXQgeCA9IHR5cGUgPT09IFwiZGF0ZVwiID8gZDMuc2NhbGVVdGMoKSA6IGQzLnNjYWxlTGluZWFyKCk7XG5cdHhcblx0XHQuZG9tYWluKGV4dGVudClcblx0XHQvLyBAdHMtZXhwZWN0LWVycm9yIC0gcmFuZ2UgaXMgb2sgd2l0aCBudW1iZXIgZm9yIGJvdGggbnVtYmVyIGFuZCB0aW1lXG5cdFx0LnJhbmdlKFttYXJnaW5MZWZ0ICsgbnVsbEJpbldpZHRoICsgc3BhY2luZywgd2lkdGggLSBtYXJnaW5SaWdodF0pXG5cdFx0Lm5pY2UoKTtcblxuXHRsZXQgeSA9IGQzLnNjYWxlTGluZWFyKClcblx0XHQuZG9tYWluKFswLCBNYXRoLm1heChudWxsQ291bnQsIC4uLmJpbnMubWFwKChkKSA9PiBkLmxlbmd0aCkpXSlcblx0XHQucmFuZ2UoW2hlaWdodCAtIG1hcmdpbkJvdHRvbSwgbWFyZ2luVG9wXSk7XG5cblx0bGV0IHN2ZyA9IGQzLmNyZWF0ZShcInN2Z1wiKVxuXHRcdC5hdHRyKFwid2lkdGhcIiwgd2lkdGgpXG5cdFx0LmF0dHIoXCJoZWlnaHRcIiwgaGVpZ2h0KVxuXHRcdC5hdHRyKFwidmlld0JveFwiLCBbMCwgMCwgd2lkdGgsIGhlaWdodF0pXG5cdFx0LmF0dHIoXCJzdHlsZVwiLCBcIm1heC13aWR0aDogMTAwJTsgaGVpZ2h0OiBhdXRvOyBvdmVyZmxvdzogdmlzaWJsZTtcIik7XG5cblx0e1xuXHRcdC8vIGJhY2tncm91bmQgYmFycyB3aXRoIHRoZSBcInRvdGFsXCIgYmluc1xuXHRcdHN2Zy5hcHBlbmQoXCJnXCIpXG5cdFx0XHQuYXR0cihcImZpbGxcIiwgYmFja2dyb3VuZEJhckNvbG9yKVxuXHRcdFx0LnNlbGVjdEFsbChcInJlY3RcIilcblx0XHRcdC5kYXRhKGJpbnMpXG5cdFx0XHQuam9pbihcInJlY3RcIilcblx0XHRcdC5hdHRyKFwieFwiLCAoZCkgPT4geChkLngwKSArIDEuNSlcblx0XHRcdC5hdHRyKFwid2lkdGhcIiwgKGQpID0+IHgoZC54MSkgLSB4KGQueDApIC0gMS41KVxuXHRcdFx0LmF0dHIoXCJ5XCIsIChkKSA9PiB5KGQubGVuZ3RoKSlcblx0XHRcdC5hdHRyKFwiaGVpZ2h0XCIsIChkKSA9PiB5KDApIC0geShkLmxlbmd0aCkpO1xuXHR9XG5cblx0Ly8gRm9yZWdyb3VuZCBiYXJzIGZvciB0aGUgY3VycmVudCBzdWJzZXRcblx0bGV0IGZvcmVncm91bmRCYXJHcm91cCA9IHN2Z1xuXHRcdC5hcHBlbmQoXCJnXCIpXG5cdFx0LmF0dHIoXCJmaWxsXCIsIGZpbGxDb2xvcik7XG5cblx0c3ZnXG5cdFx0LmFwcGVuZChcImdcIilcblx0XHQuYXR0cihcInRyYW5zZm9ybVwiLCBgdHJhbnNsYXRlKDAsJHtoZWlnaHQgLSBtYXJnaW5Cb3R0b219KWApXG5cdFx0LmNhbGwoXG5cdFx0XHRkM1xuXHRcdFx0XHQuYXhpc0JvdHRvbSh4KVxuXHRcdFx0XHQudGlja1ZhbHVlcyh4LmRvbWFpbigpKVxuXHRcdFx0XHQudGlja0Zvcm1hdCh0aWNrRm9ybWF0dGVyRm9yQmlucyh0eXBlLCBiaW5zKSlcblx0XHRcdFx0LnRpY2tTaXplKDIuNSksXG5cdFx0KVxuXHRcdC5jYWxsKChnKSA9PiB7XG5cdFx0XHRnLnNlbGVjdChcIi5kb21haW5cIikucmVtb3ZlKCk7XG5cdFx0XHRnLmF0dHIoXCJjbGFzc1wiLCBcImdyYXlcIik7XG5cdFx0XHRnLnNlbGVjdEFsbChcIi50aWNrIHRleHRcIilcblx0XHRcdFx0LmF0dHIoXCJ0ZXh0LWFuY2hvclwiLCAoXywgaSkgPT4gaSA9PT0gMCA/IFwic3RhcnRcIiA6IFwiZW5kXCIpXG5cdFx0XHRcdC5hdHRyKFwiZHhcIiwgKF8sIGkpID0+IGkgPT09IDAgPyBcIi0wLjI1ZW1cIiA6IFwiMC4yNWVtXCIpO1xuXHRcdH0pO1xuXG5cdC8qKiBAdHlwZSB7dHlwZW9mIGZvcmVncm91bmRCYXJHcm91cCB8IHVuZGVmaW5lZH0gKi9cblx0bGV0IGZvcmVncm91bmROdWxsR3JvdXA6IHR5cGVvZiBmb3JlZ3JvdW5kQmFyR3JvdXAgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdGlmIChudWxsQ291bnQgPiAwKSB7XG5cdFx0bGV0IHhudWxsID0gZDMuc2NhbGVMaW5lYXIoKVxuXHRcdFx0LnJhbmdlKFttYXJnaW5MZWZ0LCBtYXJnaW5MZWZ0ICsgbnVsbEJpbldpZHRoXSk7XG5cblx0XHQvLyBiYWNrZ3JvdW5kIGJhciBmb3IgdGhlIG51bGwgYmluXG5cdFx0c3ZnLmFwcGVuZChcImdcIilcblx0XHRcdC5hdHRyKFwiZmlsbFwiLCBiYWNrZ3JvdW5kQmFyQ29sb3IpXG5cdFx0XHQuYXBwZW5kKFwicmVjdFwiKVxuXHRcdFx0LmF0dHIoXCJ4XCIsIHhudWxsKDApKVxuXHRcdFx0LmF0dHIoXCJ3aWR0aFwiLCB4bnVsbCgxKSAtIHhudWxsKDApKVxuXHRcdFx0LmF0dHIoXCJ5XCIsIHkobnVsbENvdW50KSlcblx0XHRcdC5hdHRyKFwiaGVpZ2h0XCIsIHkoMCkgLSB5KG51bGxDb3VudCkpO1xuXG5cdFx0Zm9yZWdyb3VuZE51bGxHcm91cCA9IHN2Z1xuXHRcdFx0LmFwcGVuZChcImdcIilcblx0XHRcdC5hdHRyKFwiZmlsbFwiLCBudWxsRmlsbENvbG9yKVxuXHRcdFx0LmF0dHIoXCJjb2xvclwiLCBudWxsRmlsbENvbG9yKTtcblxuXHRcdGZvcmVncm91bmROdWxsR3JvdXAuYXBwZW5kKFwicmVjdFwiKVxuXHRcdFx0LmF0dHIoXCJ4XCIsIHhudWxsKDApKVxuXHRcdFx0LmF0dHIoXCJ3aWR0aFwiLCB4bnVsbCgxKSAtIHhudWxsKDApKTtcblxuXHRcdC8vIEFwcGVuZCB0aGUgeC1heGlzIGFuZCBhZGQgYSBudWxsIHRpY2tcblx0XHRsZXQgYXhpc0dyb3VwID0gZm9yZWdyb3VuZE51bGxHcm91cC5hcHBlbmQoXCJnXCIpXG5cdFx0XHQuYXR0cihcInRyYW5zZm9ybVwiLCBgdHJhbnNsYXRlKDAsJHtoZWlnaHQgLSBtYXJnaW5Cb3R0b219KWApXG5cdFx0XHQuYXBwZW5kKFwiZ1wiKVxuXHRcdFx0LmF0dHIoXCJ0cmFuc2Zvcm1cIiwgYHRyYW5zbGF0ZSgke3hudWxsKDAuNSl9LCAwKWApXG5cdFx0XHQuYXR0cihcImNsYXNzXCIsIFwidGlja1wiKTtcblxuXHRcdGF4aXNHcm91cFxuXHRcdFx0LmFwcGVuZChcImxpbmVcIilcblx0XHRcdC5hdHRyKFwic3Ryb2tlXCIsIFwiY3VycmVudENvbG9yXCIpXG5cdFx0XHQuYXR0cihcInkyXCIsIDIuNSk7XG5cblx0XHRheGlzR3JvdXBcblx0XHRcdC5hcHBlbmQoXCJ0ZXh0XCIpXG5cdFx0XHQuYXR0cihcImZpbGxcIiwgXCJjdXJyZW50Q29sb3JcIilcblx0XHRcdC5hdHRyKFwieVwiLCA0LjUpXG5cdFx0XHQuYXR0cihcImR5XCIsIFwiMC43MWVtXCIpXG5cdFx0XHQuYXR0cihcInRleHQtYW5jaG9yXCIsIFwibWlkZGxlXCIpXG5cdFx0XHQudGV4dChcIlx1MjIwNVwiKVxuXHRcdFx0LmF0dHIoXCJmb250LXNpemVcIiwgXCIwLjllbVwiKVxuXHRcdFx0LmF0dHIoXCJmb250LWZhbWlseVwiLCBcInZhcigtLXNhbnMtc2VyaWYpXCIpXG5cdFx0XHQuYXR0cihcImZvbnQtd2VpZ2h0XCIsIFwibm9ybWFsXCIpO1xuXHR9XG5cblx0Ly8gQXBwbHkgc3R5bGVzIGZvciBhbGwgYXhpcyB0aWNrc1xuXHRzdmcuc2VsZWN0QWxsKFwiLnRpY2tcIilcblx0XHQuYXR0cihcImZvbnQtZmFtaWx5XCIsIFwidmFyKC0tc2Fucy1zZXJpZilcIilcblx0XHQuYXR0cihcImZvbnQtd2VpZ2h0XCIsIFwibm9ybWFsXCIpO1xuXG5cdC8qKlxuXHQgKiBAcGFyYW0ge0FycmF5PEJpbj59IGJpbnNcblx0ICogQHBhcmFtIHtudW1iZXJ9IG51bGxDb3VudFxuXHQgKi9cblx0ZnVuY3Rpb24gcmVuZGVyKGJpbnM6IEFycmF5PEJpbj4sIG51bGxDb3VudDogbnVtYmVyKSB7XG5cdFx0Zm9yZWdyb3VuZEJhckdyb3VwXG5cdFx0XHQuc2VsZWN0QWxsKFwicmVjdFwiKVxuXHRcdFx0LmRhdGEoYmlucylcblx0XHRcdC5qb2luKFwicmVjdFwiKVxuXHRcdFx0LmF0dHIoXCJ4XCIsIChkKSA9PiB4KGQueDApICsgMS41KVxuXHRcdFx0LmF0dHIoXCJ3aWR0aFwiLCAoZCkgPT4geChkLngxKSAtIHgoZC54MCkgLSAxLjUpXG5cdFx0XHQuYXR0cihcInlcIiwgKGQpID0+IHkoZC5sZW5ndGgpKVxuXHRcdFx0LmF0dHIoXCJoZWlnaHRcIiwgKGQpID0+IHkoMCkgLSB5KGQubGVuZ3RoKSk7XG5cdFx0Zm9yZWdyb3VuZE51bGxHcm91cFxuXHRcdFx0Py5zZWxlY3QoXCJyZWN0XCIpXG5cdFx0XHQuYXR0cihcInlcIiwgeShudWxsQ291bnQpKVxuXHRcdFx0LmF0dHIoXCJoZWlnaHRcIiwgeSgwKSAtIHkobnVsbENvdW50KSk7XG5cdH1cblxuXHRsZXQgc2NhbGVzID0ge1xuXHRcdHg6IE9iamVjdC5hc3NpZ24oeCwge1xuXHRcdFx0dHlwZTogXCJsaW5lYXJcIixcblx0XHRcdGRvbWFpbjogeC5kb21haW4oKSxcblx0XHRcdHJhbmdlOiB4LnJhbmdlKCksXG5cdFx0fSksXG5cdFx0eTogT2JqZWN0LmFzc2lnbih5LCB7XG5cdFx0XHR0eXBlOiBcImxpbmVhclwiLFxuXHRcdFx0ZG9tYWluOiB5LmRvbWFpbigpLFxuXHRcdFx0cmFuZ2U6IHkucmFuZ2UoKSxcblx0XHR9KSxcblx0fTtcblx0bGV0IG5vZGUgPSBzdmcubm9kZSgpO1xuXHRhc3NlcnQobm9kZSwgXCJJbmZhbGxhYmxlXCIpO1xuXG5cdHJlbmRlcihiaW5zLCBudWxsQ291bnQpO1xuXHRyZXR1cm4gT2JqZWN0LmFzc2lnbihub2RlLCB7XG5cdFx0LyoqIEBwYXJhbSB7c3RyaW5nfSB0eXBlICovXG5cdFx0c2NhbGUodHlwZTogc3RyaW5nKSB7XG5cdFx0XHQvLyBAdHMtZXhwZWN0LWVycm9yIC0gc2NhbGVzIGlzIG5vdCBkZWZpbmVkXG5cdFx0XHRsZXQgc2NhbGUgPSBzY2FsZXNbdHlwZV07XG5cdFx0XHRhc3NlcnQoc2NhbGUsIFwiSW52YWxpZCBzY2FsZSB0eXBlXCIpO1xuXHRcdFx0cmV0dXJuIHNjYWxlO1xuXHRcdH0sXG5cdFx0LyoqXG5cdFx0ICogQHBhcmFtIHtBcnJheTxCaW4+fSBiaW5zXG5cdFx0ICogQHBhcmFtIHt7IG51bGxDb3VudDogbnVtYmVyIH19IG9wdHNcblx0XHQgKi9cblx0XHR1cGRhdGUoYmluczogQXJyYXk8QmluPiwgeyBudWxsQ291bnQgfTogeyBudWxsQ291bnQ6IG51bWJlciB9KSB7XG5cdFx0XHRyZW5kZXIoYmlucywgbnVsbENvdW50KTtcblx0XHR9LFxuXHRcdHJlc2V0KCkge1xuXHRcdFx0cmVuZGVyKGJpbnMsIG51bGxDb3VudCk7XG5cdFx0fSxcblx0fSk7XG59XG4iLCAiLyoqXG4gKiBEZWZlciBhIHByb21pc2UuXG4gKlxuICogVE9ETzogU2hvdWxkIHVzZSBQcm9taXNlLndpdGhSZXNvbHZlcnMoKSB3aGVuIGF2YWlsYWJsZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRlZmVyPFN1Y2Nlc3MsIFJlamVjdD4oKToge1xuXHRwcm9taXNlOiBQcm9taXNlPFN1Y2Nlc3M+O1xuXHRyZXNvbHZlOiAodmFsdWU6IFN1Y2Nlc3MpID0+IHZvaWQ7XG5cdHJlamVjdDogKHJlYXNvbj86IFJlamVjdCkgPT4gdm9pZDtcbn0ge1xuXHRsZXQgcmVzb2x2ZTtcblx0bGV0IHJlamVjdDtcblx0bGV0IHByb21pc2UgPSBuZXcgUHJvbWlzZTxTdWNjZXNzPigocmVzLCByZWopID0+IHtcblx0XHRyZXNvbHZlID0gcmVzO1xuXHRcdHJlamVjdCA9IHJlajtcblx0fSk7XG5cdC8qKiBAdHMtZXhwZWN0LWVycm9yIC0gcmVzb2x2ZSBhbmQgcmVqZWN0IGFyZSBzZXQgKi9cblx0cmV0dXJuIHsgcHJvbWlzZSwgcmVzb2x2ZSwgcmVqZWN0IH07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7QUFBQSxZQUFZQSxTQUFRO0FBQ3BCLFlBQVksVUFBVTtBQUN0QixZQUFZQyxZQUFXO0FBQ3ZCLFlBQVksVUFBVTs7O0FDSHRCLFlBQVlDLFlBQVc7QUFHdkIsWUFBWUMsU0FBUTtBQUVwQixTQUFTLE1BQU0sU0FBQUMsY0FBNEI7QUFDM0MsWUFBWSxhQUFhO0FBQ3pCLFNBQVMsWUFBWTs7O0FDSmQsSUFBTSxpQkFBTixjQUE2QixNQUFNO0FBQUE7QUFBQSxFQUV6QyxZQUFZLFNBQWlCO0FBQzVCLFVBQU0sT0FBTztBQUNiLFNBQUssT0FBTztBQUFBLEVBQ2I7QUFDRDtBQVFP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QUFZO0FBQUEsUUFDZixNQUFNLE9BQU87QUFDWixjQUFJLEVBQUUsU0FBUyxTQUFTLE9BQU8sSUFBSSxNQUdqQztBQUNGLGVBQUssT0FBTyxTQUFTLE1BQU07QUFDM0IsaUJBQU87QUFBQSxRQUNSO0FBQUEsTUFDRDtBQUVBLGtCQUFZLGtCQUFrQixTQUFTO0FBR3ZDLFVBQUksUUFBUSxNQUFNLFlBQVk7QUFBQSxRQUN4QixXQUNILEtBQUssTUFBTSxJQUFJLGFBQWEsQ0FBQyxFQUM3QixPQUFPLEdBQUcsTUFBTSxJQUFJLFVBQVUsQ0FBQyxFQUMvQixNQUFNLENBQUMsRUFDUCxTQUFTO0FBQUEsTUFDWjtBQUNBLGVBQVMsTUFBTTtBQUVmLGFBQU8sTUFBTTtBQUNaLG9CQUFZLE1BQU07QUFBQSxNQUNuQjtBQUFBLElBQ0Q7QUFBQSxJQUNBLE9BQU8sRUFBRSxPQUFPLEdBQUcsR0FBMEI7QUFDNUMsVUFBSSxTQUFZLGNBQVUsWUFBWTtBQUN0QyxVQUFJLFFBQVEsSUFBSSxVQUFVO0FBQUEsUUFDekIsT0FBTyxNQUFNLElBQUksYUFBYTtBQUFBLFFBQzlCO0FBQUEsUUFDQSxVQUFVO0FBQUEsTUFDWCxDQUFDO0FBQ0Qsa0JBQVksUUFBUSxLQUFLO0FBQ3pCLFNBQUcsWUFBWSxNQUFNLEtBQUssQ0FBQztBQUFBLElBQzVCO0FBQUEsRUFDRDtBQUNEOyIsCiAgIm5hbWVzIjogWyJtYyIsICJhcnJvdyIsICJhcnJvdyIsICJtYyIsICJRdWVyeSIsICJmb3JtYXQiLCAiYmlucyIsICJudWxsQ291bnQiLCAidHlwZSIsICJjIiwgIlF1ZXJ5IiwgImV2ZW50IiwgImZvcm1hdCJdCn0K
