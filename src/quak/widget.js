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
import * as msql3 from "https://cdn.jsdelivr.net/npm/@uwdata/mosaic-sql@0.10.0/+esm";
import * as arrow3 from "https://esm.sh/apache-arrow@16.1.0";
import * as uuid from "https://esm.sh/@lukeed/uuid@2.0.1";

// lib/clients/DataTable.ts
import * as arrow2 from "https://esm.sh/apache-arrow@16.1.0";
import * as mc2 from "https://cdn.jsdelivr.net/npm/@uwdata/mosaic-core@0.10.0/+esm";
import * as msql2 from "https://cdn.jsdelivr.net/npm/@uwdata/mosaic-sql@0.10.0/+esm";
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
import * as msql from "https://cdn.jsdelivr.net/npm/@uwdata/mosaic-sql@0.10.0/+esm";
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
    assert(this.fieldInfo, "Field info not set");
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
      this.#orderby.filter((o) => o.order !== "unset").map(
        (o) => o.order === "asc" ? asc(o.field) : msql2.desc(o.field)
      )
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vbGliL3dpZGdldC50cyIsICIuLi8uLi9saWIvY2xpZW50cy9EYXRhVGFibGUudHMiLCAiLi4vLi4vbGliL3V0aWxzL2Fzc2VydC50cyIsICIuLi8uLi9saWIvdXRpbHMvQXN5bmNCYXRjaFJlYWRlci50cyIsICIuLi8uLi9saWIvdXRpbHMvZm9ybWF0dGluZy50cyIsICIuLi8uLi9saWIvY2xpZW50cy9IaXN0b2dyYW0udHMiLCAiLi4vLi4vbGliL2QzLnRzIiwgIi4uLy4uL2xpYi91dGlscy90aWNrLWZvcm1hdHRlci1mb3ItYmlucy50cyIsICIuLi8uLi9saWIvdXRpbHMvQ3Jvc3NmaWx0ZXJIaXN0b2dyYW1QbG90LnRzIiwgIi4uLy4uL2xpYi91dGlscy9kZWZlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0ICogYXMgbWMgZnJvbSBcIkB1d2RhdGEvbW9zYWljLWNvcmVcIjtcbmltcG9ydCAqIGFzIG1zcWwgZnJvbSBcIkB1d2RhdGEvbW9zYWljLXNxbFwiO1xuaW1wb3J0ICogYXMgYXJyb3cgZnJvbSBcImFwYWNoZS1hcnJvd1wiO1xuaW1wb3J0ICogYXMgdXVpZCBmcm9tIFwiQGx1a2VlZC91dWlkXCI7XG5pbXBvcnQgdHlwZSAqIGFzIGF3IGZyb20gXCJAYW55d2lkZ2V0L3R5cGVzXCI7XG5cbmltcG9ydCB7IERhdGFUYWJsZSB9IGZyb20gXCIuL2NsaWVudHMvRGF0YVRhYmxlLnRzXCI7XG5pbXBvcnQgeyBhc3NlcnQgfSBmcm9tIFwiLi91dGlscy9hc3NlcnQudHNcIjtcbmltcG9ydCB7IGRlZmVyIH0gZnJvbSBcIi4vdXRpbHMvZGVmZXIudHNcIjtcblxudHlwZSBNb2RlbCA9IHtcblx0X3RhYmxlX25hbWU6IHN0cmluZztcblx0X2NvbHVtbnM6IEFycmF5PHN0cmluZz47XG5cdHRlbXBfaW5kZXhlczogYm9vbGVhbjtcbn07XG5cbmludGVyZmFjZSBDb25uZWN0b3Ige1xuXHRxdWVyeShxdWVyeTogbXNxbC5RdWVyeSk6IFByb21pc2U8YXJyb3cuVGFibGUgfCBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPj47XG59XG5cbmludGVyZmFjZSBPcGVuUXVlcnkge1xuXHRxdWVyeTogUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdHN0YXJ0VGltZTogbnVtYmVyO1xuXHRyZXNvbHZlOiAoeDogYXJyb3cuVGFibGUgfCBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4gdm9pZDtcblx0cmVqZWN0OiAoZXJyPzogc3RyaW5nKSA9PiB2b2lkO1xufVxuXG5leHBvcnQgZGVmYXVsdCAoKSA9PiB7XG5cdGxldCBjb29yZGluYXRvciA9IG5ldyBtYy5Db29yZGluYXRvcigpO1xuXHRsZXQgc2NoZW1hOiBhcnJvdy5TY2hlbWE7XG5cblx0cmV0dXJuIHtcblx0XHRhc3luYyBpbml0aWFsaXplKHsgbW9kZWwgfTogYXcuSW5pdGlhbGl6ZVByb3BzPE1vZGVsPikge1xuXHRcdFx0Ly8gdHMtZXhwZWN0LWVycm9yIC0gb2sgdG8gaGF2ZSBubyBhcmdzXG5cdFx0XHRsZXQgbG9nZ2VyID0gY29vcmRpbmF0b3IubG9nZ2VyKCk7XG5cdFx0XHRsZXQgb3BlblF1ZXJpZXMgPSBuZXcgTWFwPHN0cmluZywgT3BlblF1ZXJ5PigpO1xuXG5cdFx0XHQvKipcblx0XHRcdCAqIEBwYXJhbSBxdWVyeSAtIHRoZSBxdWVyeSB0byBzZW5kXG5cdFx0XHQgKiBAcGFyYW0gcmVzb2x2ZSAtIHRoZSBwcm9taXNlIHJlc29sdmUgY2FsbGJhY2tcblx0XHRcdCAqIEBwYXJhbSByZWplY3QgLSB0aGUgcHJvbWlzZSByZWplY3QgY2FsbGJhY2tcblx0XHRcdCAqL1xuXHRcdFx0ZnVuY3Rpb24gc2VuZChcblx0XHRcdFx0cXVlcnk6IG1zcWwuUXVlcnksXG5cdFx0XHRcdHJlc29sdmU6ICh2YWx1ZTogYXJyb3cuVGFibGUgfCBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4gdm9pZCxcblx0XHRcdFx0cmVqZWN0OiAocmVhc29uPzogc3RyaW5nKSA9PiB2b2lkLFxuXHRcdFx0KSB7XG5cdFx0XHRcdGxldCBpZCA9IHV1aWQudjQoKTtcblx0XHRcdFx0b3BlblF1ZXJpZXMuc2V0KGlkLCB7XG5cdFx0XHRcdFx0cXVlcnksXG5cdFx0XHRcdFx0c3RhcnRUaW1lOiBwZXJmb3JtYW5jZS5ub3coKSxcblx0XHRcdFx0XHRyZXNvbHZlLFxuXHRcdFx0XHRcdHJlamVjdCxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdG1vZGVsLnNlbmQoeyAuLi5xdWVyeSwgdXVpZDogaWQgfSk7XG5cdFx0XHR9XG5cblx0XHRcdG1vZGVsLm9uKFwibXNnOmN1c3RvbVwiLCAobXNnLCBidWZmZXJzKSA9PiB7XG5cdFx0XHRcdGxvZ2dlci5ncm91cChgcXVlcnkgJHttc2cudXVpZH1gKTtcblx0XHRcdFx0bG9nZ2VyLmxvZyhcInJlY2VpdmVkIG1lc3NhZ2VcIiwgbXNnLCBidWZmZXJzKTtcblx0XHRcdFx0bGV0IHF1ZXJ5ID0gb3BlblF1ZXJpZXMuZ2V0KG1zZy51dWlkKTtcblx0XHRcdFx0b3BlblF1ZXJpZXMuZGVsZXRlKG1zZy51dWlkKTtcblx0XHRcdFx0YXNzZXJ0KHF1ZXJ5LCBgTm8gcXVlcnkgZm91bmQgZm9yICR7bXNnLnV1aWR9YCk7XG5cdFx0XHRcdGxvZ2dlci5sb2coXG5cdFx0XHRcdFx0cXVlcnkucXVlcnkuc3FsLFxuXHRcdFx0XHRcdChwZXJmb3JtYW5jZS5ub3coKSAtIHF1ZXJ5LnN0YXJ0VGltZSkudG9GaXhlZCgxKSxcblx0XHRcdFx0KTtcblx0XHRcdFx0aWYgKG1zZy5lcnJvcikge1xuXHRcdFx0XHRcdHF1ZXJ5LnJlamVjdChtc2cuZXJyb3IpO1xuXHRcdFx0XHRcdGxvZ2dlci5lcnJvcihtc2cuZXJyb3IpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzd2l0Y2ggKG1zZy50eXBlKSB7XG5cdFx0XHRcdFx0XHRjYXNlIFwiYXJyb3dcIjoge1xuXHRcdFx0XHRcdFx0XHRsZXQgdGFibGUgPSBhcnJvdy50YWJsZUZyb21JUEMoYnVmZmVyc1swXS5idWZmZXIpO1xuXHRcdFx0XHRcdFx0XHRsb2dnZXIubG9nKFwidGFibGVcIiwgdGFibGUpO1xuXHRcdFx0XHRcdFx0XHRxdWVyeS5yZXNvbHZlKHRhYmxlKTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjYXNlIFwianNvblwiOiB7XG5cdFx0XHRcdFx0XHRcdGxvZ2dlci5sb2coXCJqc29uXCIsIG1zZy5yZXN1bHQpO1xuXHRcdFx0XHRcdFx0XHRxdWVyeS5yZXNvbHZlKG1zZy5yZXN1bHQpO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0XHRcdFx0cXVlcnkucmVzb2x2ZSh7fSk7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRsb2dnZXIuZ3JvdXBFbmQoXCJxdWVyeVwiKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRsZXQgY29ubmVjdG9yID0ge1xuXHRcdFx0XHRxdWVyeShxdWVyeSkge1xuXHRcdFx0XHRcdGxldCB7IHByb21pc2UsIHJlc29sdmUsIHJlamVjdCB9ID0gZGVmZXI8XG5cdFx0XHRcdFx0XHRhcnJvdy5UYWJsZSB8IFJlY29yZDxzdHJpbmcsIHVua25vd24+LFxuXHRcdFx0XHRcdFx0c3RyaW5nXG5cdFx0XHRcdFx0PigpO1xuXHRcdFx0XHRcdHNlbmQocXVlcnksIHJlc29sdmUsIHJlamVjdCk7XG5cdFx0XHRcdFx0cmV0dXJuIHByb21pc2U7XG5cdFx0XHRcdH0sXG5cdFx0XHR9IHNhdGlzZmllcyBDb25uZWN0b3I7XG5cblx0XHRcdGNvb3JkaW5hdG9yLmRhdGFiYXNlQ29ubmVjdG9yKGNvbm5lY3Rvcik7XG5cblx0XHRcdC8vIGdldCBzb21lIGluaXRpYWwgZGF0YSB0byBnZXQgdGhlIHNjaGVtYVxuXHRcdFx0bGV0IGVtcHR5ID0gYXdhaXQgY29vcmRpbmF0b3IucXVlcnkoXG5cdFx0XHRcdG1zcWwuUXVlcnlcblx0XHRcdFx0XHQuZnJvbShtb2RlbC5nZXQoXCJfdGFibGVfbmFtZVwiKSlcblx0XHRcdFx0XHQuc2VsZWN0KC4uLm1vZGVsLmdldChcIl9jb2x1bW5zXCIpKVxuXHRcdFx0XHRcdC5saW1pdCgwKVxuXHRcdFx0XHRcdC50b1N0cmluZygpLFxuXHRcdFx0KTtcblx0XHRcdHNjaGVtYSA9IGVtcHR5LnNjaGVtYTtcblxuXHRcdFx0cmV0dXJuICgpID0+IHtcblx0XHRcdFx0Y29vcmRpbmF0b3IuY2xlYXIoKTtcblx0XHRcdH07XG5cdFx0fSxcblx0XHRyZW5kZXIoeyBtb2RlbCwgZWwgfTogYXcuUmVuZGVyUHJvcHM8TW9kZWw+KSB7XG5cdFx0XHRsZXQgJGJydXNoID0gbWMuU2VsZWN0aW9uLmNyb3NzZmlsdGVyKCk7XG5cdFx0XHRsZXQgdGFibGUgPSBuZXcgRGF0YVRhYmxlKHtcblx0XHRcdFx0dGFibGU6IG1vZGVsLmdldChcIl90YWJsZV9uYW1lXCIpLFxuXHRcdFx0XHRzY2hlbWE6IHNjaGVtYSxcblx0XHRcdFx0ZmlsdGVyQnk6ICRicnVzaCxcblx0XHRcdH0pO1xuXHRcdFx0Y29vcmRpbmF0b3IuY29ubmVjdCh0YWJsZSk7XG5cdFx0XHRlbC5hcHBlbmRDaGlsZCh0YWJsZS5ub2RlKCkpO1xuXHRcdH0sXG5cdH07XG59O1xuIiwgIi8vLyA8cmVmZXJlbmNlIGxpYj1cImRvbVwiIC8+XG5pbXBvcnQgKiBhcyBhcnJvdyBmcm9tIFwiYXBhY2hlLWFycm93XCI7XG5pbXBvcnQgKiBhcyBtYyBmcm9tIFwiQHV3ZGF0YS9tb3NhaWMtY29yZVwiO1xuaW1wb3J0ICogYXMgbXNxbCBmcm9tIFwiQHV3ZGF0YS9tb3NhaWMtc3FsXCI7XG5pbXBvcnQgKiBhcyBzaWduYWxzIGZyb20gXCJAcHJlYWN0L3NpZ25hbHMtY29yZVwiO1xuaW1wb3J0IHsgaHRtbCB9IGZyb20gXCJodGxcIjtcblxuaW1wb3J0IHsgQXN5bmNCYXRjaFJlYWRlciB9IGZyb20gXCIuLi91dGlscy9Bc3luY0JhdGNoUmVhZGVyLnRzXCI7XG5pbXBvcnQgeyBhc3NlcnQgfSBmcm9tIFwiLi4vdXRpbHMvYXNzZXJ0LnRzXCI7XG5pbXBvcnQge1xuXHRmb3JtYXREYXRhVHlwZU5hbWUsXG5cdGZvcm1hdHRlckZvckRhdGFUeXBlVmFsdWUsXG59IGZyb20gXCIuLi91dGlscy9mb3JtYXR0aW5nLnRzXCI7XG5cbmltcG9ydCB7IEhpc3RvZ3JhbSB9IGZyb20gXCIuL0hpc3RvZ3JhbS50c1wiO1xuXG5pbnRlcmZhY2UgRGF0YVRhYmxlT3B0aW9ucyB7XG5cdHRhYmxlOiBzdHJpbmc7XG5cdHNjaGVtYTogYXJyb3cuU2NoZW1hO1xuXHRoZWlnaHQ/OiBudW1iZXI7XG5cdGZpbHRlckJ5PzogbWMuU2VsZWN0aW9uO1xufVxuXG4vLyBUT0RPOiBtb3JlXG50eXBlIENvbHVtblN1bW1hcnlDbGllbnQgPSBIaXN0b2dyYW07XG5cbmV4cG9ydCBjbGFzcyBEYXRhVGFibGUgZXh0ZW5kcyBtYy5Nb3NhaWNDbGllbnQge1xuXHQvKiogc291cmNlIG9wdGlvbnMgKi9cblx0I3NvdXJjZTogRGF0YVRhYmxlT3B0aW9ucztcblx0LyoqIGZvciB0aGUgY29tcG9uZW50ICovXG5cdCNyb290OiBIVE1MRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG5cdC8qKiBzaGFkb3cgcm9vdCBmb3IgdGhlIGNvbXBvbmVudCAqL1xuXHQjc2hhZG93Um9vdDogU2hhZG93Um9vdCA9IHRoaXMuI3Jvb3QuYXR0YWNoU2hhZG93KHsgbW9kZTogXCJvcGVuXCIgfSk7XG5cdC8qKiBoZWFkZXIgb2YgdGhlIHRhYmxlICovXG5cdCN0aGVhZDogSFRNTFRhYmxlU2VjdGlvbkVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwidGhlYWRcIik7XG5cdC8qKiBib2R5IG9mIHRoZSB0YWJsZSAqL1xuXHQjdGJvZHk6IEhUTUxUYWJsZVNlY3Rpb25FbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInRib2R5XCIpO1xuXHQvKiogVGhlIFNRTCBvcmRlciBieSAqL1xuXHQjb3JkZXJieTogQXJyYXk8eyBmaWVsZDogc3RyaW5nOyBvcmRlcjogXCJhc2NcIiB8IFwiZGVzY1wiIHwgXCJ1bnNldFwiIH0+ID0gW107XG5cdC8qKiB0ZW1wbGF0ZSByb3cgZm9yIGRhdGEgKi9cblx0I3RlbXBsYXRlUm93OiBIVE1MVGFibGVSb3dFbGVtZW50IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHQvKiogZGl2IGNvbnRhaW5pbmcgdGhlIHRhYmxlICovXG5cdCN0YWJsZVJvb3Q6IEhUTUxEaXZFbGVtZW50O1xuXHQvKiogb2Zmc2V0IGludG8gdGhlIGRhdGEgKi9cblx0I29mZnNldDogbnVtYmVyID0gMDtcblx0LyoqIG51bWJlciBvZiByb3dzIHRvIGZldGNoICovXG5cdCNsaW1pdDogbnVtYmVyID0gMTAwO1xuXHQvKiogd2hldGhlciBhbiBpbnRlcm5hbCByZXF1ZXN0IGlzIHBlbmRpbmcgKi9cblx0I3BlbmRpbmc6IGJvb2xlYW4gPSBmYWxzZTtcblx0LyoqIG51bWJlciBvZiByb3dzIHRvIGRpc3BsYXkgKi9cblx0I3Jvd3M6IG51bWJlciA9IDExLjU7XG5cdC8qKiBoZWlnaHQgb2YgYSByb3cgKi9cblx0I3Jvd0hlaWdodDogbnVtYmVyID0gMjI7XG5cdC8qKiB3aWR0aCBvZiBhIGNvbHVtbiAqL1xuXHQjY29sdW1uV2lkdGg6IG51bWJlciA9IDEyNTtcblx0LyoqIGhlaWdodCBvZiB0aGUgaGVhZGVyICovXG5cdCNoZWFkZXJIZWlnaHQ6IHN0cmluZyA9IFwiNTBweFwiO1xuXHQvKiogdGhlIGZvcm1hdHRlciBmb3IgdGhlIGRhdGEgdGFibGUgZW50cmllcyAqL1xuXHQjZm9ybWF0OiBSZWNvcmQ8c3RyaW5nLCAodmFsdWU6IHVua25vd24pID0+IHN0cmluZz47XG5cblx0LyoqIEB0eXBlIHtBc3luY0JhdGNoUmVhZGVyPGFycm93LlN0cnVjdFJvd1Byb3h5PiB8IG51bGx9ICovXG5cdCNyZWFkZXI6IEFzeW5jQmF0Y2hSZWFkZXI8YXJyb3cuU3RydWN0Um93UHJveHk+IHwgbnVsbCA9IG51bGw7XG5cblx0Y29uc3RydWN0b3Ioc291cmNlOiBEYXRhVGFibGVPcHRpb25zKSB7XG5cdFx0c3VwZXIoc291cmNlLmZpbHRlckJ5KTtcblx0XHR0aGlzLiNzb3VyY2UgPSBzb3VyY2U7XG5cdFx0dGhpcy4jZm9ybWF0ID0gZm9ybWF0b2Yoc291cmNlLnNjaGVtYSk7XG5cdFx0dGhpcy4jcGVuZGluZyA9IGZhbHNlO1xuXG5cdFx0bGV0IG1heEhlaWdodCA9IGAkeyh0aGlzLiNyb3dzICsgMSkgKiB0aGlzLiNyb3dIZWlnaHQgLSAxfXB4YDtcblx0XHQvLyBpZiBtYXhIZWlnaHQgaXMgc2V0LCBjYWxjdWxhdGUgdGhlIG51bWJlciBvZiByb3dzIHRvIGRpc3BsYXlcblx0XHRpZiAoc291cmNlLmhlaWdodCkge1xuXHRcdFx0dGhpcy4jcm93cyA9IE1hdGguZmxvb3Ioc291cmNlLmhlaWdodCAvIHRoaXMuI3Jvd0hlaWdodCk7XG5cdFx0XHRtYXhIZWlnaHQgPSBgJHtzb3VyY2UuaGVpZ2h0fXB4YDtcblx0XHR9XG5cblx0XHRsZXQgcm9vdDogSFRNTERpdkVsZW1lbnQgPSBodG1sYDxkaXYgY2xhc3M9XCJxdWFrXCIgc3R5bGU9JHt7XG5cdFx0XHRtYXhIZWlnaHQsXG5cdFx0fX0+YDtcblx0XHQvLyBAZGVuby1mbXQtaWdub3JlXG5cdFx0cm9vdC5hcHBlbmRDaGlsZChcblx0XHRcdGh0bWwuZnJhZ21lbnRgPHRhYmxlIGNsYXNzPVwicXVha1wiIHN0eWxlPSR7eyB0YWJsZUxheW91dDogXCJmaXhlZFwiIH19PiR7dGhpcy4jdGhlYWR9JHt0aGlzLiN0Ym9keX08L3RhYmxlPmBcblx0XHQpO1xuXHRcdHRoaXMuI3NoYWRvd1Jvb3QuYXBwZW5kQ2hpbGQoaHRtbGA8c3R5bGU+JHtTVFlMRVN9PC9zdHlsZT5gKTtcblx0XHR0aGlzLiNzaGFkb3dSb290LmFwcGVuZENoaWxkKHJvb3QpO1xuXHRcdHRoaXMuI3RhYmxlUm9vdCA9IHJvb3Q7XG5cblx0XHQvLyBzY3JvbGwgZXZlbnQgbGlzdGVuZXJcblx0XHR0aGlzLiN0YWJsZVJvb3QuYWRkRXZlbnRMaXN0ZW5lcihcInNjcm9sbFwiLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRsZXQgaXNBdEJvdHRvbSA9XG5cdFx0XHRcdHRoaXMuI3RhYmxlUm9vdC5zY3JvbGxIZWlnaHQgLSB0aGlzLiN0YWJsZVJvb3Quc2Nyb2xsVG9wIDxcblx0XHRcdFx0XHR0aGlzLiNyb3dzICogdGhpcy4jcm93SGVpZ2h0ICogMS41O1xuXHRcdFx0aWYgKGlzQXRCb3R0b20pIHtcblx0XHRcdFx0YXdhaXQgdGhpcy4jYXBwZW5kUm93cyh0aGlzLiNyb3dzKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGZpZWxkcygpOiBBcnJheTx7IHRhYmxlOiBzdHJpbmc7IGNvbHVtbjogc3RyaW5nOyBzdGF0czogQXJyYXk8c3RyaW5nPiB9PiB7XG5cdFx0cmV0dXJuIHRoaXMuI2NvbHVtbnMubWFwKChjb2x1bW4pID0+ICh7XG5cdFx0XHR0YWJsZTogdGhpcy4jc291cmNlLnRhYmxlLFxuXHRcdFx0Y29sdW1uLFxuXHRcdFx0c3RhdHM6IFtdLFxuXHRcdH0pKTtcblx0fVxuXG5cdG5vZGUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuI3Jvb3Q7XG5cdH1cblxuXHRnZXQgI2NvbHVtbnMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuI3NvdXJjZS5zY2hlbWEuZmllbGRzLm1hcCgoZmllbGQpID0+IGZpZWxkLm5hbWUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBwYXJhbSB7QXJyYXk8dW5rbm93bj59IGZpbHRlclxuXHQgKi9cblx0cXVlcnkoZmlsdGVyOiBBcnJheTx1bmtub3duPiA9IFtdKSB7XG5cdFx0cmV0dXJuIG1zcWwuUXVlcnkuZnJvbSh0aGlzLiNzb3VyY2UudGFibGUpXG5cdFx0XHQuc2VsZWN0KHRoaXMuI2NvbHVtbnMpXG5cdFx0XHQud2hlcmUoZmlsdGVyKVxuXHRcdFx0Lm9yZGVyYnkoXG5cdFx0XHRcdHRoaXMuI29yZGVyYnlcblx0XHRcdFx0XHQuZmlsdGVyKChvKSA9PiBvLm9yZGVyICE9PSBcInVuc2V0XCIpXG5cdFx0XHRcdFx0Lm1hcCgobykgPT5cblx0XHRcdFx0XHRcdG8ub3JkZXIgPT09IFwiYXNjXCIgPyBhc2Moby5maWVsZCkgOiBtc3FsLmRlc2Moby5maWVsZClcblx0XHRcdFx0XHQpLFxuXHRcdFx0KVxuXHRcdFx0LmxpbWl0KHRoaXMuI2xpbWl0KVxuXHRcdFx0Lm9mZnNldCh0aGlzLiNvZmZzZXQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEEgbW9zaWFjIGxpZmVjeWNsZSBmdW5jdGlvbiB0aGF0IGlzIGNhbGxlZCB3aXRoIHRoZSByZXN1bHRzIGZyb20gYHF1ZXJ5YC5cblx0ICogTXVzdCBiZSBzeW5jaHJvbm91cywgYW5kIHJldHVybiBgdGhpc2AuXG5cdCAqL1xuXHRxdWVyeVJlc3VsdChkYXRhOiBhcnJvdy5UYWJsZSkge1xuXHRcdGlmICghdGhpcy4jcGVuZGluZykge1xuXHRcdFx0Ly8gZGF0YSBpcyBub3QgZnJvbSBhbiBpbnRlcm5hbCByZXF1ZXN0LCBzbyByZXNldCB0YWJsZVxuXHRcdFx0dGhpcy4jcmVhZGVyID0gbmV3IEFzeW5jQmF0Y2hSZWFkZXIoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLiNwZW5kaW5nID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5yZXF1ZXN0RGF0YSh0aGlzLiNvZmZzZXQgKyB0aGlzLiNsaW1pdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuI3Rib2R5LnJlcGxhY2VDaGlsZHJlbigpO1xuXHRcdFx0dGhpcy4jb2Zmc2V0ID0gMDtcblx0XHR9XG5cdFx0dGhpcy4jcmVhZGVyPy5lbnF1ZXVlQmF0Y2goZGF0YVtTeW1ib2wuaXRlcmF0b3JdKCksIHtcblx0XHRcdGxhc3Q6IGRhdGEubnVtUm93cyA8IHRoaXMuI2xpbWl0LFxuXHRcdH0pO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0dXBkYXRlKCkge1xuXHRcdGlmICghdGhpcy4jcGVuZGluZykge1xuXHRcdFx0Ly8gb24gdGhlIGZpcnN0IHVwZGF0ZSwgcG9wdWxhdGUgdGhlIHRhYmxlIHdpdGggaW5pdGlhbCBkYXRhXG5cdFx0XHR0aGlzLiNhcHBlbmRSb3dzKHRoaXMuI3Jvd3MgKiAyKTtcblx0XHR9XG5cdFx0dGhpcy4jcGVuZGluZyA9IGZhbHNlO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0cmVxdWVzdERhdGEob2Zmc2V0ID0gMCkge1xuXHRcdHRoaXMuI29mZnNldCA9IG9mZnNldDtcblxuXHRcdC8vIHJlcXVlc3QgbmV4dCBkYXRhIGJhdGNoXG5cdFx0bGV0IHF1ZXJ5ID0gdGhpcy5xdWVyeSh0aGlzLmZpbHRlckJ5Py5wcmVkaWNhdGUodGhpcykpO1xuXHRcdHRoaXMucmVxdWVzdFF1ZXJ5KHF1ZXJ5KTtcblxuXHRcdC8vIHByZWZldGNoIHN1YnNlcXVlbnQgZGF0YSBiYXRjaFxuXHRcdHRoaXMuY29vcmRpbmF0b3IucHJlZmV0Y2gocXVlcnkuY2xvbmUoKS5vZmZzZXQob2Zmc2V0ICsgdGhpcy4jbGltaXQpKTtcblx0fVxuXG5cdC8qKiBAcGFyYW0ge0FycmF5PEluZm8+fSBpbmZvcyAqL1xuXHRmaWVsZEluZm8oaW5mb3M6IEFycmF5PEluZm8+KSB7XG5cdFx0bGV0IGNsYXNzZXMgPSBjbGFzc29mKHRoaXMuI3NvdXJjZS5zY2hlbWEpO1xuXG5cdFx0Ly8gQGRlbm8tZm10LWlnbm9yZVxuXHRcdHRoaXMuI3RlbXBsYXRlUm93ID0gaHRtbGA8dHI+PHRkPjwvdGQ+JHtcblx0XHRcdGluZm9zLm1hcCgoaW5mbykgPT4gaHRtbC5mcmFnbWVudGA8dGQgY2xhc3M9JHtjbGFzc2VzW2luZm8uY29sdW1uXX0+PC90ZD5gKVxuXHRcdH1cblx0XHRcdDx0ZCBzdHlsZT0ke3sgd2lkdGg6IFwiOTklXCIsIGJvcmRlckxlZnQ6IFwibm9uZVwiLCBib3JkZXJSaWdodDogXCJub25lXCIgfX0+PC90ZD5cblx0XHQ8L3RyPmA7XG5cblx0XHRsZXQgb2JzZXJ2ZXIgPSBuZXcgSW50ZXJzZWN0aW9uT2JzZXJ2ZXIoKGVudHJpZXMpID0+IHtcblx0XHRcdGZvciAobGV0IGVudHJ5IG9mIGVudHJpZXMpIHtcblx0XHRcdFx0LyoqIEB0eXBlIHtDb2x1bW5TdW1tYXJ5Q2xpZW50IHwgdW5kZWZpbmVkfSAqL1xuXHRcdFx0XHRsZXQgdmlzOiBDb2x1bW5TdW1tYXJ5Q2xpZW50IHwgdW5kZWZpbmVkID1cblx0XHRcdFx0XHQvKiogQHR5cGUge2FueX0gKi8gKGVudHJ5LnRhcmdldCkudmlzO1xuXHRcdFx0XHRpZiAoIXZpcykgY29udGludWU7XG5cdFx0XHRcdGlmIChlbnRyeS5pc0ludGVyc2VjdGluZykge1xuXHRcdFx0XHRcdHRoaXMuY29vcmRpbmF0b3IuY29ubmVjdCh2aXMpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuY29vcmRpbmF0b3I/LmRpc2Nvbm5lY3QodmlzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sIHtcblx0XHRcdHJvb3Q6IHRoaXMuI3RhYmxlUm9vdCxcblx0XHR9KTtcblxuXHRcdGxldCBjb2xzID0gdGhpcy4jc291cmNlLnNjaGVtYS5maWVsZHMubWFwKChmaWVsZCkgPT4ge1xuXHRcdFx0bGV0IGluZm8gPSBpbmZvcy5maW5kKChjKSA9PiBjLmNvbHVtbiA9PT0gZmllbGQubmFtZSk7XG5cdFx0XHRhc3NlcnQoaW5mbywgYE5vIGluZm8gZm9yIGNvbHVtbiAke2ZpZWxkLm5hbWV9YCk7XG5cdFx0XHRsZXQgdmlzOiBDb2x1bW5TdW1tYXJ5Q2xpZW50IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGluZm8udHlwZSA9PT0gXCJudW1iZXJcIiB8fCBpbmZvLnR5cGUgPT09IFwiZGF0ZVwiKSB7XG5cdFx0XHRcdHZpcyA9IG5ldyBIaXN0b2dyYW0oe1xuXHRcdFx0XHRcdHRhYmxlOiB0aGlzLiNzb3VyY2UudGFibGUsXG5cdFx0XHRcdFx0Y29sdW1uOiBmaWVsZC5uYW1lLFxuXHRcdFx0XHRcdHR5cGU6IGluZm8udHlwZSxcblx0XHRcdFx0XHRmaWx0ZXJCeTogdGhpcy4jc291cmNlLmZpbHRlckJ5LFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGxldCB0aCA9IHRoY29sKGZpZWxkLCB0aGlzLiNjb2x1bW5XaWR0aCwgdmlzKTtcblx0XHRcdG9ic2VydmVyLm9ic2VydmUodGgpO1xuXHRcdFx0cmV0dXJuIHRoO1xuXHRcdH0pO1xuXG5cdFx0c2lnbmFscy5lZmZlY3QoKCkgPT4ge1xuXHRcdFx0dGhpcy4jb3JkZXJieSA9IGNvbHMubWFwKChjb2wsIGkpID0+ICh7XG5cdFx0XHRcdGZpZWxkOiB0aGlzLiNjb2x1bW5zW2ldLFxuXHRcdFx0XHRvcmRlcjogY29sLnNvcnRTdGF0ZS52YWx1ZSxcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMucmVxdWVzdERhdGEoKTtcblx0XHR9KTtcblxuXHRcdC8vIEBkZW5vLWZtdC1pZ25vcmVcblx0XHR0aGlzLiN0aGVhZC5hcHBlbmRDaGlsZChcblx0XHRcdGh0bWxgPHRyIHN0eWxlPSR7eyBoZWlnaHQ6IHRoaXMuI2hlYWRlckhlaWdodCB9fT5cblx0XHRcdFx0PHRoPjwvdGg+XG5cdFx0XHRcdCR7Y29sc31cblx0XHRcdFx0PHRoIHN0eWxlPSR7eyB3aWR0aDogXCI5OSVcIiwgYm9yZGVyTGVmdDogXCJub25lXCIsIGJvcmRlclJpZ2h0OiBcIm5vbmVcIiB9fT48L3RoPlxuXHRcdFx0PC90cj5gLFxuXHRcdCk7XG5cblx0XHQvLyBoaWdobGlnaHQgb24gaG92ZXJcblx0XHR7XG5cdFx0XHR0aGlzLiN0YWJsZVJvb3QuYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNlb3ZlclwiLCAoZXZlbnQpID0+IHtcblx0XHRcdFx0aWYgKFxuXHRcdFx0XHRcdGlzVGFibGVDZWxsRWxlbWVudChldmVudC50YXJnZXQpICYmXG5cdFx0XHRcdFx0aXNUYWJsZVJvd0VsZW1lbnQoZXZlbnQudGFyZ2V0LnBhcmVudE5vZGUpXG5cdFx0XHRcdCkge1xuXHRcdFx0XHRcdGNvbnN0IGNlbGwgPSBldmVudC50YXJnZXQ7XG5cdFx0XHRcdFx0Y29uc3Qgcm93ID0gZXZlbnQudGFyZ2V0LnBhcmVudE5vZGU7XG5cdFx0XHRcdFx0aGlnaGxpZ2h0KGNlbGwsIHJvdyk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0dGhpcy4jdGFibGVSb290LmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZW91dFwiLCAoZXZlbnQpID0+IHtcblx0XHRcdFx0aWYgKFxuXHRcdFx0XHRcdGlzVGFibGVDZWxsRWxlbWVudChldmVudC50YXJnZXQpICYmXG5cdFx0XHRcdFx0aXNUYWJsZVJvd0VsZW1lbnQoZXZlbnQudGFyZ2V0LnBhcmVudE5vZGUpXG5cdFx0XHRcdCkge1xuXHRcdFx0XHRcdGNvbnN0IGNlbGwgPSBldmVudC50YXJnZXQ7XG5cdFx0XHRcdFx0Y29uc3Qgcm93ID0gZXZlbnQudGFyZ2V0LnBhcmVudE5vZGU7XG5cdFx0XHRcdFx0cmVtb3ZlSGlnaGxpZ2h0KGNlbGwsIHJvdyk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0LyoqIE51bWJlciBvZiByb3dzIHRvIGFwcGVuZCAqL1xuXHRhc3luYyAjYXBwZW5kUm93cyhucm93czogbnVtYmVyKSB7XG5cdFx0bnJvd3MgPSBNYXRoLnRydW5jKG5yb3dzKTtcblx0XHR3aGlsZSAobnJvd3MgPj0gMCkge1xuXHRcdFx0bGV0IHJlc3VsdCA9IGF3YWl0IHRoaXMuI3JlYWRlcj8ubmV4dCgpO1xuXHRcdFx0aWYgKCFyZXN1bHQgfHwgcmVzdWx0Py5kb25lKSB7XG5cdFx0XHRcdC8vIHdlJ3ZlIGV4aGF1c3RlZCBhbGwgcm93c1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdHRoaXMuI2FwcGVuZFJvdyhyZXN1bHQudmFsdWUucm93LCByZXN1bHQudmFsdWUuaW5kZXgpO1xuXHRcdFx0bnJvd3MtLTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0fVxuXG5cdCNhcHBlbmRSb3coZDogYXJyb3cuU3RydWN0Um93UHJveHksIGk6IG51bWJlcikge1xuXHRcdGxldCBpdHIgPSB0aGlzLiN0ZW1wbGF0ZVJvdz8uY2xvbmVOb2RlKHRydWUpO1xuXHRcdGFzc2VydChpdHIsIFwiTXVzdCBoYXZlIGEgZGF0YSByb3dcIik7XG5cdFx0bGV0IHRkID0gLyoqIEB0eXBlIHtIVE1MVGFibGVDZWxsRWxlbWVudH0gKi8gKGl0cj8uY2hpbGROb2Rlc1swXSk7XG5cdFx0dGQuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoU3RyaW5nKGkpKSk7XG5cdFx0Zm9yIChsZXQgaiA9IDA7IGogPCB0aGlzLiNjb2x1bW5zLmxlbmd0aDsgKytqKSB7XG5cdFx0XHR0ZCA9IC8qKiBAdHlwZSB7SFRNTFRhYmxlQ2VsbEVsZW1lbnR9ICovIChpdHIuY2hpbGROb2Rlc1tqICsgMV0pO1xuXHRcdFx0dGQuY2xhc3NMaXN0LnJlbW92ZShcImdyYXlcIik7XG5cdFx0XHRsZXQgY29sID0gdGhpcy4jY29sdW1uc1tqXTtcblx0XHRcdC8qKiBAdHlwZSB7c3RyaW5nfSAqL1xuXHRcdFx0bGV0IHN0cmluZ2lmaWVkOiBzdHJpbmcgPSB0aGlzLiNmb3JtYXRbY29sXShkW2NvbF0pO1xuXHRcdFx0aWYgKHNob3VsZEdyYXlvdXRWYWx1ZShzdHJpbmdpZmllZCkpIHtcblx0XHRcdFx0dGQuY2xhc3NMaXN0LmFkZChcImdyYXlcIik7XG5cdFx0XHR9XG5cdFx0XHRsZXQgdmFsdWUgPSBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShzdHJpbmdpZmllZCk7XG5cdFx0XHR0ZC5hcHBlbmRDaGlsZCh2YWx1ZSk7XG5cdFx0fVxuXHRcdHRoaXMuI3Rib2R5LmFwcGVuZChpdHIpO1xuXHR9XG59XG5cbmNvbnN0IFRSVU5DQVRFID0gLyoqIEB0eXBlIHtjb25zdH0gKi8gKHtcblx0d2hpdGVTcGFjZTogXCJub3dyYXBcIixcblx0b3ZlcmZsb3c6IFwiaGlkZGVuXCIsXG5cdHRleHRPdmVyZmxvdzogXCJlbGxpcHNpc1wiLFxufSk7XG5cbi8qKlxuICogQHBhcmFtIHthcnJvdy5GaWVsZH0gZmllbGRcbiAqIEBwYXJhbSB7bnVtYmVyfSBtaW5XaWR0aFxuICogQHBhcmFtIHtDb2x1bW5TdW1tYXJ5Q2xpZW50fSBbdmlzXVxuICovXG5mdW5jdGlvbiB0aGNvbChmaWVsZDogYXJyb3cuRmllbGQsIG1pbldpZHRoOiBudW1iZXIsIHZpczogSGlzdG9ncmFtKSB7XG5cdGxldCBidXR0b25WaXNpYmxlID0gc2lnbmFscy5zaWduYWwoZmFsc2UpO1xuXHRsZXQgd2lkdGggPSBzaWduYWxzLnNpZ25hbChtaW5XaWR0aCk7XG5cdGxldCBzb3J0U3RhdGU6IHNpZ25hbHMuU2lnbmFsPFwidW5zZXRcIiB8IFwiYXNjXCIgfCBcImRlc2NcIj4gPSBzaWduYWxzLnNpZ25hbChcblx0XHRcInVuc2V0XCIsXG5cdCk7XG5cblx0ZnVuY3Rpb24gbmV4dFNvcnRTdGF0ZSgpIHtcblx0XHQvLyBzaW1wbGUgc3RhdGUgbWFjaGluZVxuXHRcdC8vIHVuc2V0IC0+IGFzYyAtPiBkZXNjIC0+IHVuc2V0XG5cdFx0c29ydFN0YXRlLnZhbHVlID0gLyoqIEB0eXBlIHtjb25zdH0gKi8gKHtcblx0XHRcdFwidW5zZXRcIjogXCJhc2NcIixcblx0XHRcdFwiYXNjXCI6IFwiZGVzY1wiLFxuXHRcdFx0XCJkZXNjXCI6IFwidW5zZXRcIixcblx0XHR9KVtzb3J0U3RhdGUudmFsdWVdO1xuXHR9XG5cblx0Ly8gQGRlbm8tZm10LWlnbm9yZVxuXHRsZXQgc3ZnID0gaHRtbGA8c3ZnIHN0eWxlPSR7eyB3aWR0aDogXCIxLjVlbVwiIH19IGZpbGw9XCJub25lXCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIHN0cm9rZS13aWR0aD1cIjEuNVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiPlxuXHRcdDxwYXRoIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiIGQ9XCJNOC4yNSA5TDEyIDUuMjVMMTUuNzUgOVwiIC8+XG5cdFx0PHBhdGggc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCIgZD1cIk04LjI1IDE1TDEyIDE4Ljc1TDE1Ljc1IDE1XCIgLz5cblx0PC9zdmc+YDtcblx0LyoqIEB0eXBlIHtTVkdQYXRoRWxlbWVudH0gKi9cblx0bGV0IHVwYXJyb3c6IFNWR1BhdGhFbGVtZW50ID0gc3ZnLmNoaWxkcmVuWzBdO1xuXHQvKiogQHR5cGUge1NWR1BhdGhFbGVtZW50fSAqL1xuXHRsZXQgZG93bmFycm93OiBTVkdQYXRoRWxlbWVudCA9IHN2Zy5jaGlsZHJlblsxXTtcblx0LyoqIEB0eXBlIHtIVE1MRGl2RWxlbWVudH0gKi9cblx0bGV0IHZlcnRpY2FsUmVzaXplSGFuZGxlOiBIVE1MRGl2RWxlbWVudCA9XG5cdFx0aHRtbGA8ZGl2IGNsYXNzPVwicmVzaXplLWhhbmRsZVwiPjwvZGl2PmA7XG5cdC8vIEBkZW5vLWZtdC1pZ25vcmVcblx0bGV0IHNvcnRCdXR0b24gPSBodG1sYDxzcGFuIGFyaWEtcm9sZT1cImJ1dHRvblwiIGNsYXNzPVwic29ydC1idXR0b25cIiBvbm1vdXNlZG93bj0ke25leHRTb3J0U3RhdGV9PiR7c3ZnfTwvc3Bhbj5gO1xuXHQvLyBAZGVuby1mbXQtaWdub3JlXG5cdC8qKiBAdHlwZSB7SFRNTFRhYmxlQ2VsbEVsZW1lbnR9ICovXG5cdGxldCB0aDogSFRNTFRhYmxlQ2VsbEVsZW1lbnQgPSBodG1sYDx0aCB0aXRsZT0ke2ZpZWxkLm5hbWV9PlxuXHRcdDxkaXYgc3R5bGU9JHt7IGRpc3BsYXk6IFwiZmxleFwiLCBqdXN0aWZ5Q29udGVudDogXCJzcGFjZS1iZXR3ZWVuXCIsIGFsaWduSXRlbXM6IFwiY2VudGVyXCIgfX0+XG5cdFx0XHQ8c3BhbiBzdHlsZT0ke3sgbWFyZ2luQm90dG9tOiBcIjVweFwiLCBtYXhXaWR0aDogXCIyNTBweFwiLCAuLi5UUlVOQ0FURSB9fT4ke2ZpZWxkLm5hbWV9PC9zcGFuPlxuXHRcdFx0JHtzb3J0QnV0dG9ufVxuXHRcdDwvZGl2PlxuXHRcdCR7dmVydGljYWxSZXNpemVIYW5kbGV9XG5cdFx0PHNwYW4gY2xhc3M9XCJncmF5XCIgc3R5bGU9JHt7IGZvbnRXZWlnaHQ6IDQwMCwgZm9udFNpemU6IFwiMTJweFwiLCB1c2VyU2VsZWN0OiBcIm5vbmVcIiB9fT4ke2Zvcm1hdERhdGFUeXBlTmFtZShmaWVsZC50eXBlKX08L3NwYW4+XG5cdFx0JHt2aXM/LnBsb3Q/Lm5vZGUoKX1cblx0PC90aD5gO1xuXG5cdHNpZ25hbHMuZWZmZWN0KCgpID0+IHtcblx0XHR1cGFycm93LnNldEF0dHJpYnV0ZShcInN0cm9rZVwiLCBcInZhcigtLW1vb24tZ3JheSlcIik7XG5cdFx0ZG93bmFycm93LnNldEF0dHJpYnV0ZShcInN0cm9rZVwiLCBcInZhcigtLW1vb24tZ3JheSlcIik7XG5cdFx0Ly8gQGRlbm8tZm10LWlnbm9yZVxuXHRcdGxldCBlbGVtZW50ID0geyBcImFzY1wiOiB1cGFycm93LCBcImRlc2NcIjogZG93bmFycm93LCBcInVuc2V0XCI6IG51bGwgfVtzb3J0U3RhdGUudmFsdWVdO1xuXHRcdGVsZW1lbnQ/LnNldEF0dHJpYnV0ZShcInN0cm9rZVwiLCBcInZhcigtLWRhcmstZ3JheSlcIik7XG5cdH0pO1xuXG5cdHNpZ25hbHMuZWZmZWN0KCgpID0+IHtcblx0XHRzb3J0QnV0dG9uLnN0eWxlLnZpc2liaWxpdHkgPSBidXR0b25WaXNpYmxlLnZhbHVlXG5cdFx0XHQ/IFwidmlzaWJsZVwiXG5cdFx0XHQ6IFwiaGlkZGVuXCI7XG5cdH0pO1xuXG5cdHNpZ25hbHMuZWZmZWN0KCgpID0+IHtcblx0XHR0aC5zdHlsZS53aWR0aCA9IGAke3dpZHRoLnZhbHVlfXB4YDtcblx0fSk7XG5cblx0dGguYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNlb3ZlclwiLCAoKSA9PiB7XG5cdFx0aWYgKHNvcnRTdGF0ZS52YWx1ZSA9PT0gXCJ1bnNldFwiKSBidXR0b25WaXNpYmxlLnZhbHVlID0gdHJ1ZTtcblx0fSk7XG5cblx0dGguYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNlbGVhdmVcIiwgKCkgPT4ge1xuXHRcdGlmIChzb3J0U3RhdGUudmFsdWUgPT09IFwidW5zZXRcIikgYnV0dG9uVmlzaWJsZS52YWx1ZSA9IGZhbHNlO1xuXHR9KTtcblxuXHR0aC5hZGRFdmVudExpc3RlbmVyKFwiZGJsY2xpY2tcIiwgKGV2ZW50KSA9PiB7XG5cdFx0Ly8gcmVzZXQgY29sdW1uIHdpZHRoIGJ1dCB3ZSBkb24ndCB3YW50IHRvIGludGVyZmVyZSB3aXRoIHNvbWVvbmVcblx0XHQvLyBkb3VibGUtY2xpY2tpbmcgdGhlIHNvcnQgYnV0dG9uXG5cdFx0Ly8gaWYgdGhlIG1vdXNlIGlzIHdpdGhpbiB0aGUgc29ydCBidXR0b24sIGRvbid0IHJlc2V0IHRoZSB3aWR0aFxuXHRcdGlmIChcblx0XHRcdGV2ZW50Lm9mZnNldFggPCBzb3J0QnV0dG9uLm9mZnNldFdpZHRoICYmXG5cdFx0XHRldmVudC5vZmZzZXRZIDwgc29ydEJ1dHRvbi5vZmZzZXRIZWlnaHRcblx0XHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0d2lkdGgudmFsdWUgPSBtaW5XaWR0aDtcblx0fSk7XG5cblx0dmVydGljYWxSZXNpemVIYW5kbGUuYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNlZG93blwiLCAoZXZlbnQpID0+IHtcblx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdGxldCBzdGFydFggPSBldmVudC5jbGllbnRYO1xuXHRcdGxldCBzdGFydFdpZHRoID0gdGgub2Zmc2V0V2lkdGggLVxuXHRcdFx0cGFyc2VGbG9hdChnZXRDb21wdXRlZFN0eWxlKHRoKS5wYWRkaW5nTGVmdCkgLVxuXHRcdFx0cGFyc2VGbG9hdChnZXRDb21wdXRlZFN0eWxlKHRoKS5wYWRkaW5nUmlnaHQpO1xuXHRcdGZ1bmN0aW9uIG9uTW91c2VNb3ZlKC8qKiBAdHlwZSB7TW91c2VFdmVudH0gKi8gZXZlbnQ6IE1vdXNlRXZlbnQpIHtcblx0XHRcdGxldCBkeCA9IGV2ZW50LmNsaWVudFggLSBzdGFydFg7XG5cdFx0XHR3aWR0aC52YWx1ZSA9IE1hdGgubWF4KG1pbldpZHRoLCBzdGFydFdpZHRoICsgZHgpO1xuXHRcdFx0dmVydGljYWxSZXNpemVIYW5kbGUuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gXCJ2YXIoLS1saWdodC1zaWx2ZXIpXCI7XG5cdFx0fVxuXHRcdGZ1bmN0aW9uIG9uTW91c2VVcCgpIHtcblx0XHRcdHZlcnRpY2FsUmVzaXplSGFuZGxlLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IFwidHJhbnNwYXJlbnRcIjtcblx0XHRcdGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtb3VzZW1vdmVcIiwgb25Nb3VzZU1vdmUpO1xuXHRcdFx0ZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1vdXNldXBcIiwgb25Nb3VzZVVwKTtcblx0XHR9XG5cdFx0ZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNlbW92ZVwiLCBvbk1vdXNlTW92ZSk7XG5cdFx0ZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNldXBcIiwgb25Nb3VzZVVwKTtcblx0fSk7XG5cblx0dmVydGljYWxSZXNpemVIYW5kbGUuYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNlb3ZlclwiLCAoKSA9PiB7XG5cdFx0dmVydGljYWxSZXNpemVIYW5kbGUuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gXCJ2YXIoLS1saWdodC1zaWx2ZXIpXCI7XG5cdH0pO1xuXG5cdHZlcnRpY2FsUmVzaXplSGFuZGxlLmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZWxlYXZlXCIsICgpID0+IHtcblx0XHR2ZXJ0aWNhbFJlc2l6ZUhhbmRsZS5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBcInRyYW5zcGFyZW50XCI7XG5cdH0pO1xuXG5cdHJldHVybiBPYmplY3QuYXNzaWduKHRoLCB7IHZpcywgc29ydFN0YXRlIH0pO1xufVxuXG5jb25zdCBTVFlMRVMgPSAvKmNzcyovIGBcXFxuOmhvc3Qge1xuICBhbGw6IGluaXRpYWw7XG4gIC0tc2Fucy1zZXJpZjogLWFwcGxlLXN5c3RlbSwgQmxpbmtNYWNTeXN0ZW1Gb250LCBcImF2ZW5pciBuZXh0XCIsIGF2ZW5pciwgaGVsdmV0aWNhLCBcImhlbHZldGljYSBuZXVlXCIsIHVidW50dSwgcm9ib3RvLCBub3RvLCBcInNlZ29lIHVpXCIsIGFyaWFsLCBzYW5zLXNlcmlmO1xuICAtLWxpZ2h0LXNpbHZlcjogI2VmZWZlZjtcbiAgLS1zcGFjaW5nLW5vbmU6IDA7XG4gIC0td2hpdGU6ICNmZmY7XG4gIC0tZ3JheTogIzkyOTI5MjtcbiAgLS1kYXJrLWdyYXk6ICMzMzM7XG4gIC0tbW9vbi1ncmF5OiAjYzRjNGM0O1xuICAtLW1pZC1ncmF5OiAjNmU2ZTZlO1xufVxuXG4uaGlnaGxpZ2h0IHtcblx0YmFja2dyb3VuZC1jb2xvcjogdmFyKC0tbGlnaHQtc2lsdmVyKTtcbn1cblxuLmhpZ2hsaWdodC1jZWxsIHtcblx0Ym9yZGVyOiAxcHggc29saWQgdmFyKC0tbW9vbi1ncmF5KTtcbn1cblxuLnF1YWsge1xuICBib3JkZXItcmFkaXVzOiAwLjJyZW07XG4gIGJvcmRlcjogMXB4IHNvbGlkIHZhcigtLWxpZ2h0LXNpbHZlcik7XG4gIG92ZXJmbG93LXk6IGF1dG87XG59XG5cbnRhYmxlIHtcbiAgYm9yZGVyLWNvbGxhcHNlOiBzZXBhcmF0ZTtcbiAgYm9yZGVyLXNwYWNpbmc6IDA7XG4gIHdoaXRlLXNwYWNlOiBub3dyYXA7XG4gIGJveC1zaXppbmc6IGJvcmRlci1ib3g7XG5cbiAgbWFyZ2luOiB2YXIoLS1zcGFjaW5nLW5vbmUpO1xuICBjb2xvcjogdmFyKC0tZGFyay1ncmF5KTtcbiAgZm9udDogMTNweCAvIDEuMiB2YXIoLS1zYW5zLXNlcmlmKTtcblxuICB3aWR0aDogMTAwJTtcbn1cblxudGhlYWQge1xuICBwb3NpdGlvbjogc3RpY2t5O1xuICB2ZXJ0aWNhbC1hbGlnbjogdG9wO1xuICB0ZXh0LWFsaWduOiBsZWZ0O1xuICB0b3A6IDA7XG59XG5cbnRkIHtcbiAgYm9yZGVyOiAxcHggc29saWQgdmFyKC0tbGlnaHQtc2lsdmVyKTtcbiAgYm9yZGVyLWJvdHRvbTogc29saWQgMXB4IHRyYW5zcGFyZW50O1xuICBib3JkZXItcmlnaHQ6IHNvbGlkIDFweCB0cmFuc3BhcmVudDtcbiAgb3ZlcmZsb3c6IGhpZGRlbjtcbiAgLW8tdGV4dC1vdmVyZmxvdzogZWxsaXBzaXM7XG4gIHRleHQtb3ZlcmZsb3c6IGVsbGlwc2lzO1xuICBwYWRkaW5nOiA0cHggNnB4O1xufVxuXG50cjpmaXJzdC1jaGlsZCB0ZCB7XG4gIGJvcmRlci10b3A6IHNvbGlkIDFweCB0cmFuc3BhcmVudDtcbn1cblxudGgge1xuICBkaXNwbGF5OiB0YWJsZS1jZWxsO1xuICB2ZXJ0aWNhbC1hbGlnbjogaW5oZXJpdDtcbiAgZm9udC13ZWlnaHQ6IGJvbGQ7XG4gIHRleHQtYWxpZ246IC1pbnRlcm5hbC1jZW50ZXI7XG4gIHVuaWNvZGUtYmlkaTogaXNvbGF0ZTtcblxuICBwb3NpdGlvbjogcmVsYXRpdmU7XG4gIGJhY2tncm91bmQ6IHZhcigtLXdoaXRlKTtcbiAgYm9yZGVyLWJvdHRvbTogc29saWQgMXB4IHZhcigtLWxpZ2h0LXNpbHZlcik7XG4gIGJvcmRlci1sZWZ0OiBzb2xpZCAxcHggdmFyKC0tbGlnaHQtc2lsdmVyKTtcbiAgcGFkZGluZzogNXB4IDZweCAwIDZweDtcbn1cblxuLm51bWJlciwgLmRhdGUge1xuICBmb250LXZhcmlhbnQtbnVtZXJpYzogdGFidWxhci1udW1zO1xufVxuXG4uZ3JheSB7XG4gIGNvbG9yOiB2YXIoLS1ncmF5KTtcbn1cblxuLm51bWJlciB7XG4gIHRleHQtYWxpZ246IHJpZ2h0O1xufVxuXG50ZDpudGgtY2hpbGQoMSksIHRoOm50aC1jaGlsZCgxKSB7XG4gIGZvbnQtdmFyaWFudC1udW1lcmljOiB0YWJ1bGFyLW51bXM7XG4gIHRleHQtYWxpZ246IGNlbnRlcjtcbiAgY29sb3I6IHZhcigtLW1vb24tZ3JheSk7XG4gIHBhZGRpbmc6IDAgNHB4O1xufVxuXG50ZDpmaXJzdC1jaGlsZCwgdGg6Zmlyc3QtY2hpbGQge1xuICBib3JkZXItbGVmdDogbm9uZTtcbn1cblxudGg6Zmlyc3QtY2hpbGQge1xuICBib3JkZXItbGVmdDogbm9uZTtcbiAgdmVydGljYWwtYWxpZ246IHRvcDtcbiAgd2lkdGg6IDIwcHg7XG4gIHBhZGRpbmc6IDdweDtcbn1cblxudGQ6bnRoLWxhc3QtY2hpbGQoMiksIHRoOm50aC1sYXN0LWNoaWxkKDIpIHtcbiAgYm9yZGVyLXJpZ2h0OiAxcHggc29saWQgdmFyKC0tbGlnaHQtc2lsdmVyKTtcbn1cblxudHI6Zmlyc3QtY2hpbGQgdGQge1xuXHRib3JkZXItdG9wOiBzb2xpZCAxcHggdHJhbnNwYXJlbnQ7XG59XG5cbi5yZXNpemUtaGFuZGxlIHtcblx0d2lkdGg6IDVweDtcblx0aGVpZ2h0OiAxMDAlO1xuXHRiYWNrZ3JvdW5kLWNvbG9yOiB0cmFuc3BhcmVudDtcblx0cG9zaXRpb246IGFic29sdXRlO1xuXHRyaWdodDogLTIuNXB4O1xuXHR0b3A6IDA7XG5cdGN1cnNvcjogZXctcmVzaXplO1xuXHR6LWluZGV4OiAxO1xufVxuXG4uc29ydC1idXR0b24ge1xuXHRjdXJzb3I6IHBvaW50ZXI7XG5cdGJhY2tncm91bmQtY29sb3I6IHZhcigtLXdoaXRlKTtcblx0dXNlci1zZWxlY3Q6IG5vbmU7XG59XG5gO1xuXG4vKipcbiAqIFJldHVybiBhIGZvcm1hdHRlciBmb3IgZWFjaCBmaWVsZCBpbiB0aGUgc2NoZW1hXG4gKi9cbmZ1bmN0aW9uIGZvcm1hdG9mKHNjaGVtYTogYXJyb3cuU2NoZW1hKSB7XG5cdGNvbnN0IGZvcm1hdDogUmVjb3JkPHN0cmluZywgKHZhbHVlOiB1bmtub3duKSA9PiBzdHJpbmc+ID0gT2JqZWN0LmNyZWF0ZShcblx0XHRudWxsLFxuXHQpO1xuXHRmb3IgKGNvbnN0IGZpZWxkIG9mIHNjaGVtYS5maWVsZHMpIHtcblx0XHRmb3JtYXRbZmllbGQubmFtZV0gPSBmb3JtYXR0ZXJGb3JEYXRhVHlwZVZhbHVlKGZpZWxkLnR5cGUpO1xuXHR9XG5cdHJldHVybiBmb3JtYXQ7XG59XG5cbi8qKlxuICogUmV0dXJuIGEgY2xhc3MgdHlwZSBvZiBlYWNoIGZpZWxkIGluIHRoZSBzY2hlbWEuXG4gKi9cbmZ1bmN0aW9uIGNsYXNzb2Yoc2NoZW1hOiBhcnJvdy5TY2hlbWEpOiBSZWNvcmQ8c3RyaW5nLCBcIm51bWJlclwiIHwgXCJkYXRlXCI+IHtcblx0Y29uc3QgY2xhc3NlczogUmVjb3JkPHN0cmluZywgXCJudW1iZXJcIiB8IFwiZGF0ZVwiPiA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdGZvciAoY29uc3QgZmllbGQgb2Ygc2NoZW1hLmZpZWxkcykge1xuXHRcdGlmIChcblx0XHRcdGFycm93LkRhdGFUeXBlLmlzSW50KGZpZWxkLnR5cGUpIHx8XG5cdFx0XHRhcnJvdy5EYXRhVHlwZS5pc0Zsb2F0KGZpZWxkLnR5cGUpXG5cdFx0KSB7XG5cdFx0XHRjbGFzc2VzW2ZpZWxkLm5hbWVdID0gXCJudW1iZXJcIjtcblx0XHR9XG5cdFx0aWYgKFxuXHRcdFx0YXJyb3cuRGF0YVR5cGUuaXNEYXRlKGZpZWxkLnR5cGUpIHx8XG5cdFx0XHRhcnJvdy5EYXRhVHlwZS5pc1RpbWVzdGFtcChmaWVsZC50eXBlKVxuXHRcdCkge1xuXHRcdFx0Y2xhc3Nlc1tmaWVsZC5uYW1lXSA9IFwiZGF0ZVwiO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gY2xhc3Nlcztcbn1cblxuZnVuY3Rpb24gaGlnaGxpZ2h0KGNlbGw6IEhUTUxUYWJsZUNlbGxFbGVtZW50LCByb3c6IEhUTUxUYWJsZVJvd0VsZW1lbnQpIHtcblx0aWYgKHJvdy5maXJzdENoaWxkICE9PSBjZWxsICYmIGNlbGwgIT09IHJvdy5sYXN0RWxlbWVudENoaWxkKSB7XG5cdFx0Y2VsbC5zdHlsZS5ib3JkZXIgPSBcIjFweCBzb2xpZCB2YXIoLS1tb29uLWdyYXkpXCI7XG5cdH1cblx0cm93LnN0eWxlLmJhY2tncm91bmRDb2xvciA9IFwidmFyKC0tbGlnaHQtc2lsdmVyKVwiO1xufVxuXG5mdW5jdGlvbiByZW1vdmVIaWdobGlnaHQoY2VsbDogSFRNTFRhYmxlQ2VsbEVsZW1lbnQsIHJvdzogSFRNTFRhYmxlUm93RWxlbWVudCkge1xuXHRjZWxsLnN0eWxlLnJlbW92ZVByb3BlcnR5KFwiYm9yZGVyXCIpO1xuXHRyb3cuc3R5bGUucmVtb3ZlUHJvcGVydHkoXCJiYWNrZ3JvdW5kLWNvbG9yXCIpO1xufVxuXG5mdW5jdGlvbiBpc1RhYmxlQ2VsbEVsZW1lbnQobm9kZTogdW5rbm93bik6IG5vZGUgaXMgSFRNTFRhYmxlRGF0YUNlbGxFbGVtZW50IHtcblx0Ly8gQHRzLWV4cGVjdC1lcnJvciAtIHRhZ05hbWUgaXMgbm90IGRlZmluZWQgb24gdW5rbm93blxuXHRyZXR1cm4gbm9kZT8udGFnTmFtZSA9PT0gXCJURFwiO1xufVxuXG5mdW5jdGlvbiBpc1RhYmxlUm93RWxlbWVudChub2RlOiB1bmtub3duKTogbm9kZSBpcyBIVE1MVGFibGVSb3dFbGVtZW50IHtcblx0cmV0dXJuIG5vZGUgaW5zdGFuY2VvZiBIVE1MVGFibGVSb3dFbGVtZW50O1xufVxuXG4vKiogQHBhcmFtIHtzdHJpbmd9IHZhbHVlICovXG5mdW5jdGlvbiBzaG91bGRHcmF5b3V0VmFsdWUodmFsdWU6IHN0cmluZykge1xuXHRyZXR1cm4gKFxuXHRcdHZhbHVlID09PSBcIm51bGxcIiB8fFxuXHRcdHZhbHVlID09PSBcInVuZGVmaW5lZFwiIHx8XG5cdFx0dmFsdWUgPT09IFwiTmFOXCIgfHxcblx0XHR2YWx1ZSA9PT0gXCJUT0RPXCJcblx0KTtcbn1cblxuLyoqXG4gKiBBIG1vc2FpYyBTUUwgZXhwcmVzc2lvbiBmb3IgYXNjZW5kaW5nIG9yZGVyXG4gKlxuICogVGhlIG5vcm1hbCBiZWhhdmlvciBpbiBTUUwgaXMgdG8gc29ydCBudWxscyBmaXJzdCB3aGVuIHNvcnRpbmcgaW4gYXNjZW5kaW5nIG9yZGVyLlxuICogVGhpcyBmdW5jdGlvbiByZXR1cm5zIGFuIGV4cHJlc3Npb24gdGhhdCBzb3J0cyBudWxscyBsYXN0IChpLmUuLCBgTlVMTFMgTEFTVGApLFxuICogbGlrZSB0aGUgYG1zcWwuZGVzY2AgZnVuY3Rpb24uXG4gKlxuICogQHBhcmFtIGZpZWxkXG4gKi9cbmZ1bmN0aW9uIGFzYyhmaWVsZDogc3RyaW5nKTogbXNxbC5FeHByIHtcblx0Ly8gZG9lc24ndCBzb3J0IG51bGxzIGZvciBhc2Ncblx0bGV0IGV4cHIgPSBtc3FsLmRlc2MoZmllbGQpO1xuXHRleHByLl9leHByWzBdID0gZXhwci5fZXhwclswXS5yZXBsYWNlKFwiREVTQ1wiLCBcIkFTQ1wiKTtcblx0cmV0dXJuIGV4cHI7XG59XG4iLCAiLyoqXG4gKiBFcnJvciB0aHJvd24gd2hlbiBhbiBhc3NlcnRpb24gZmFpbHMuXG4gKi9cbmV4cG9ydCBjbGFzcyBBc3NlcnRpb25FcnJvciBleHRlbmRzIEVycm9yIHtcblx0LyoqIEBwYXJhbSBtZXNzYWdlIFRoZSBlcnJvciBtZXNzYWdlLiAqL1xuXHRjb25zdHJ1Y3RvcihtZXNzYWdlOiBzdHJpbmcpIHtcblx0XHRzdXBlcihtZXNzYWdlKTtcblx0XHR0aGlzLm5hbWUgPSBcIkFzc2VydGlvbkVycm9yXCI7XG5cdH1cbn1cblxuLyoqXG4gKiBNYWtlIGFuIGFzc2VydGlvbi4gQW4gZXJyb3IgaXMgdGhyb3duIGlmIGBleHByYCBkb2VzIG5vdCBoYXZlIHRydXRoeSB2YWx1ZS5cbiAqXG4gKiBAcGFyYW0gZXhwciBUaGUgZXhwcmVzc2lvbiB0byB0ZXN0LlxuICogQHBhcmFtIG1zZyBUaGUgbWVzc2FnZSB0byBkaXNwbGF5IGlmIHRoZSBhc3NlcnRpb24gZmFpbHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhc3NlcnQoZXhwcjogdW5rbm93biwgbXNnID0gXCJcIik6IGFzc2VydHMgZXhwciB7XG5cdGlmICghZXhwcikge1xuXHRcdHRocm93IG5ldyBBc3NlcnRpb25FcnJvcihtc2cpO1xuXHR9XG59XG4iLCAiaW1wb3J0IHsgYXNzZXJ0IH0gZnJvbSBcIi4vYXNzZXJ0LnRzXCI7XG5cbmV4cG9ydCBjbGFzcyBBc3luY0JhdGNoUmVhZGVyPFQ+IHtcblx0LyoqIHRoZSBpdGVyYWJsZSBiYXRjaGVzIHRvIHJlYWQgKi9cblx0I2JhdGNoZXM6IEFycmF5PHsgZGF0YTogSXRlcmF0b3I8VD47IGxhc3Q6IGJvb2xlYW4gfT4gPSBbXTtcblx0LyoqIHRoZSBpbmRleCBvZiB0aGUgY3VycmVudCByb3cgKi9cblx0I2luZGV4OiBudW1iZXIgPSAwO1xuXHQvKiogcmVzb2x2ZXMgYSBwcm9taXNlIGZvciB3aGVuIHRoZSBuZXh0IGJhdGNoIGlzIGF2YWlsYWJsZSAqL1xuXHQjcmVzb2x2ZTogKCgpID0+IHZvaWQpIHwgbnVsbCA9IG51bGw7XG5cdC8qKiB0aGUgY3VycmVudCBiYXRjaCAqL1xuXHQjY3VycmVudDogeyBkYXRhOiBJdGVyYXRvcjxUPjsgbGFzdDogYm9vbGVhbiB9IHwgbnVsbCA9IG51bGw7XG5cdC8qKiBBIGZ1bmN0aW9uIHRvIHJlcXVlc3QgbW9yZSBkYXRhLiAqL1xuXHQjcmVxdWVzdE5leHRCYXRjaDogKCkgPT4gdm9pZDtcblx0LyoqXG5cdCAqIEBwYXJhbSByZXF1ZXN0TmV4dEJhdGNoIC0gYSBmdW5jdGlvbiB0byByZXF1ZXN0IG1vcmUgZGF0YS4gV2hlblxuXHQgKiB0aGlzIGZ1bmN0aW9uIGNvbXBsZXRlcywgaXQgc2hvdWxkIGVucXVldWUgdGhlIG5leHQgYmF0Y2gsIG90aGVyd2lzZSB0aGVcblx0ICogcmVhZGVyIHdpbGwgYmUgc3R1Y2suXG5cdCAqL1xuXHRjb25zdHJ1Y3RvcihyZXF1ZXN0TmV4dEJhdGNoOiAoKSA9PiB2b2lkKSB7XG5cdFx0dGhpcy4jcmVxdWVzdE5leHRCYXRjaCA9IHJlcXVlc3ROZXh0QmF0Y2g7XG5cdH1cblx0LyoqXG5cdCAqIEVucXVldWUgYSBiYXRjaCBvZiBkYXRhXG5cdCAqXG5cdCAqIFRoZSBsYXN0IGJhdGNoIHNob3VsZCBoYXZlIGBsYXN0OiB0cnVlYCBzZXQsXG5cdCAqIHNvIHRoZSByZWFkZXIgY2FuIHRlcm1pbmF0ZSB3aGVuIGl0IGhhc1xuXHQgKiBleGhhdXN0ZWQgYWxsIHRoZSBkYXRhLlxuXHQgKlxuXHQgKiBAcGFyYW0gYmF0Y2ggLSB0aGUgYmF0Y2ggb2YgZGF0YSB0byBlbnF1ZXVlXG5cdCAqIEBwYXJhbSBvcHRpb25zXG5cdCAqIEBwYXJhbSBvcHRpb25zLmxhc3QgLSB3aGV0aGVyIHRoaXMgaXMgdGhlIGxhc3QgYmF0Y2hcblx0ICovXG5cdGVucXVldWVCYXRjaChiYXRjaDogSXRlcmF0b3I8VD4sIHsgbGFzdCB9OiB7IGxhc3Q6IGJvb2xlYW4gfSkge1xuXHRcdHRoaXMuI2JhdGNoZXMucHVzaCh7IGRhdGE6IGJhdGNoLCBsYXN0IH0pO1xuXHRcdGlmICh0aGlzLiNyZXNvbHZlKSB7XG5cdFx0XHR0aGlzLiNyZXNvbHZlKCk7XG5cdFx0XHR0aGlzLiNyZXNvbHZlID0gbnVsbDtcblx0XHR9XG5cdH1cblx0YXN5bmMgbmV4dCgpOiBQcm9taXNlPEl0ZXJhdG9yUmVzdWx0PHsgcm93OiBUOyBpbmRleDogbnVtYmVyIH0+PiB7XG5cdFx0aWYgKCF0aGlzLiNjdXJyZW50KSB7XG5cdFx0XHRpZiAodGhpcy4jYmF0Y2hlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0LyoqIEB0eXBlIHtQcm9taXNlPHZvaWQ+fSAqL1xuXHRcdFx0XHRsZXQgcHJvbWlzZTogUHJvbWlzZTx2b2lkPiA9IG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy4jcmVzb2x2ZSA9IHJlc29sdmU7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0aGlzLiNyZXF1ZXN0TmV4dEJhdGNoKCk7XG5cdFx0XHRcdGF3YWl0IHByb21pc2U7XG5cdFx0XHR9XG5cdFx0XHRsZXQgbmV4dCA9IHRoaXMuI2JhdGNoZXMuc2hpZnQoKTtcblx0XHRcdGFzc2VydChuZXh0LCBcIk5vIG5leHQgYmF0Y2hcIik7XG5cdFx0XHR0aGlzLiNjdXJyZW50ID0gbmV4dDtcblx0XHR9XG5cdFx0bGV0IHJlc3VsdCA9IHRoaXMuI2N1cnJlbnQuZGF0YS5uZXh0KCk7XG5cdFx0aWYgKHJlc3VsdC5kb25lKSB7XG5cdFx0XHRpZiAodGhpcy4jY3VycmVudC5sYXN0KSB7XG5cdFx0XHRcdHJldHVybiB7IGRvbmU6IHRydWUsIHZhbHVlOiB1bmRlZmluZWQgfTtcblx0XHRcdH1cblx0XHRcdHRoaXMuI2N1cnJlbnQgPSBudWxsO1xuXHRcdFx0cmV0dXJuIHRoaXMubmV4dCgpO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZG9uZTogZmFsc2UsXG5cdFx0XHR2YWx1ZTogeyByb3c6IHJlc3VsdC52YWx1ZSwgaW5kZXg6IHRoaXMuI2luZGV4KysgfSxcblx0XHR9O1xuXHR9XG59XG4iLCAiaW1wb3J0IHsgVGVtcG9yYWwgfSBmcm9tIFwiQGpzLXRlbXBvcmFsL3BvbHlmaWxsXCI7XG5pbXBvcnQgKiBhcyBhcnJvdyBmcm9tIFwiYXBhY2hlLWFycm93XCI7XG5cbi8qKlxuICogQSB1dGlsaXR5IGZ1bmN0aW9uIHRvIGNyZWF0ZSBhIGZvcm1hdHRlciBmb3IgYSBnaXZlbiBkYXRhIHR5cGUuXG4gKlxuICogVGhlIGRhdGF0eXBlIGlzIG9ubHkgdXNlZCBmb3IgdHlwZSBpbmZlcmVuY2UgdG8gZW5zdXJlIHRoYXQgdGhlIGZvcm1hdHRlciBpc1xuICogY29ycmVjdGx5IHR5cGVkLlxuICovXG5mdW5jdGlvbiBmbXQ8VFZhbHVlPihcblx0X2Fycm93RGF0YVR5cGVWYWx1ZTogVFZhbHVlLFxuXHRmb3JtYXQ6ICh2YWx1ZTogVFZhbHVlKSA9PiBzdHJpbmcsXG5cdGxvZyA9IGZhbHNlLFxuKTogKHZhbHVlOiBUVmFsdWUgfCBudWxsIHwgdW5kZWZpbmVkKSA9PiBzdHJpbmcge1xuXHRyZXR1cm4gKHZhbHVlKSA9PiB7XG5cdFx0aWYgKGxvZykgY29uc29sZS5sb2codmFsdWUpO1xuXHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gc3RyaW5naWZ5KHZhbHVlKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZvcm1hdCh2YWx1ZSk7XG5cdH07XG59XG5cbmZ1bmN0aW9uIHN0cmluZ2lmeSh4OiB1bmtub3duKTogc3RyaW5nIHtcblx0cmV0dXJuIGAke3h9YDtcbn1cblxuLyoqIEBwYXJhbSB7YXJyb3cuRGF0YVR5cGV9IHR5cGUgKi9cbmV4cG9ydCBmdW5jdGlvbiBmb3JtYXREYXRhVHlwZU5hbWUodHlwZTogYXJyb3cuRGF0YVR5cGUpIHtcblx0Ly8gc3BlY2lhbCBjYXNlIHNvbWUgdHlwZXNcblx0aWYgKGFycm93LkRhdGFUeXBlLmlzTGFyZ2VCaW5hcnkodHlwZSkpIHJldHVybiBcImxhcmdlIGJpbmFyeVwiO1xuXHRpZiAoYXJyb3cuRGF0YVR5cGUuaXNMYXJnZVV0ZjgodHlwZSkpIHJldHVybiBcImxhcmdlIHV0ZjhcIjtcblx0Ly8gb3RoZXJ3aXNlLCBqdXN0IHN0cmluZ2lmeSBhbmQgbG93ZXJjYXNlXG5cdHJldHVybiB0eXBlXG5cdFx0LnRvU3RyaW5nKClcblx0XHQudG9Mb3dlckNhc2UoKVxuXHRcdC5yZXBsYWNlKFwiPHNlY29uZD5cIiwgXCJbc11cIilcblx0XHQucmVwbGFjZShcIjxtaWxsaXNlY29uZD5cIiwgXCJbbXNdXCIpXG5cdFx0LnJlcGxhY2UoXCI8bWljcm9zZWNvbmQ+XCIsIFwiW1x1MDBCNXNdXCIpXG5cdFx0LnJlcGxhY2UoXCI8bmFub3NlY29uZD5cIiwgXCJbbnNdXCIpXG5cdFx0LnJlcGxhY2UoXCI8ZGF5PlwiLCBcIltkYXldXCIpXG5cdFx0LnJlcGxhY2UoXCJkaWN0aW9uYXJ5PFwiLCBcImRpY3Q8XCIpO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7YXJyb3cuRGF0YVR5cGV9IHR5cGVcbiAqIEByZXR1cm5zIHsodmFsdWU6IGFueSkgPT4gc3RyaW5nfVxuICovXG5leHBvcnQgZnVuY3Rpb24gZm9ybWF0dGVyRm9yRGF0YVR5cGVWYWx1ZShcblx0dHlwZTogYXJyb3cuRGF0YVR5cGUsXG4pOiAodmFsdWU6IGFueSkgPT4gc3RyaW5nIHtcblx0aWYgKGFycm93LkRhdGFUeXBlLmlzTnVsbCh0eXBlKSkge1xuXHRcdHJldHVybiBmbXQodHlwZS5UVmFsdWUsIHN0cmluZ2lmeSk7XG5cdH1cblxuXHRpZiAoXG5cdFx0YXJyb3cuRGF0YVR5cGUuaXNJbnQodHlwZSkgfHxcblx0XHRhcnJvdy5EYXRhVHlwZS5pc0Zsb2F0KHR5cGUpXG5cdCkge1xuXHRcdHJldHVybiBmbXQodHlwZS5UVmFsdWUsICh2YWx1ZSkgPT4ge1xuXHRcdFx0aWYgKE51bWJlci5pc05hTih2YWx1ZSkpIHJldHVybiBcIk5hTlwiO1xuXHRcdFx0cmV0dXJuIHZhbHVlID09PSAwID8gXCIwXCIgOiB2YWx1ZS50b0xvY2FsZVN0cmluZyhcImVuXCIpOyAvLyBoYW5kbGUgbmVnYXRpdmUgemVyb1xuXHRcdH0pO1xuXHR9XG5cblx0aWYgKFxuXHRcdGFycm93LkRhdGFUeXBlLmlzQmluYXJ5KHR5cGUpIHx8XG5cdFx0YXJyb3cuRGF0YVR5cGUuaXNGaXhlZFNpemVCaW5hcnkodHlwZSkgfHxcblx0XHRhcnJvdy5EYXRhVHlwZS5pc0xhcmdlQmluYXJ5KHR5cGUpXG5cdCkge1xuXHRcdHJldHVybiBmbXQodHlwZS5UVmFsdWUsIChieXRlcykgPT4ge1xuXHRcdFx0bGV0IG1heGxlbiA9IDMyO1xuXHRcdFx0bGV0IHJlc3VsdCA9IFwiYidcIjtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgTWF0aC5taW4oYnl0ZXMubGVuZ3RoLCBtYXhsZW4pOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgYnl0ZSA9IGJ5dGVzW2ldO1xuXHRcdFx0XHRpZiAoYnl0ZSA+PSAzMiAmJiBieXRlIDw9IDEyNikge1xuXHRcdFx0XHRcdC8vIEFTQ0lJIHByaW50YWJsZSBjaGFyYWN0ZXJzIHJhbmdlIGZyb20gMzIgKHNwYWNlKSB0byAxMjYgKH4pXG5cdFx0XHRcdFx0cmVzdWx0ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnl0ZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzdWx0ICs9IFwiXFxcXHhcIiArIChcIjAwXCIgKyBieXRlLnRvU3RyaW5nKDE2KSkuc2xpY2UoLTIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoYnl0ZXMubGVuZ3RoID4gbWF4bGVuKSByZXN1bHQgKz0gXCIuLi5cIjtcblx0XHRcdHJlc3VsdCArPSBcIidcIjtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSk7XG5cdH1cblxuXHRpZiAoYXJyb3cuRGF0YVR5cGUuaXNVdGY4KHR5cGUpIHx8IGFycm93LkRhdGFUeXBlLmlzTGFyZ2VVdGY4KHR5cGUpKSB7XG5cdFx0cmV0dXJuIGZtdCh0eXBlLlRWYWx1ZSwgKHRleHQpID0+IHRleHQpO1xuXHR9XG5cblx0aWYgKGFycm93LkRhdGFUeXBlLmlzQm9vbCh0eXBlKSkge1xuXHRcdHJldHVybiBmbXQodHlwZS5UVmFsdWUsIHN0cmluZ2lmeSk7XG5cdH1cblxuXHRpZiAoYXJyb3cuRGF0YVR5cGUuaXNEZWNpbWFsKHR5cGUpKSB7XG5cdFx0cmV0dXJuIGZtdCh0eXBlLlRWYWx1ZSwgKCkgPT4gXCJUT0RPXCIpO1xuXHR9XG5cblx0aWYgKGFycm93LkRhdGFUeXBlLmlzRGF0ZSh0eXBlKSkge1xuXHRcdHJldHVybiBmbXQodHlwZS5UVmFsdWUsIChtcykgPT4ge1xuXHRcdFx0Ly8gQWx3YXlzIHJldHVybnMgdmFsdWUgaW4gbWlsbGlzZWNvbmRzXG5cdFx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vYXBhY2hlL2Fycm93L2Jsb2IvODlkNjM1NDA2OGMxMWE2NmZjZWMyZjM0ZDA0MTRkYWNhMzI3ZTJlMC9qcy9zcmMvdmlzaXRvci9nZXQudHMjTDE2Ny1MMTcxXG5cdFx0XHRyZXR1cm4gVGVtcG9yYWwuSW5zdGFudFxuXHRcdFx0XHQuZnJvbUVwb2NoTWlsbGlzZWNvbmRzKG1zKVxuXHRcdFx0XHQudG9ab25lZERhdGVUaW1lSVNPKFwiVVRDXCIpXG5cdFx0XHRcdC50b1BsYWluRGF0ZSgpXG5cdFx0XHRcdC50b1N0cmluZygpO1xuXHRcdH0pO1xuXHR9XG5cblx0aWYgKGFycm93LkRhdGFUeXBlLmlzVGltZSh0eXBlKSkge1xuXHRcdHJldHVybiBmbXQodHlwZS5UVmFsdWUsIChtcykgPT4ge1xuXHRcdFx0cmV0dXJuIGluc3RhbnRGcm9tVGltZVVuaXQobXMsIHR5cGUudW5pdClcblx0XHRcdFx0LnRvWm9uZWREYXRlVGltZUlTTyhcIlVUQ1wiKVxuXHRcdFx0XHQudG9QbGFpblRpbWUoKVxuXHRcdFx0XHQudG9TdHJpbmcoKTtcblx0XHR9KTtcblx0fVxuXG5cdGlmIChhcnJvdy5EYXRhVHlwZS5pc1RpbWVzdGFtcCh0eXBlKSkge1xuXHRcdHJldHVybiBmbXQodHlwZS5UVmFsdWUsIChtcykgPT4ge1xuXHRcdFx0Ly8gQWx3YXlzIHJldHVybnMgdmFsdWUgaW4gbWlsbGlzZWNvbmRzXG5cdFx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vYXBhY2hlL2Fycm93L2Jsb2IvODlkNjM1NDA2OGMxMWE2NmZjZWMyZjM0ZDA0MTRkYWNhMzI3ZTJlMC9qcy9zcmMvdmlzaXRvci9nZXQudHMjTDE3My1MMTkwXG5cdFx0XHRyZXR1cm4gVGVtcG9yYWwuSW5zdGFudFxuXHRcdFx0XHQuZnJvbUVwb2NoTWlsbGlzZWNvbmRzKG1zKVxuXHRcdFx0XHQudG9ab25lZERhdGVUaW1lSVNPKFwiVVRDXCIpXG5cdFx0XHRcdC50b1BsYWluRGF0ZVRpbWUoKVxuXHRcdFx0XHQudG9TdHJpbmcoKTtcblx0XHR9KTtcblx0fVxuXG5cdGlmIChhcnJvdy5EYXRhVHlwZS5pc0ludGVydmFsKHR5cGUpKSB7XG5cdFx0cmV0dXJuIGZtdCh0eXBlLlRWYWx1ZSwgKF92YWx1ZSkgPT4ge1xuXHRcdFx0cmV0dXJuIFwiVE9ET1wiO1xuXHRcdH0pO1xuXHR9XG5cblx0aWYgKGFycm93LkRhdGFUeXBlLmlzRHVyYXRpb24odHlwZSkpIHtcblx0XHRyZXR1cm4gZm10KHR5cGUuVFZhbHVlLCAoYmlnaW50VmFsdWUpID0+IHtcblx0XHRcdC8vIGh0dHBzOi8vdGMzOS5lcy9wcm9wb3NhbC10ZW1wb3JhbC9kb2NzL2R1cmF0aW9uLmh0bWwjdG9TdHJpbmdcblx0XHRcdHJldHVybiBkdXJhdGlvbkZyb21UaW1lVW5pdChiaWdpbnRWYWx1ZSwgdHlwZS51bml0KS50b1N0cmluZygpO1xuXHRcdH0pO1xuXHR9XG5cblx0aWYgKGFycm93LkRhdGFUeXBlLmlzTGlzdCh0eXBlKSkge1xuXHRcdHJldHVybiBmbXQodHlwZS5UVmFsdWUsICh2YWx1ZSkgPT4ge1xuXHRcdFx0Ly8gVE9ETzogU29tZSByZWN1cnNpdmUgZm9ybWF0dGluZz9cblx0XHRcdHJldHVybiB2YWx1ZS50b1N0cmluZygpO1xuXHRcdH0pO1xuXHR9XG5cblx0aWYgKGFycm93LkRhdGFUeXBlLmlzU3RydWN0KHR5cGUpKSB7XG5cdFx0cmV0dXJuIGZtdCh0eXBlLlRWYWx1ZSwgKHZhbHVlKSA9PiB7XG5cdFx0XHQvLyBUT0RPOiBTb21lIHJlY3Vyc2l2ZSBmb3JtYXR0aW5nP1xuXHRcdFx0cmV0dXJuIHZhbHVlLnRvU3RyaW5nKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRpZiAoYXJyb3cuRGF0YVR5cGUuaXNVbmlvbih0eXBlKSkge1xuXHRcdHJldHVybiBmbXQodHlwZS5UVmFsdWUsIChfdmFsdWUpID0+IHtcblx0XHRcdHJldHVybiBcIlRPRE9cIjtcblx0XHR9KTtcblx0fVxuXHRpZiAoYXJyb3cuRGF0YVR5cGUuaXNNYXAodHlwZSkpIHtcblx0XHRyZXR1cm4gZm10KHR5cGUuVFZhbHVlLCAoX3ZhbHVlKSA9PiB7XG5cdFx0XHRyZXR1cm4gXCJUT0RPXCI7XG5cdFx0fSk7XG5cdH1cblxuXHRpZiAoYXJyb3cuRGF0YVR5cGUuaXNEaWN0aW9uYXJ5KHR5cGUpKSB7XG5cdFx0bGV0IGZvcm1hdHRlciA9IGZvcm1hdHRlckZvckRhdGFUeXBlVmFsdWUodHlwZS5kaWN0aW9uYXJ5KTtcblx0XHRyZXR1cm4gZm10KHR5cGUuVFZhbHVlLCBmb3JtYXR0ZXIpO1xuXHR9XG5cblx0cmV0dXJuICgpID0+IGBVbnN1cHBvcnRlZCB0eXBlOiAke3R5cGV9YDtcbn1cblxuLyoqXG4gKiBAcGFyYW0ge251bWJlciB8IGJpZ2ludH0gdmFsdWVcbiAqIEBwYXJhbSB7YXJyb3cuVGltZVVuaXR9IHVuaXRcbiAqL1xuZnVuY3Rpb24gaW5zdGFudEZyb21UaW1lVW5pdCh2YWx1ZTogbnVtYmVyIHwgYmlnaW50LCB1bml0OiBhcnJvdy5UaW1lVW5pdCkge1xuXHRpZiAodW5pdCA9PT0gYXJyb3cuVGltZVVuaXQuU0VDT05EKSB7XG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJiaWdpbnRcIikgdmFsdWUgPSBOdW1iZXIodmFsdWUpO1xuXHRcdHJldHVybiBUZW1wb3JhbC5JbnN0YW50LmZyb21FcG9jaFNlY29uZHModmFsdWUpO1xuXHR9XG5cdGlmICh1bml0ID09PSBhcnJvdy5UaW1lVW5pdC5NSUxMSVNFQ09ORCkge1xuXHRcdGlmICh0eXBlb2YgdmFsdWUgPT09IFwiYmlnaW50XCIpIHZhbHVlID0gTnVtYmVyKHZhbHVlKTtcblx0XHRyZXR1cm4gVGVtcG9yYWwuSW5zdGFudC5mcm9tRXBvY2hNaWxsaXNlY29uZHModmFsdWUpO1xuXHR9XG5cdGlmICh1bml0ID09PSBhcnJvdy5UaW1lVW5pdC5NSUNST1NFQ09ORCkge1xuXHRcdGlmICh0eXBlb2YgdmFsdWUgPT09IFwibnVtYmVyXCIpIHZhbHVlID0gQmlnSW50KHZhbHVlKTtcblx0XHRyZXR1cm4gVGVtcG9yYWwuSW5zdGFudC5mcm9tRXBvY2hNaWNyb3NlY29uZHModmFsdWUpO1xuXHR9XG5cdGlmICh1bml0ID09PSBhcnJvdy5UaW1lVW5pdC5OQU5PU0VDT05EKSB7XG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJudW1iZXJcIikgdmFsdWUgPSBCaWdJbnQodmFsdWUpO1xuXHRcdHJldHVybiBUZW1wb3JhbC5JbnN0YW50LmZyb21FcG9jaE5hbm9zZWNvbmRzKHZhbHVlKTtcblx0fVxuXHR0aHJvdyBuZXcgRXJyb3IoXCJJbnZhbGlkIFRpbWVVbml0XCIpO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7bnVtYmVyIHwgYmlnaW50fSB2YWx1ZVxuICogQHBhcmFtIHthcnJvdy5UaW1lVW5pdH0gdW5pdFxuICovXG5mdW5jdGlvbiBkdXJhdGlvbkZyb21UaW1lVW5pdCh2YWx1ZTogbnVtYmVyIHwgYmlnaW50LCB1bml0OiBhcnJvdy5UaW1lVW5pdCkge1xuXHQvLyBUT0RPOiBUZW1wb3JhbC5EdXJhdGlvbiBwb2x5ZmlsbCBvbmx5IHN1cHBvcnRzIG51bWJlciBub3QgYmlnaW50XG5cdHZhbHVlID0gTnVtYmVyKHZhbHVlKTtcblx0aWYgKHVuaXQgPT09IGFycm93LlRpbWVVbml0LlNFQ09ORCkge1xuXHRcdHJldHVybiBUZW1wb3JhbC5EdXJhdGlvbi5mcm9tKHsgc2Vjb25kczogdmFsdWUgfSk7XG5cdH1cblx0aWYgKHVuaXQgPT09IGFycm93LlRpbWVVbml0Lk1JTExJU0VDT05EKSB7XG5cdFx0cmV0dXJuIFRlbXBvcmFsLkR1cmF0aW9uLmZyb20oeyBtaWxsaXNlY29uZHM6IHZhbHVlIH0pO1xuXHR9XG5cdGlmICh1bml0ID09PSBhcnJvdy5UaW1lVW5pdC5NSUNST1NFQ09ORCkge1xuXHRcdHJldHVybiBUZW1wb3JhbC5EdXJhdGlvbi5mcm9tKHsgbWljcm9zZWNvbmRzOiB2YWx1ZSB9KTtcblx0fVxuXHRpZiAodW5pdCA9PT0gYXJyb3cuVGltZVVuaXQuTkFOT1NFQ09ORCkge1xuXHRcdHJldHVybiBUZW1wb3JhbC5EdXJhdGlvbi5mcm9tKHsgbmFub3NlY29uZHM6IHZhbHVlIH0pO1xuXHR9XG5cdHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgVGltZVVuaXRcIik7XG59XG4iLCAiaW1wb3J0ICogYXMgbWMgZnJvbSBcIkB1d2RhdGEvbW9zYWljLWNvcmVcIjtcbmltcG9ydCAqIGFzIG1zcWwgZnJvbSBcIkB1d2RhdGEvbW9zYWljLXNxbFwiO1xuaW1wb3J0ICogYXMgbXBsb3QgZnJvbSBcIkB1d2RhdGEvbW9zYWljLXBsb3RcIjtcbmltcG9ydCB0eXBlICogYXMgYXJyb3cgZnJvbSBcImFwYWNoZS1hcnJvd1wiO1xuXG5pbXBvcnQgeyBhc3NlcnQgfSBmcm9tIFwiLi4vdXRpbHMvYXNzZXJ0LnRzXCI7XG5pbXBvcnQgeyBDcm9zc2ZpbHRlckhpc3RvZ3JhbVBsb3QgfSBmcm9tIFwiLi4vdXRpbHMvQ3Jvc3NmaWx0ZXJIaXN0b2dyYW1QbG90LnRzXCI7XG5cbmltcG9ydCB0eXBlIHsgQmluLCBDaGFubmVsLCBGaWVsZCwgTWFyaywgU2NhbGUgfSBmcm9tIFwiLi4vdHlwZXMudHNcIjtcblxuLyoqIEFuIG9wdGlvbnMgYmFnIGZvciB0aGUgSGlzdG9ncmFtIE1vc2lhYyBjbGllbnQuICovXG5pbnRlcmZhY2UgSGlzdG9ncmFtT3B0aW9ucyB7XG5cdC8qKiBUaGUgdGFibGUgdG8gcXVlcnkuICovXG5cdHRhYmxlOiBzdHJpbmc7XG5cdC8qKiBUaGUgY29sdW1uIHRvIHVzZSBmb3IgdGhlIGhpc3RvZ3JhbS4gKi9cblx0Y29sdW1uOiBzdHJpbmc7XG5cdC8qKiBUaGUgdHlwZSBvZiB0aGUgY29sdW1uLiBNdXN0IGJlIFwibnVtYmVyXCIgb3IgXCJkYXRlXCIuICovXG5cdHR5cGU6IFwibnVtYmVyXCIgfCBcImRhdGVcIjtcblx0LyoqIEEgbW9zYWljIHNlbGVjdGlvbiB0byBmaWx0ZXIgdGhlIGRhdGEuICovXG5cdGZpbHRlckJ5PzogbWMuU2VsZWN0aW9uO1xufVxuXG4vKiogUmVwcmVzZW50cyBhIENyb3NzLWZpbHRlcmVkIEhpc3RvZ3JhbSAqL1xuZXhwb3J0IGNsYXNzIEhpc3RvZ3JhbSBleHRlbmRzIG1jLk1vc2FpY0NsaWVudCBpbXBsZW1lbnRzIE1hcmsge1xuXHR0eXBlID0gXCJyZWN0WVwiO1xuXHQvKiogQHR5cGUge3sgdGFibGU6IHN0cmluZywgY29sdW1uOiBzdHJpbmcsIHR5cGU6IFwibnVtYmVyXCIgfCBcImRhdGVcIiB9fSAqL1xuXHQjc291cmNlOiB7IHRhYmxlOiBzdHJpbmc7IGNvbHVtbjogc3RyaW5nOyB0eXBlOiBcIm51bWJlclwiIHwgXCJkYXRlXCIgfTtcblx0LyoqIEB0eXBlIHtIVE1MRWxlbWVudH0gKi9cblx0I2VsOiBIVE1MRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG5cdC8qKiBAdHlwZSB7QXJyYXk8Q2hhbm5lbD59ICovXG5cdCNjaGFubmVsczogQXJyYXk8Q2hhbm5lbD4gPSBbXTtcblx0LyoqIEB0eXBlIHtTZXQ8dW5rbm93bj59ICovXG5cdCNtYXJrU2V0OiBTZXQ8dW5rbm93bj4gPSBuZXcgU2V0KCk7XG5cdC8qKiBAdHlwZSB7bXBsb3QuSW50ZXJ2YWwxRCB8IHVuZGVmaW5lZH0gKi9cblx0I2ludGVydmFsOiBtcGxvdC5JbnRlcnZhbDFEIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHQvKiogQHR5cGUge2Jvb2xlYW59ICovXG5cdCNpbml0aWFsaXplZDogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdHN2Zzpcblx0XHR8IFNWR1NWR0VsZW1lbnQgJiB7XG5cdFx0XHRzY2FsZTogKHR5cGU6IHN0cmluZykgPT4gU2NhbGU8bnVtYmVyLCBudW1iZXI+O1xuXHRcdFx0dXBkYXRlKGJpbnM6IEJpbltdLCBvcHRzOiB7IG51bGxDb3VudDogbnVtYmVyIH0pOiB2b2lkO1xuXHRcdH1cblx0XHR8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3RvcihvcHRpb25zOiBIaXN0b2dyYW1PcHRpb25zKSB7XG5cdFx0c3VwZXIob3B0aW9ucy5maWx0ZXJCeSk7XG5cdFx0dGhpcy4jc291cmNlID0gb3B0aW9ucztcblx0XHRsZXQgcHJvY2VzcyA9IChjaGFubmVsOiBzdHJpbmcsIGVudHJ5OiB1bmtub3duKSA9PiB7XG5cdFx0XHRpZiAoaXNUcmFuc2Zvcm0oZW50cnkpKSB7XG5cdFx0XHRcdGxldCBlbmMgPSBlbnRyeSh0aGlzLCBjaGFubmVsKTtcblx0XHRcdFx0Zm9yIChsZXQga2V5IGluIGVuYykge1xuXHRcdFx0XHRcdHByb2Nlc3Moa2V5LCBlbmNba2V5XSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoaXNGaWVsZE9iamVjdChjaGFubmVsLCBlbnRyeSkpIHtcblx0XHRcdFx0dGhpcy4jY2hhbm5lbHMucHVzaChmaWVsZEVudHJ5KGNoYW5uZWwsIGVudHJ5KSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgZW5jb2RpbmcgZm9yIGNoYW5uZWwgJHtjaGFubmVsfWApO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0bGV0IGVuY29kaW5ncyA9IHtcblx0XHRcdHg6IG1wbG90LmJpbihvcHRpb25zLmNvbHVtbiksXG5cdFx0XHR5OiBtc3FsLmNvdW50KCksXG5cdFx0fTtcblx0XHRmb3IgKGxldCBbY2hhbm5lbCwgZW50cnldIG9mIE9iamVjdC5lbnRyaWVzKGVuY29kaW5ncykpIHtcblx0XHRcdHByb2Nlc3MoY2hhbm5lbCwgZW50cnkpO1xuXHRcdH1cblx0XHRpZiAob3B0aW9ucy5maWx0ZXJCeSkge1xuXHRcdFx0dGhpcy4jaW50ZXJ2YWwgPSBuZXcgbXBsb3QuSW50ZXJ2YWwxRCh0aGlzLCB7XG5cdFx0XHRcdGNoYW5uZWw6IFwieFwiLFxuXHRcdFx0XHRzZWxlY3Rpb246IHRoaXMuZmlsdGVyQnksXG5cdFx0XHRcdGZpZWxkOiB0aGlzLiNzb3VyY2UuY29sdW1uLFxuXHRcdFx0XHRicnVzaDogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIEByZXR1cm5zIHtBcnJheTx7IHRhYmxlOiBzdHJpbmcsIGNvbHVtbjogc3RyaW5nLCBzdGF0czogQXJyYXk8c3RyaW5nPiB9Pn0gKi9cblx0Ly8gQHRzLWV4cGVjdC1lcnJvciAtIF9maWVsZCB0eXBlIGlzIGJhZCBmcm9tIE1vc2FpY0NsaWVudFxuXHRmaWVsZHMoKTogQXJyYXk8eyB0YWJsZTogc3RyaW5nOyBjb2x1bW46IHN0cmluZzsgc3RhdHM6IEFycmF5PHN0cmluZz4gfT4ge1xuXHRcdGNvbnN0IGZpZWxkcyA9IG5ldyBNYXAoKTtcblx0XHRmb3IgKGxldCB7IGZpZWxkIH0gb2YgdGhpcy4jY2hhbm5lbHMpIHtcblx0XHRcdGlmICghZmllbGQpIGNvbnRpbnVlO1xuXHRcdFx0bGV0IHN0YXRzID0gZmllbGQuc3RhdHM/LnN0YXRzIHx8IFtdO1xuXHRcdFx0bGV0IGtleSA9IGZpZWxkLnN0YXRzPy5jb2x1bW4gPz8gZmllbGQ7XG5cdFx0XHRsZXQgZW50cnkgPSBmaWVsZHMuZ2V0KGtleSk7XG5cdFx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHRcdGVudHJ5ID0gbmV3IFNldCgpO1xuXHRcdFx0XHRmaWVsZHMuc2V0KGtleSwgZW50cnkpO1xuXHRcdFx0fVxuXHRcdFx0c3RhdHMuZm9yRWFjaCgocykgPT4gZW50cnkuYWRkKHMpKTtcblx0XHR9XG5cdFx0cmV0dXJuIEFycmF5LmZyb20oXG5cdFx0XHRmaWVsZHMsXG5cdFx0XHQoW2MsIHNdKSA9PiAoeyB0YWJsZTogdGhpcy4jc291cmNlLnRhYmxlLCBjb2x1bW46IGMsIHN0YXRzOiBzIH0pLFxuXHRcdCk7XG5cdH1cblxuXHQvKiogQHBhcmFtIHtBcnJheTxJbmZvPn0gaW5mbyAqL1xuXHRmaWVsZEluZm8oaW5mbzogQXJyYXk8SW5mbz4pIHtcblx0XHRsZXQgbG9va3VwID0gT2JqZWN0LmZyb21FbnRyaWVzKGluZm8ubWFwKCh4KSA9PiBbeC5jb2x1bW4sIHhdKSk7XG5cdFx0Zm9yIChsZXQgZW50cnkgb2YgdGhpcy4jY2hhbm5lbHMpIHtcblx0XHRcdGxldCB7IGZpZWxkIH0gPSBlbnRyeTtcblx0XHRcdGlmIChmaWVsZCkge1xuXHRcdFx0XHRPYmplY3QuYXNzaWduKGVudHJ5LCBsb29rdXBbZmllbGQuc3RhdHM/LmNvbHVtbiA/PyBmaWVsZF0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9maWVsZEluZm8gPSB0cnVlO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0LyoqIEBwYXJhbSB7c3RyaW5nfSBjaGFubmVsICovXG5cdGNoYW5uZWwoY2hhbm5lbDogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHRoaXMuI2NoYW5uZWxzLmZpbmQoKGMpID0+IGMuY2hhbm5lbCA9PT0gY2hhbm5lbCk7XG5cdH1cblxuXHQvKipcblx0ICogQHBhcmFtIHtzdHJpbmd9IGNoYW5uZWxcblx0ICogQHBhcmFtIHt7IGV4YWN0PzogYm9vbGVhbiB9fSBbb3B0aW9uc11cblx0ICogQHJldHVybnMge0NoYW5uZWx9XG5cdCAqL1xuXHRjaGFubmVsRmllbGQoXG5cdFx0Y2hhbm5lbDogc3RyaW5nLFxuXHRcdHsgZXhhY3QgPSBmYWxzZSB9OiB7IGV4YWN0PzogYm9vbGVhbiB9ID0ge30sXG5cdCk6IENoYW5uZWwge1xuXHRcdGFzc2VydCh0aGlzLmZpZWxkSW5mbywgXCJGaWVsZCBpbmZvIG5vdCBzZXRcIik7XG5cdFx0bGV0IGMgPSBleGFjdFxuXHRcdFx0PyB0aGlzLmNoYW5uZWwoY2hhbm5lbClcblx0XHRcdDogdGhpcy4jY2hhbm5lbHMuZmluZCgoYykgPT4gYy5jaGFubmVsLnN0YXJ0c1dpdGgoY2hhbm5lbCkpO1xuXHRcdGFzc2VydChjLCBgQ2hhbm5lbCAke2NoYW5uZWx9IG5vdCBmb3VuZGApO1xuXHRcdHJldHVybiBjO1xuXHR9XG5cblx0aGFzRmllbGRJbmZvKCkge1xuXHRcdHJldHVybiAhIXRoaXMuX2ZpZWxkSW5mbztcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm4gYSBxdWVyeSBzcGVjaWZ5aW5nIHRoZSBkYXRhIG5lZWRlZCBieSB0aGlzIE1hcmsgY2xpZW50LlxuXHQgKiBAcGFyYW0geyp9IFtmaWx0ZXJdIFRoZSBmaWx0ZXJpbmcgY3JpdGVyaWEgdG8gYXBwbHkgaW4gdGhlIHF1ZXJ5LlxuXHQgKiBAcmV0dXJucyB7Kn0gVGhlIGNsaWVudCBxdWVyeVxuXHQgKi9cblx0cXVlcnkoZmlsdGVyOiBhbnkgPSBbXSk6IGFueSB7XG5cdFx0cmV0dXJuIG1hcmtRdWVyeSh0aGlzLiNjaGFubmVscywgdGhpcy4jc291cmNlLnRhYmxlKS53aGVyZShmaWx0ZXIpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFByb3ZpZGUgcXVlcnkgcmVzdWx0IGRhdGEgdG8gdGhlIG1hcmsuXG5cdCAqIEBwYXJhbSB7YXJyb3cuVGFibGU8eyB4MTogYXJyb3cuSW50LCB4MjogYXJyb3cuSW50LCB5OiBhcnJvdy5JbnQgfT59IGRhdGFcblx0ICovXG5cdHF1ZXJ5UmVzdWx0KFxuXHRcdGRhdGE6IGFycm93LlRhYmxlPHsgeDE6IGFycm93LkludDsgeDI6IGFycm93LkludDsgeTogYXJyb3cuSW50IH0+LFxuXHQpIHtcblx0XHRsZXQgYmlucyA9IEFycmF5LmZyb20oZGF0YSwgKGQpID0+ICh7XG5cdFx0XHR4MDogZC54MSxcblx0XHRcdHgxOiBkLngyLFxuXHRcdFx0bGVuZ3RoOiBkLnksXG5cdFx0fSkpO1xuXHRcdGxldCBudWxsQ291bnQgPSAwO1xuXHRcdGxldCBudWxsQmluSW5kZXggPSBiaW5zLmZpbmRJbmRleCgoYikgPT4gYi54MCA9PSBudWxsKTtcblx0XHRpZiAobnVsbEJpbkluZGV4ID49IDApIHtcblx0XHRcdG51bGxDb3VudCA9IGJpbnNbbnVsbEJpbkluZGV4XS5sZW5ndGg7XG5cdFx0XHRiaW5zLnNwbGljZShudWxsQmluSW5kZXgsIDEpO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuI2luaXRpYWxpemVkKSB7XG5cdFx0XHR0aGlzLnN2ZyA9IENyb3NzZmlsdGVySGlzdG9ncmFtUGxvdChiaW5zLCB7XG5cdFx0XHRcdG51bGxDb3VudCxcblx0XHRcdFx0dHlwZTogdGhpcy4jc291cmNlLnR5cGUsXG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuI2ludGVydmFsPy5pbml0KHRoaXMuc3ZnLCBudWxsKTtcblx0XHRcdHRoaXMuI2VsLmFwcGVuZENoaWxkKHRoaXMuc3ZnKTtcblx0XHRcdHRoaXMuI2luaXRpYWxpemVkID0gdHJ1ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zdmc/LnVwZGF0ZShiaW5zLCB7IG51bGxDb3VudCB9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRnZXQgcGxvdCgpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bm9kZTogKCkgPT4gdGhpcy4jZWwsXG5cdFx0XHQvKiogQHBhcmFtIHtzdHJpbmd9IF9uYW1lICovXG5cdFx0XHRnZXRBdHRyaWJ1dGUoX25hbWU6IHN0cmluZykge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHRcdG1hcmtTZXQ6IHRoaXMuI21hcmtTZXQsXG5cdFx0fTtcblx0fVxufVxuXG4vKipcbiAqIEBwYXJhbSB7c3RyaW5nfSBjaGFubmVsXG4gKiBAcGFyYW0ge0ZpZWxkfSBmaWVsZFxuICogQHJldHVybnMge0NoYW5uZWx9XG4gKi9cbmZ1bmN0aW9uIGZpZWxkRW50cnkoY2hhbm5lbDogc3RyaW5nLCBmaWVsZDogRmllbGQpOiBDaGFubmVsIHtcblx0cmV0dXJuIHtcblx0XHRjaGFubmVsLFxuXHRcdGZpZWxkLFxuXHRcdGFzOiBmaWVsZCBpbnN0YW5jZW9mIG1zcWwuUmVmID8gZmllbGQuY29sdW1uIDogY2hhbm5lbCxcblx0fTtcbn1cblxuLyoqXG4gKiBAcGFyYW0ge3N0cmluZ30gY2hhbm5lbFxuICogQHBhcmFtIHt1bmtub3dufSBmaWVsZFxuICogQHJldHVybnMge2ZpZWxkIGlzIEZpZWxkfVxuICovXG5mdW5jdGlvbiBpc0ZpZWxkT2JqZWN0KGNoYW5uZWw6IHN0cmluZywgZmllbGQ6IHVua25vd24pOiBmaWVsZCBpcyBGaWVsZCB7XG5cdGlmIChjaGFubmVsID09PSBcInNvcnRcIiB8fCBjaGFubmVsID09PSBcInRpcFwiKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHJldHVybiAoXG5cdFx0dHlwZW9mIGZpZWxkID09PSBcIm9iamVjdFwiICYmXG5cdFx0ZmllbGQgIT0gbnVsbCAmJlxuXHRcdCFBcnJheS5pc0FycmF5KGZpZWxkKVxuXHQpO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7dW5rbm93bn0geFxuICogQHJldHVybnMge3ggaXMgKG1hcms6IE1hcmssIGNoYW5uZWw6IHN0cmluZykgPT4gUmVjb3JkPHN0cmluZywgRmllbGQ+fVxuICovXG5mdW5jdGlvbiBpc1RyYW5zZm9ybShcblx0eDogdW5rbm93bixcbik6IHggaXMgKG1hcms6IE1hcmssIGNoYW5uZWw6IHN0cmluZykgPT4gUmVjb3JkPHN0cmluZywgRmllbGQ+IHtcblx0cmV0dXJuIHR5cGVvZiB4ID09PSBcImZ1bmN0aW9uXCI7XG59XG5cbi8qKlxuICogRGVmYXVsdCBxdWVyeSBjb25zdHJ1Y3Rpb24gZm9yIGEgbWFyay5cbiAqXG4gKiBUcmFja3MgYWdncmVnYXRlcyBieSBjaGVja2luZyBmaWVsZHMgZm9yIGFuIGFnZ3JlZ2F0ZSBmbGFnLlxuICogSWYgYWdncmVnYXRlcyBhcmUgZm91bmQsIGdyb3VwcyBieSBhbGwgbm9uLWFnZ3JlZ2F0ZSBmaWVsZHMuXG4gKlxuICogQHBhcmFtIHtBcnJheTxDaGFubmVsPn0gY2hhbm5lbHMgYXJyYXkgb2YgdmlzdWFsIGVuY29kaW5nIGNoYW5uZWwgc3BlY3MuXG4gKiBAcGFyYW0ge3N0cmluZ30gdGFibGUgdGhlIHRhYmxlIHRvIHF1ZXJ5LlxuICogQHBhcmFtIHtBcnJheTxzdHJpbmc+fSBza2lwIGFuIG9wdGlvbmFsIGFycmF5IG9mIGNoYW5uZWxzIHRvIHNraXAuIE1hcmsgc3ViY2xhc3NlcyBjYW4gc2tpcCBjaGFubmVscyB0aGF0IHJlcXVpcmUgc3BlY2lhbCBoYW5kbGluZy5cbiAqIEByZXR1cm5zIHttc3FsLlF1ZXJ5fSBhIFF1ZXJ5IGluc3RhbmNlXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtYXJrUXVlcnkoXG5cdGNoYW5uZWxzOiBBcnJheTxDaGFubmVsPixcblx0dGFibGU6IHN0cmluZyxcblx0c2tpcDogQXJyYXk8c3RyaW5nPiA9IFtdLFxuKTogbXNxbC5RdWVyeSB7XG5cdGxldCBxID0gbXNxbC5RdWVyeS5mcm9tKHsgc291cmNlOiB0YWJsZSB9KTtcblx0bGV0IGRpbXMgPSBuZXcgU2V0KCk7XG5cdGxldCBhZ2dyID0gZmFsc2U7XG5cblx0Zm9yIChjb25zdCBjIG9mIGNoYW5uZWxzKSB7XG5cdFx0Y29uc3QgeyBjaGFubmVsLCBmaWVsZCwgYXMgfSA9IGM7XG5cdFx0aWYgKHNraXAuaW5jbHVkZXMoY2hhbm5lbCkpIGNvbnRpbnVlO1xuXG5cdFx0aWYgKGNoYW5uZWwgPT09IFwib3JkZXJieVwiKSB7XG5cdFx0XHRxLm9yZGVyYnkoYy52YWx1ZSk7XG5cdFx0fSBlbHNlIGlmIChmaWVsZCkge1xuXHRcdFx0aWYgKGZpZWxkLmFnZ3JlZ2F0ZSkge1xuXHRcdFx0XHRhZ2dyID0gdHJ1ZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChkaW1zLmhhcyhhcykpIGNvbnRpbnVlO1xuXHRcdFx0XHRkaW1zLmFkZChhcyk7XG5cdFx0XHR9XG5cdFx0XHRxLnNlbGVjdCh7IFthc106IGZpZWxkIH0pO1xuXHRcdH1cblx0fVxuXHRpZiAoYWdncikge1xuXHRcdHEuZ3JvdXBieShBcnJheS5mcm9tKGRpbXMpKTtcblx0fVxuXHRyZXR1cm4gcTtcbn1cbiIsICIvLyBUaGUgdHlwZXMgZm9yIGQzIGFyZSByZWFsbHkgYW5ub3lpbmcuXG5cbi8vIEBkZW5vLXR5cGVzPVwibnBtOkB0eXBlcy9kMy1zZWxlY3Rpb25AM1wiXG5leHBvcnQgKiBmcm9tIFwiZDMtc2VsZWN0aW9uXCI7XG4vLyBAZGVuby10eXBlcz1cIm5wbTpAdHlwZXMvZDMtc2NhbGVANFwiXG5leHBvcnQgKiBmcm9tIFwiZDMtc2NhbGVcIjtcbi8vIEBkZW5vLXR5cGVzPVwibnBtOkB0eXBlcy9kMy1heGlzQDNcIlxuZXhwb3J0ICogZnJvbSBcImQzLWF4aXNcIjtcbi8vIEBkZW5vLXR5cGVzPVwibnBtOkB0eXBlcy9kMy1mb3JtYXRAM1wiXG5leHBvcnQgKiBmcm9tIFwiZDMtZm9ybWF0XCI7XG4vLyBAZGVuby10eXBlcz1cIm5wbTpAdHlwZXMvZDMtdGltZS1mb3JtYXRANFwiXG5leHBvcnQgKiBmcm9tIFwiZDMtdGltZS1mb3JtYXRcIjtcbiIsICJpbXBvcnQgKiBhcyBkMyBmcm9tIFwiLi4vZDMudHNcIjtcbmltcG9ydCB0eXBlIHsgQmluIH0gZnJvbSBcIi4uL3R5cGVzLnRzXCI7XG5cbmxldCBZRUFSID0gXCJ5ZWFyXCI7XG5sZXQgTU9OVEggPSBcIm1vbnRoXCI7XG5sZXQgREFZID0gXCJkYXlcIjtcbmxldCBIT1VSID0gXCJob3VyXCI7XG5sZXQgTUlOVVRFID0gXCJtaW51dGVcIjtcbmxldCBTRUNPTkQgPSBcInNlY29uZFwiO1xubGV0IE1JTExJU0VDT05EID0gXCJtaWxsaXNlY29uZFwiO1xuXG5sZXQgZHVyYXRpb25TZWNvbmQgPSAxMDAwO1xubGV0IGR1cmF0aW9uTWludXRlID0gZHVyYXRpb25TZWNvbmQgKiA2MDtcbmxldCBkdXJhdGlvbkhvdXIgPSBkdXJhdGlvbk1pbnV0ZSAqIDYwO1xubGV0IGR1cmF0aW9uRGF5ID0gZHVyYXRpb25Ib3VyICogMjQ7XG5sZXQgZHVyYXRpb25XZWVrID0gZHVyYXRpb25EYXkgKiA3O1xubGV0IGR1cmF0aW9uTW9udGggPSBkdXJhdGlvbkRheSAqIDMwO1xubGV0IGR1cmF0aW9uWWVhciA9IGR1cmF0aW9uRGF5ICogMzY1O1xuXG5sZXQgaW50ZXJ2YWxzID0gW1xuXHRbU0VDT05ELCAxLCBkdXJhdGlvblNlY29uZF0sXG5cdFtTRUNPTkQsIDUsIDUgKiBkdXJhdGlvblNlY29uZF0sXG5cdFtTRUNPTkQsIDE1LCAxNSAqIGR1cmF0aW9uU2Vjb25kXSxcblx0W1NFQ09ORCwgMzAsIDMwICogZHVyYXRpb25TZWNvbmRdLFxuXHRbTUlOVVRFLCAxLCBkdXJhdGlvbk1pbnV0ZV0sXG5cdFtNSU5VVEUsIDUsIDUgKiBkdXJhdGlvbk1pbnV0ZV0sXG5cdFtNSU5VVEUsIDE1LCAxNSAqIGR1cmF0aW9uTWludXRlXSxcblx0W01JTlVURSwgMzAsIDMwICogZHVyYXRpb25NaW51dGVdLFxuXHRbSE9VUiwgMSwgZHVyYXRpb25Ib3VyXSxcblx0W0hPVVIsIDMsIDMgKiBkdXJhdGlvbkhvdXJdLFxuXHRbSE9VUiwgNiwgNiAqIGR1cmF0aW9uSG91cl0sXG5cdFtIT1VSLCAxMiwgMTIgKiBkdXJhdGlvbkhvdXJdLFxuXHRbREFZLCAxLCBkdXJhdGlvbkRheV0sXG5cdFtEQVksIDcsIGR1cmF0aW9uV2Vla10sXG5cdFtNT05USCwgMSwgZHVyYXRpb25Nb250aF0sXG5cdFtNT05USCwgMywgMyAqIGR1cmF0aW9uTW9udGhdLFxuXHRbWUVBUiwgMSwgZHVyYXRpb25ZZWFyXSxcbl0gYXMgY29uc3Q7XG5cbmxldCBmb3JtYXRNYXAgPSB7XG5cdFtNSUxMSVNFQ09ORF06IGQzLnRpbWVGb3JtYXQoXCIlTFwiKSxcblx0W1NFQ09ORF06IGQzLnRpbWVGb3JtYXQoXCIlUyBzXCIpLFxuXHRbTUlOVVRFXTogZDMudGltZUZvcm1hdChcIiVIOiVNXCIpLFxuXHRbSE9VUl06IGQzLnRpbWVGb3JtYXQoXCIlSDolTVwiKSxcblx0W0RBWV06IGQzLnRpbWVGb3JtYXQoXCIlYiAlZFwiKSxcblx0W01PTlRIXTogZDMudGltZUZvcm1hdChcIiViICVZXCIpLFxuXHRbWUVBUl06IGQzLnRpbWVGb3JtYXQoXCIlWVwiKSxcbn07XG5cbi8qKlxuICogQHBhcmFtIHR5cGUgLSB0aGUgdHlwZSBvZiBkYXRhIGFzIGEgSmF2YVNjcmlwdCBwcmltaXRpdmVcbiAqIEBwYXJhbSBiaW5zIC0gdGhlIGJpbiBkYXRhIHRoYXQgbmVlZHMgdG8gYmUgZm9ybWF0dGVkXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0aWNrRm9ybWF0dGVyRm9yQmlucyhcblx0dHlwZTogXCJkYXRlXCIgfCBcIm51bWJlclwiLFxuXHRiaW5zOiBBcnJheTxCaW4+LFxuKSB7XG5cdGlmICh0eXBlID09PSBcIm51bWJlclwiKSB7XG5cdFx0cmV0dXJuIGQzLmZvcm1hdChcIn5zXCIpO1xuXHR9XG5cdGxldCBpbnRlcnZhbCA9IHRpbWVJbnRlcnZhbChcblx0XHRiaW5zWzBdLngwLFxuXHRcdGJpbnNbYmlucy5sZW5ndGggLSAxXS54MSxcblx0XHRiaW5zLmxlbmd0aCxcblx0KTtcblx0cmV0dXJuIGZvcm1hdE1hcFtpbnRlcnZhbC5pbnRlcnZhbF07XG59XG5cbi8vLyBiaW4gc3R1ZmYgZnJvbSB2Z3Bsb3RcblxuLyoqXG4gKiBAcGFyYW0gbWluXG4gKiBAcGFyYW0gbWF4XG4gKiBAcGFyYW0gc3RlcHNcbiAqL1xuZnVuY3Rpb24gdGltZUludGVydmFsKFxuXHRtaW46IG51bWJlcixcblx0bWF4OiBudW1iZXIsXG5cdHN0ZXBzOiBudW1iZXIsXG4pOiB7XG5cdGludGVydmFsOiB0eXBlb2YgaW50ZXJ2YWxzW251bWJlcl1bMF0gfCB0eXBlb2YgTUlMTElTRUNPTkQ7XG5cdHN0ZXA6IG51bWJlcjtcbn0ge1xuXHRjb25zdCBzcGFuID0gbWF4IC0gbWluO1xuXHRjb25zdCB0YXJnZXQgPSBzcGFuIC8gc3RlcHM7XG5cblx0bGV0IGkgPSAwO1xuXHR3aGlsZSAoaSA8IGludGVydmFscy5sZW5ndGggJiYgaW50ZXJ2YWxzW2ldWzJdIDwgdGFyZ2V0KSB7XG5cdFx0aSsrO1xuXHR9XG5cblx0aWYgKGkgPT09IGludGVydmFscy5sZW5ndGgpIHtcblx0XHRyZXR1cm4geyBpbnRlcnZhbDogWUVBUiwgc3RlcDogYmluU3RlcChzcGFuLCBzdGVwcykgfTtcblx0fVxuXG5cdGlmIChpID4gMCkge1xuXHRcdGxldCBpbnRlcnZhbCA9IGludGVydmFsc1tcblx0XHRcdHRhcmdldCAvIGludGVydmFsc1tpIC0gMV1bMl0gPCBpbnRlcnZhbHNbaV1bMl0gLyB0YXJnZXQgPyBpIC0gMSA6IGlcblx0XHRdO1xuXHRcdHJldHVybiB7IGludGVydmFsOiBpbnRlcnZhbFswXSwgc3RlcDogaW50ZXJ2YWxbMV0gfTtcblx0fVxuXG5cdHJldHVybiB7IGludGVydmFsOiBNSUxMSVNFQ09ORCwgc3RlcDogYmluU3RlcChzcGFuLCBzdGVwcywgMSkgfTtcbn1cblxuLyoqXG4gKiBAcGFyYW0ge251bWJlcn0gc3BhblxuICogQHBhcmFtIHtudW1iZXJ9IHN0ZXBzXG4gKiBAcGFyYW0ge251bWJlcn0gW21pbnN0ZXBdXG4gKiBAcGFyYW0ge251bWJlcn0gW2xvZ2JdXG4gKi9cbmZ1bmN0aW9uIGJpblN0ZXAoXG5cdHNwYW46IG51bWJlcixcblx0c3RlcHM6IG51bWJlcixcblx0bWluc3RlcDogbnVtYmVyID0gMCxcblx0bG9nYjogbnVtYmVyID0gTWF0aC5MTjEwLFxuKSB7XG5cdGxldCB2O1xuXG5cdGNvbnN0IGxldmVsID0gTWF0aC5jZWlsKE1hdGgubG9nKHN0ZXBzKSAvIGxvZ2IpO1xuXHRsZXQgc3RlcCA9IE1hdGgubWF4KFxuXHRcdG1pbnN0ZXAsXG5cdFx0TWF0aC5wb3coMTAsIE1hdGgucm91bmQoTWF0aC5sb2coc3BhbikgLyBsb2diKSAtIGxldmVsKSxcblx0KTtcblxuXHQvLyBpbmNyZWFzZSBzdGVwIHNpemUgaWYgdG9vIG1hbnkgYmluc1xuXHR3aGlsZSAoTWF0aC5jZWlsKHNwYW4gLyBzdGVwKSA+IHN0ZXBzKSBzdGVwICo9IDEwO1xuXG5cdC8vIGRlY3JlYXNlIHN0ZXAgc2l6ZSBpZiBhbGxvd2VkXG5cdGNvbnN0IGRpdiA9IFs1LCAyXTtcblx0Zm9yIChsZXQgaSA9IDAsIG4gPSBkaXYubGVuZ3RoOyBpIDwgbjsgKytpKSB7XG5cdFx0diA9IHN0ZXAgLyBkaXZbaV07XG5cdFx0aWYgKHYgPj0gbWluc3RlcCAmJiBzcGFuIC8gdiA8PSBzdGVwcykgc3RlcCA9IHY7XG5cdH1cblxuXHRyZXR1cm4gc3RlcDtcbn1cbiIsICJpbXBvcnQgKiBhcyBkMyBmcm9tIFwiLi4vZDMudHNcIjtcbmltcG9ydCB7IEJpbiwgU2NhbGUgfSBmcm9tIFwiLi4vdHlwZXMudHNcIjtcbmltcG9ydCB7IGFzc2VydCB9IGZyb20gXCIuLi91dGlscy9hc3NlcnQudHNcIjtcbmltcG9ydCB7IHRpY2tGb3JtYXR0ZXJGb3JCaW5zIH0gZnJvbSBcIi4vdGljay1mb3JtYXR0ZXItZm9yLWJpbnMudHNcIjtcblxuaW50ZXJmYWNlIEhpc3RvZ3JhbU9wdGlvbnMge1xuXHR0eXBlOiBcIm51bWJlclwiIHwgXCJkYXRlXCI7XG5cdHdpZHRoPzogbnVtYmVyO1xuXHRoZWlnaHQ/OiBudW1iZXI7XG5cdG1hcmdpblRvcD86IG51bWJlcjtcblx0bWFyZ2luUmlnaHQ/OiBudW1iZXI7XG5cdG1hcmdpbkJvdHRvbT86IG51bWJlcjtcblx0bWFyZ2luTGVmdD86IG51bWJlcjtcblx0bnVsbENvdW50PzogbnVtYmVyO1xuXHRmaWxsQ29sb3I/OiBzdHJpbmc7XG5cdG51bGxGaWxsQ29sb3I/OiBzdHJpbmc7XG5cdGJhY2tncm91bmRCYXJDb2xvcj86IHN0cmluZztcbn1cblxuLyoqXG4gKiBSZXR1cm5zIGFuIFNWRyBlbGVtZW50LlxuICpcbiAqIEBwYXJhbSBiaW5zIC0gdGhlIFwiY29tcGxldGVcIiwgb3IgdG90YWwgYmlucyBmb3IgdGhlIGNyb3NzZmlsdGVyIGhpc3RvZ3JhbS5cbiAqIEBwYXJhbSBvcHRpb25zIC0gQSBiYWcgb2Ygb3B0aW9ucyB0byBjb25maWd1cmUgdGhlIGhpc3RvZ3JhbVxuICovXG5leHBvcnQgZnVuY3Rpb24gQ3Jvc3NmaWx0ZXJIaXN0b2dyYW1QbG90KFxuXHRiaW5zOiBBcnJheTxCaW4+LFxuXHR7XG5cdFx0dHlwZSA9IFwibnVtYmVyXCIsXG5cdFx0d2lkdGggPSAxMjUsXG5cdFx0aGVpZ2h0ID0gNDAsXG5cdFx0bWFyZ2luVG9wID0gMCxcblx0XHRtYXJnaW5SaWdodCA9IDIsXG5cdFx0bWFyZ2luQm90dG9tID0gMTIsXG5cdFx0bWFyZ2luTGVmdCA9IDIsXG5cdFx0bnVsbENvdW50ID0gMCxcblx0XHRmaWxsQ29sb3IgPSBcIiM2NDc0OGJcIixcblx0XHRudWxsRmlsbENvbG9yID0gXCIjY2E4YTA0XCIsXG5cdFx0YmFja2dyb3VuZEJhckNvbG9yID0gXCJ2YXIoLS1tb29uLWdyYXkpXCIsXG5cdH06IEhpc3RvZ3JhbU9wdGlvbnMsXG4pOiBTVkdTVkdFbGVtZW50ICYge1xuXHRzY2FsZTogKHR5cGU6IHN0cmluZykgPT4gU2NhbGU8bnVtYmVyLCBudW1iZXI+O1xuXHR1cGRhdGUoYmluczogQXJyYXk8QmluPiwgb3B0czogeyBudWxsQ291bnQ6IG51bWJlciB9KTogdm9pZDtcbn0ge1xuXHRsZXQgbnVsbEJpbldpZHRoID0gbnVsbENvdW50ID09PSAwID8gMCA6IDU7XG5cdGxldCBzcGFjaW5nID0gbnVsbEJpbldpZHRoID8gNCA6IDA7XG5cdGxldCBleHRlbnQgPSAvKiogQHR5cGUge2NvbnN0fSAqLyAoW1xuXHRcdE1hdGgubWluKC4uLmJpbnMubWFwKChkKSA9PiBkLngwKSksXG5cdFx0TWF0aC5tYXgoLi4uYmlucy5tYXAoKGQpID0+IGQueDEpKSxcblx0XSk7XG5cdGxldCB4ID0gdHlwZSA9PT0gXCJkYXRlXCIgPyBkMy5zY2FsZVV0YygpIDogZDMuc2NhbGVMaW5lYXIoKTtcblx0eFxuXHRcdC5kb21haW4oZXh0ZW50KVxuXHRcdC8vIEB0cy1leHBlY3QtZXJyb3IgLSByYW5nZSBpcyBvayB3aXRoIG51bWJlciBmb3IgYm90aCBudW1iZXIgYW5kIHRpbWVcblx0XHQucmFuZ2UoW21hcmdpbkxlZnQgKyBudWxsQmluV2lkdGggKyBzcGFjaW5nLCB3aWR0aCAtIG1hcmdpblJpZ2h0XSlcblx0XHQubmljZSgpO1xuXG5cdGxldCB5ID0gZDMuc2NhbGVMaW5lYXIoKVxuXHRcdC5kb21haW4oWzAsIE1hdGgubWF4KG51bGxDb3VudCwgLi4uYmlucy5tYXAoKGQpID0+IGQubGVuZ3RoKSldKVxuXHRcdC5yYW5nZShbaGVpZ2h0IC0gbWFyZ2luQm90dG9tLCBtYXJnaW5Ub3BdKTtcblxuXHRsZXQgc3ZnID0gZDMuY3JlYXRlKFwic3ZnXCIpXG5cdFx0LmF0dHIoXCJ3aWR0aFwiLCB3aWR0aClcblx0XHQuYXR0cihcImhlaWdodFwiLCBoZWlnaHQpXG5cdFx0LmF0dHIoXCJ2aWV3Qm94XCIsIFswLCAwLCB3aWR0aCwgaGVpZ2h0XSlcblx0XHQuYXR0cihcInN0eWxlXCIsIFwibWF4LXdpZHRoOiAxMDAlOyBoZWlnaHQ6IGF1dG87IG92ZXJmbG93OiB2aXNpYmxlO1wiKTtcblxuXHR7XG5cdFx0Ly8gYmFja2dyb3VuZCBiYXJzIHdpdGggdGhlIFwidG90YWxcIiBiaW5zXG5cdFx0c3ZnLmFwcGVuZChcImdcIilcblx0XHRcdC5hdHRyKFwiZmlsbFwiLCBiYWNrZ3JvdW5kQmFyQ29sb3IpXG5cdFx0XHQuc2VsZWN0QWxsKFwicmVjdFwiKVxuXHRcdFx0LmRhdGEoYmlucylcblx0XHRcdC5qb2luKFwicmVjdFwiKVxuXHRcdFx0LmF0dHIoXCJ4XCIsIChkKSA9PiB4KGQueDApICsgMS41KVxuXHRcdFx0LmF0dHIoXCJ3aWR0aFwiLCAoZCkgPT4geChkLngxKSAtIHgoZC54MCkgLSAxLjUpXG5cdFx0XHQuYXR0cihcInlcIiwgKGQpID0+IHkoZC5sZW5ndGgpKVxuXHRcdFx0LmF0dHIoXCJoZWlnaHRcIiwgKGQpID0+IHkoMCkgLSB5KGQubGVuZ3RoKSk7XG5cdH1cblxuXHQvLyBGb3JlZ3JvdW5kIGJhcnMgZm9yIHRoZSBjdXJyZW50IHN1YnNldFxuXHRsZXQgZm9yZWdyb3VuZEJhckdyb3VwID0gc3ZnXG5cdFx0LmFwcGVuZChcImdcIilcblx0XHQuYXR0cihcImZpbGxcIiwgZmlsbENvbG9yKTtcblxuXHRzdmdcblx0XHQuYXBwZW5kKFwiZ1wiKVxuXHRcdC5hdHRyKFwidHJhbnNmb3JtXCIsIGB0cmFuc2xhdGUoMCwke2hlaWdodCAtIG1hcmdpbkJvdHRvbX0pYClcblx0XHQuY2FsbChcblx0XHRcdGQzXG5cdFx0XHRcdC5heGlzQm90dG9tKHgpXG5cdFx0XHRcdC50aWNrVmFsdWVzKHguZG9tYWluKCkpXG5cdFx0XHRcdC50aWNrRm9ybWF0KHRpY2tGb3JtYXR0ZXJGb3JCaW5zKHR5cGUsIGJpbnMpKVxuXHRcdFx0XHQudGlja1NpemUoMi41KSxcblx0XHQpXG5cdFx0LmNhbGwoKGcpID0+IHtcblx0XHRcdGcuc2VsZWN0KFwiLmRvbWFpblwiKS5yZW1vdmUoKTtcblx0XHRcdGcuYXR0cihcImNsYXNzXCIsIFwiZ3JheVwiKTtcblx0XHRcdGcuc2VsZWN0QWxsKFwiLnRpY2sgdGV4dFwiKVxuXHRcdFx0XHQuYXR0cihcInRleHQtYW5jaG9yXCIsIChfLCBpKSA9PiBpID09PSAwID8gXCJzdGFydFwiIDogXCJlbmRcIilcblx0XHRcdFx0LmF0dHIoXCJkeFwiLCAoXywgaSkgPT4gaSA9PT0gMCA/IFwiLTAuMjVlbVwiIDogXCIwLjI1ZW1cIik7XG5cdFx0fSk7XG5cblx0LyoqIEB0eXBlIHt0eXBlb2YgZm9yZWdyb3VuZEJhckdyb3VwIHwgdW5kZWZpbmVkfSAqL1xuXHRsZXQgZm9yZWdyb3VuZE51bGxHcm91cDogdHlwZW9mIGZvcmVncm91bmRCYXJHcm91cCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0aWYgKG51bGxDb3VudCA+IDApIHtcblx0XHRsZXQgeG51bGwgPSBkMy5zY2FsZUxpbmVhcigpXG5cdFx0XHQucmFuZ2UoW21hcmdpbkxlZnQsIG1hcmdpbkxlZnQgKyBudWxsQmluV2lkdGhdKTtcblxuXHRcdC8vIGJhY2tncm91bmQgYmFyIGZvciB0aGUgbnVsbCBiaW5cblx0XHRzdmcuYXBwZW5kKFwiZ1wiKVxuXHRcdFx0LmF0dHIoXCJmaWxsXCIsIGJhY2tncm91bmRCYXJDb2xvcilcblx0XHRcdC5hcHBlbmQoXCJyZWN0XCIpXG5cdFx0XHQuYXR0cihcInhcIiwgeG51bGwoMCkpXG5cdFx0XHQuYXR0cihcIndpZHRoXCIsIHhudWxsKDEpIC0geG51bGwoMCkpXG5cdFx0XHQuYXR0cihcInlcIiwgeShudWxsQ291bnQpKVxuXHRcdFx0LmF0dHIoXCJoZWlnaHRcIiwgeSgwKSAtIHkobnVsbENvdW50KSk7XG5cblx0XHRmb3JlZ3JvdW5kTnVsbEdyb3VwID0gc3ZnXG5cdFx0XHQuYXBwZW5kKFwiZ1wiKVxuXHRcdFx0LmF0dHIoXCJmaWxsXCIsIG51bGxGaWxsQ29sb3IpXG5cdFx0XHQuYXR0cihcImNvbG9yXCIsIG51bGxGaWxsQ29sb3IpO1xuXG5cdFx0Zm9yZWdyb3VuZE51bGxHcm91cC5hcHBlbmQoXCJyZWN0XCIpXG5cdFx0XHQuYXR0cihcInhcIiwgeG51bGwoMCkpXG5cdFx0XHQuYXR0cihcIndpZHRoXCIsIHhudWxsKDEpIC0geG51bGwoMCkpO1xuXG5cdFx0Ly8gQXBwZW5kIHRoZSB4LWF4aXMgYW5kIGFkZCBhIG51bGwgdGlja1xuXHRcdGxldCBheGlzR3JvdXAgPSBmb3JlZ3JvdW5kTnVsbEdyb3VwLmFwcGVuZChcImdcIilcblx0XHRcdC5hdHRyKFwidHJhbnNmb3JtXCIsIGB0cmFuc2xhdGUoMCwke2hlaWdodCAtIG1hcmdpbkJvdHRvbX0pYClcblx0XHRcdC5hcHBlbmQoXCJnXCIpXG5cdFx0XHQuYXR0cihcInRyYW5zZm9ybVwiLCBgdHJhbnNsYXRlKCR7eG51bGwoMC41KX0sIDApYClcblx0XHRcdC5hdHRyKFwiY2xhc3NcIiwgXCJ0aWNrXCIpO1xuXG5cdFx0YXhpc0dyb3VwXG5cdFx0XHQuYXBwZW5kKFwibGluZVwiKVxuXHRcdFx0LmF0dHIoXCJzdHJva2VcIiwgXCJjdXJyZW50Q29sb3JcIilcblx0XHRcdC5hdHRyKFwieTJcIiwgMi41KTtcblxuXHRcdGF4aXNHcm91cFxuXHRcdFx0LmFwcGVuZChcInRleHRcIilcblx0XHRcdC5hdHRyKFwiZmlsbFwiLCBcImN1cnJlbnRDb2xvclwiKVxuXHRcdFx0LmF0dHIoXCJ5XCIsIDQuNSlcblx0XHRcdC5hdHRyKFwiZHlcIiwgXCIwLjcxZW1cIilcblx0XHRcdC5hdHRyKFwidGV4dC1hbmNob3JcIiwgXCJtaWRkbGVcIilcblx0XHRcdC50ZXh0KFwiXHUyMjA1XCIpXG5cdFx0XHQuYXR0cihcImZvbnQtc2l6ZVwiLCBcIjAuOWVtXCIpXG5cdFx0XHQuYXR0cihcImZvbnQtZmFtaWx5XCIsIFwidmFyKC0tc2Fucy1zZXJpZilcIilcblx0XHRcdC5hdHRyKFwiZm9udC13ZWlnaHRcIiwgXCJub3JtYWxcIik7XG5cdH1cblxuXHQvLyBBcHBseSBzdHlsZXMgZm9yIGFsbCBheGlzIHRpY2tzXG5cdHN2Zy5zZWxlY3RBbGwoXCIudGlja1wiKVxuXHRcdC5hdHRyKFwiZm9udC1mYW1pbHlcIiwgXCJ2YXIoLS1zYW5zLXNlcmlmKVwiKVxuXHRcdC5hdHRyKFwiZm9udC13ZWlnaHRcIiwgXCJub3JtYWxcIik7XG5cblx0LyoqXG5cdCAqIEBwYXJhbSB7QXJyYXk8QmluPn0gYmluc1xuXHQgKiBAcGFyYW0ge251bWJlcn0gbnVsbENvdW50XG5cdCAqL1xuXHRmdW5jdGlvbiByZW5kZXIoYmluczogQXJyYXk8QmluPiwgbnVsbENvdW50OiBudW1iZXIpIHtcblx0XHRmb3JlZ3JvdW5kQmFyR3JvdXBcblx0XHRcdC5zZWxlY3RBbGwoXCJyZWN0XCIpXG5cdFx0XHQuZGF0YShiaW5zKVxuXHRcdFx0LmpvaW4oXCJyZWN0XCIpXG5cdFx0XHQuYXR0cihcInhcIiwgKGQpID0+IHgoZC54MCkgKyAxLjUpXG5cdFx0XHQuYXR0cihcIndpZHRoXCIsIChkKSA9PiB4KGQueDEpIC0geChkLngwKSAtIDEuNSlcblx0XHRcdC5hdHRyKFwieVwiLCAoZCkgPT4geShkLmxlbmd0aCkpXG5cdFx0XHQuYXR0cihcImhlaWdodFwiLCAoZCkgPT4geSgwKSAtIHkoZC5sZW5ndGgpKTtcblx0XHRmb3JlZ3JvdW5kTnVsbEdyb3VwXG5cdFx0XHQ/LnNlbGVjdChcInJlY3RcIilcblx0XHRcdC5hdHRyKFwieVwiLCB5KG51bGxDb3VudCkpXG5cdFx0XHQuYXR0cihcImhlaWdodFwiLCB5KDApIC0geShudWxsQ291bnQpKTtcblx0fVxuXG5cdGxldCBzY2FsZXMgPSB7XG5cdFx0eDogT2JqZWN0LmFzc2lnbih4LCB7XG5cdFx0XHR0eXBlOiBcImxpbmVhclwiLFxuXHRcdFx0ZG9tYWluOiB4LmRvbWFpbigpLFxuXHRcdFx0cmFuZ2U6IHgucmFuZ2UoKSxcblx0XHR9KSxcblx0XHR5OiBPYmplY3QuYXNzaWduKHksIHtcblx0XHRcdHR5cGU6IFwibGluZWFyXCIsXG5cdFx0XHRkb21haW46IHkuZG9tYWluKCksXG5cdFx0XHRyYW5nZTogeS5yYW5nZSgpLFxuXHRcdH0pLFxuXHR9O1xuXHRsZXQgbm9kZSA9IHN2Zy5ub2RlKCk7XG5cdGFzc2VydChub2RlLCBcIkluZmFsbGFibGVcIik7XG5cblx0cmVuZGVyKGJpbnMsIG51bGxDb3VudCk7XG5cdHJldHVybiBPYmplY3QuYXNzaWduKG5vZGUsIHtcblx0XHQvKiogQHBhcmFtIHtzdHJpbmd9IHR5cGUgKi9cblx0XHRzY2FsZSh0eXBlOiBzdHJpbmcpIHtcblx0XHRcdC8vIEB0cy1leHBlY3QtZXJyb3IgLSBzY2FsZXMgaXMgbm90IGRlZmluZWRcblx0XHRcdGxldCBzY2FsZSA9IHNjYWxlc1t0eXBlXTtcblx0XHRcdGFzc2VydChzY2FsZSwgXCJJbnZhbGlkIHNjYWxlIHR5cGVcIik7XG5cdFx0XHRyZXR1cm4gc2NhbGU7XG5cdFx0fSxcblx0XHQvKipcblx0XHQgKiBAcGFyYW0ge0FycmF5PEJpbj59IGJpbnNcblx0XHQgKiBAcGFyYW0ge3sgbnVsbENvdW50OiBudW1iZXIgfX0gb3B0c1xuXHRcdCAqL1xuXHRcdHVwZGF0ZShiaW5zOiBBcnJheTxCaW4+LCB7IG51bGxDb3VudCB9OiB7IG51bGxDb3VudDogbnVtYmVyIH0pIHtcblx0XHRcdHJlbmRlcihiaW5zLCBudWxsQ291bnQpO1xuXHRcdH0sXG5cdFx0cmVzZXQoKSB7XG5cdFx0XHRyZW5kZXIoYmlucywgbnVsbENvdW50KTtcblx0XHR9LFxuXHR9KTtcbn1cbiIsICIvKipcbiAqIERlZmVyIGEgcHJvbWlzZS5cbiAqXG4gKiBUT0RPOiBTaG91bGQgdXNlIFByb21pc2Uud2l0aFJlc29sdmVycygpIHdoZW4gYXZhaWxhYmxlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZGVmZXI8U3VjY2VzcywgUmVqZWN0PigpOiB7XG5cdHByb21pc2U6IFByb21pc2U8U3VjY2Vzcz47XG5cdHJlc29sdmU6ICh2YWx1ZTogU3VjY2VzcykgPT4gdm9pZDtcblx0cmVqZWN0OiAocmVhc29uPzogUmVqZWN0KSA9PiB2b2lkO1xufSB7XG5cdGxldCByZXNvbHZlO1xuXHRsZXQgcmVqZWN0O1xuXHRsZXQgcHJvbWlzZSA9IG5ldyBQcm9taXNlPFN1Y2Nlc3M+KChyZXMsIHJlaikgPT4ge1xuXHRcdHJlc29sdmUgPSByZXM7XG5cdFx0cmVqZWN0ID0gcmVqO1xuXHR9KTtcblx0LyoqIEB0cy1leHBlY3QtZXJyb3IgLSByZXNvbHZlIGFuZCByZWplY3QgYXJlIHNldCAqL1xuXHRyZXR1cm4geyBwcm9taXNlLCByZXNvbHZlLCByZWplY3QgfTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7OztBQUFBLFlBQVlBLFNBQVE7QUFDcEIsWUFBWUMsV0FBVTtBQUN0QixZQUFZQyxZQUFXO0FBQ3ZCLFlBQVksVUFBVTs7O0FDRnRCLFlBQVlDLFlBQVc7QUFDdkIsWUFBWUMsU0FBUTtBQUNwQixZQUFZQyxXQUFVO0FBQ3RCLFlBQVksYUFBYTtBQUN6QixTQUFTLFlBQVk7OztBQ0ZkLElBQU0saUJBQU4sY0FBNkIsTUFBTTtBQUFBO0FBQUEsRUFFekMsWUFBWSxTQUFpQjtBQUM1QixVQUFNLE9BQU87QUFDYixTQUFLLE9BQU87QUFBQSxFQUNiO0FBQ0Q7QUFRTyxTQUFTLE9BQU8sTUFBZSxNQUFNLElBQWtCO0FBQzdELE1BQUksQ0FBQyxNQUFNO0FBQ1YsVUFBTSxJQUFJLGVBQWUsR0FBRztBQUFBLEVBQzdCO0FBQ0Q7OztBQ25CTyxJQUFNLG1CQUFOLE1BQTBCO0FBQUE7QUFBQSxFQUVoQyxXQUF3RCxDQUFDO0FBQUE7QUFBQSxFQUV6RCxTQUFpQjtBQUFBO0FBQUEsRUFFakIsV0FBZ0M7QUFBQTtBQUFBLEVBRWhDLFdBQXdEO0FBQUE7QUFBQSxFQUV4RDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1BLFlBQVksa0JBQThCO0FBQ3pDLFNBQUssb0JBQW9CO0FBQUEsRUFDMUI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFZQSxhQUFhLE9BQW9CLEVBQUUsS0FBSyxHQUFzQjtBQUM3RCxTQUFLLFNBQVMsS0FBSyxFQUFFLE1BQU0sT0FBTyxLQUFLLENBQUM7QUFDeEMsUUFBSSxLQUFLLFVBQVU7QUFDbEIsV0FBSyxTQUFTO0FBQ2QsV0FBSyxXQUFXO0FBQUEsSUFDakI7QUFBQSxFQUNEO0FBQUEsRUFDQSxNQUFNLE9BQTJEO0FB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QkFBUSxJQUFJLE1BQU07QUFBQSxZQUNqQixLQUFLLFNBQVM7QUFDYixrQkFBSSxRQUFjLG9CQUFhLFFBQVEsQ0FBQyxFQUFFLE1BQU07QUFDaEQscUJBQU8sSUFBSSxTQUFTLEtBQUs7QUFDekIsb0JBQU0sUUFBUSxLQUFLO0FBQ25CO0FBQUEsWUFDRDtBQUFBLFlBQ0EsS0FBSyxRQUFRO0FBQ1oscUJBQU8sSUFBSSxRQUFRLElBQUksTUFBTTtBQUM3QixvQkFBTSxRQUFRLElBQUksTUFBTTtBQUN4QjtBQUFBLFlBQ0Q7QUFBQSxZQUNBLFNBQVM7QUFDUixvQkFBTSxRQUFRLENBQUMsQ0FBQztBQUNoQjtBQUFBLFlBQ0Q7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUNBLGVBQU8sU0FBUyxPQUFPO0FBQUEsTUFDeEIsQ0FBQztBQUVELFVBQUksWUFBWTtBQUFBLFFBQ2YsTUFBTSxPQUFPO0FBQ1osY0FBSSxFQUFFLFNBQVMsU0FBUyxPQUFPLElBQUksTUFHakM7QUFDRixlQUFLLE9BQU8sU0FBUyxNQUFNO0FBQzNCLGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFFQSxrQkFBWSxrQkFBa0IsU0FBUztBQUd2QyxVQUFJLFFBQVEsTUFBTSxZQUFZO0FBQUEsUUFDeEIsWUFDSCxLQUFLLE1BQU0sSUFBSSxhQUFhLENBQUMsRUFDN0IsT0FBTyxHQUFHLE1BQU0sSUFBSSxVQUFVLENBQUMsRUFDL0IsTUFBTSxDQUFDLEVBQ1AsU0FBUztBQUFBLE1BQ1o7QUFDQSxlQUFTLE1BQU07QUFFZixhQUFPLE1BQU07QUFDWixvQkFBWSxNQUFNO0FBQUEsTUFDbkI7QUFBQSxJQUNEO0FBQUEsSUFDQSxPQUFPLEVBQUUsT0FBTyxHQUFHLEdBQTBCO0FBQzVDLFVBQUksU0FBWSxjQUFVLFlBQVk7QUFDdEMsVUFBSSxRQUFRLElBQUksVUFBVTtBQUFBLFFBQ3pCLE9BQU8sTUFBTSxJQUFJLGFBQWE7QUFBQSxRQUM5QjtBQUFBLFFBQ0EsVUFBVTtBQUFBLE1BQ1gsQ0FBQztBQUNELGtCQUFZLFFBQVEsS0FBSztBQUN6QixTQUFHLFlBQVksTUFBTSxLQUFLLENBQUM7QUFBQSxJQUM1QjtBQUFBLEVBQ0Q7QUFDRDsiLAogICJuYW1lcyI6IFsibWMiLCAibXNxbCIsICJhcnJvdyIsICJhcnJvdyIsICJtYyIsICJtc3FsIiwgImZvcm1hdCIsICJiaW5zIiwgIm51bGxDb3VudCIsICJ0eXBlIiwgImMiLCAiZXZlbnQiLCAiZm9ybWF0Il0KfQo=
