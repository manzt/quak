/**
 * quak's DataTable as a boro client.
 *
 * Mosaic (mc/msql) is provided at runtime by the boro coordinator via
 * `coord.exports` — nothing mosaic is bundled here. Per-column crossfilter
 * identity comes from `ctx.child(...)`: a column's brush filters every other
 * column's summary and the row grid, never its own summary. All selection
 * state lives in the `_selections` trait; the UI and Python write it, and
 * the publish pipelines below are the only trait→clause encoders.
 */
import * as flech from "@uwdata/flechette";
import * as signals from "@preact/signals-core";
import * as d3 from "d3";
import { html } from "htl";

import { AsyncBatchReader } from "./utils/AsyncBatchReader.ts";
import { assert } from "./utils/assert.ts";
import { formatDataType, formatterForValue } from "./utils/formatting.ts";
import { CrossfilterHistogramPlot } from "./utils/CrossfilterHistogramPlot.ts";
import { ValueCountsPlot } from "./utils/ValueCountsPlot.ts";
import { binSpec, timeInterval } from "./utils/time-interval.ts";
import stylesString from "./clients/styles.css.ts";

type SelectionKind = "interval" | "point";
type SortEntry = { column: string; dir: "asc" | "desc" };
type TableRow = Record<string, unknown>;

type Model = {
	coord: string;
	filter_by: string | null;
	target: string | null;
	_table_name: string;
	_selections: Record<string, unknown>;
	_selection_kinds: Record<string, SelectionKind>;
	sort: Array<SortEntry>;
};

// Minimal anywidget/boro runtime surfaces (mc/msql are provided at runtime,
// so everything is structurally typed here).
type AnyModel = {
	get<K extends keyof Model>(key: K): Model[K];
	set<K extends keyof Model>(key: K, value: Model[K]): void;
	on(event: string, cb: () => void): void;
	off(event: string, cb: () => void): void;
	save_changes(): void;
};
// deno-lint-ignore no-explicit-any
type Ctx = any;
// deno-lint-ignore no-explicit-any
type Msql = any;
// deno-lint-ignore no-explicit-any
type Mc = any;

const ROW_HEIGHT = 22;
const ROWS = 11.5;
const LIMIT = 100;
const COLUMN_WIDTH = 125;
const HEADER_HEIGHT = "94px";
const BIN_STEPS = 18;
// Geometry of CrossfilterHistogramPlot (width/height/margins defaults).
const HIST = { width: 125, height: 40, marginBottom: 12, left: 2, right: 2 };

const NULL_KEY = "__quak_null__";

export default () => ({
	async render(
		{ model, host, signal, el }: {
			model: AnyModel;
			// deno-lint-ignore no-explicit-any
			host: any;
			signal: AbortSignal;
			el: HTMLElement;
		},
	) {
		const coord = await host.getWidget(model.get("coord"));
		const { mc, msql, createClient, trait } = coord.exports;
		const ctx = await createClient({ model, host, signal });
		const tableName = model.get("_table_name");

		// ── Schema ─────────────────────────────────────────────────────────
		const empty = await ctx.fetch(
			msql.Query.from(tableName).select("*").limit(0),
		);
		const schema: flech.Schema = empty.schema;
		const fields = schema.fields;

		const kinds: Record<string, SelectionKind> = {};
		for (const field of fields) {
			kinds[field.name] = summaryTypeOf(field.type) === null
				? "point"
				: "interval";
		}

		// ── Stats (one query: min/max for every interval column + total) ───
		const intervalFields = fields.filter((f) => kinds[f.name] === "interval");
		const statsSelect: Record<string, unknown> = {
			__total: msql.count(),
		};
		intervalFields.forEach((f, i) => {
			statsSelect[`__lo${i}`] = msql.min(msql.column(f.name));
			statsSelect[`__hi${i}`] = msql.max(msql.column(f.name));
		});
		const statsTable = await ctx.fetch(
			msql.Query.from(tableName).select(statsSelect),
		);
		const statsRow = statsTable.get(0);
		const totalRows = Number(statsRow.__total);
		const extents: Record<string, [number, number]> = {};
		intervalFields.forEach((f, i) => {
			const lo = statsRow[`__lo${i}`];
			const hi = statsRow[`__hi${i}`];
			if (lo == null || hi == null) {
				// all-NULL column: a histogram is meaningless — summarize as counts
				kinds[f.name] = "point";
				return;
			}
			let nlo = Number(lo);
			let nhi = Number(hi);
			if (!Number.isFinite(nlo) || !Number.isFinite(nhi)) {
				kinds[f.name] = "point";
				return;
			}
			if (nhi <= nlo) nhi = nlo + 1; // constant column: one bin
			extents[f.name] = [nlo, nhi];
		});
		model.set("_selection_kinds", kinds);
		model.save_changes();

		// ── DOM skeleton ───────────────────────────────────────────────────
		const root = document.createElement("div");
		const shadowRoot = root.attachShadow({ mode: "open" });
		const thead = document.createElement("thead");
		const tbody = document.createElement("tbody");

		const tableRoot = document.createElement("div");
		tableRoot.className = "table-container";
		tableRoot.style.maxHeight = `${(ROWS + 1) * ROW_HEIGHT - 1}px`;
		// @deno-fmt-ignore
		tableRoot.appendChild(
			html.fragment`<table style=${{ tableLayout: "fixed" }}>${thead}${tbody}</table>`,
		);
		addDirectionalScrollWithPreventDefault(tableRoot);

		const container = document.createElement("div");
		container.className = "quak";
		container.appendChild(tableRoot);
		shadowRoot.appendChild(container);
		{
			const styles = document.createElement("style");
			styles.innerText = stylesString;
			shadowRoot.appendChild(styles);
		}
		el.appendChild(root);

		// ── Formatters / template row ──────────────────────────────────────
		const format = formatof(schema);
		const classes = classof(schema);
		const columnNames = fields.map((f) => f.name);

		// @deno-fmt-ignore
		const templateRow: HTMLTableRowElement = html`<tr><td></td>${
			fields.map((f) => html.fragment`<td class=${classes[f.name]}></td>`)
		}
			<td style=${{ width: "99%", borderLeft: "none", borderRight: "none" }}></td>
		</tr>`;

		// ── Header cells ───────────────────────────────────────────────────
		const cols = fields.map((field) => {
			const visContainer = document.createElement("div");
			return thcol(field, COLUMN_WIDTH, visContainer);
		});

		// @deno-fmt-ignore
		thead.appendChild(
			html`<tr style=${{ height: HEADER_HEIGHT }}>
				<th></th>
				${cols}
				<th style=${{ width: "99%", borderLeft: "none", borderRight: "none" }}></th>
			</tr>`,
		);

		// row hover highlight
		tableRoot.addEventListener("mouseover", (event) => {
			if (
				isTableCellElement(event.target) &&
				isTableRowElement(event.target.parentNode)
			) {
				highlight(event.target, event.target.parentNode);
			}
		});
		tableRoot.addEventListener("mouseout", (event) => {
			if (
				isTableCellElement(event.target) &&
				isTableRowElement(event.target.parentNode)
			) {
				removeHighlight(event.target, event.target.parentNode);
			}
		});

		// ── Sort: header clicks write the `sort` trait (read-only from Python) ──
		signals.effect(() => {
			const next: Array<SortEntry> = [];
			cols.forEach((col, i) => {
				const dir = col.sortState.value;
				if (dir !== "unset") next.push({ column: columnNames[i], dir });
			});
			model.set("sort", next);
			model.save_changes();
		});
		const sortParam = ctx.param(
			trait(model, "sort"),
			(a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b),
		);

		// ── Rows (root child: filtered by every column's clause) ───────────
		let reader: AsyncBatchReader<TableRow> | null = null;
		let offset = 0;
		let lastFilter: unknown = [];

		// warm the coordinator's cache with the next page (best-effort)
		function prefetchPage(nextOffset: number) {
			try {
				const query = rowsQueryBase(lastFilter).clone().limit(LIMIT).offset(
					nextOffset,
				);
				Promise.resolve(coord.exports.coordinator?.prefetch?.(query))
					.catch(() => {});
			} catch {
				// prefetch is an optimization only
			}
		}

		function rowsQueryBase(filter: unknown) {
			let query = msql.Query.from(tableName)
				.select(columnNames.map((name) => msql.column(name)))
				.where(filter);
			const entries = (model.get("sort") ?? []) as Array<SortEntry>;
			if (entries.length > 0) {
				query = query.orderby(
					entries.map((e) =>
						e.dir === "desc"
							? msql.sql`${msql.column(e.column)} DESC`
							: msql.sql`${msql.column(e.column)} ASC`
					),
				);
			}
			return query;
		}

		function appendRow(d: TableRow, i: number) {
			const itr = templateRow.cloneNode(true) as HTMLTableRowElement;
			let td = itr.childNodes[0] as HTMLTableCellElement;
			td.appendChild(document.createTextNode(String(i)));
			for (let j = 0; j < columnNames.length; ++j) {
				td = itr.childNodes[j + 1] as HTMLTableCellElement;
				td.classList.remove("gray");
				const col = columnNames[j];
				const stringified = format[col](d[col]);
				if (shouldGrayoutValue(stringified)) {
					td.classList.add("gray");
				}
				td.appendChild(document.createTextNode(stringified));
			}
			tbody.append(itr);
		}

		async function appendRows(nrows: number) {
			nrows = Math.trunc(nrows);
			while (nrows >= 0) {
				const result = await reader?.next();
				if (!result || result.done) break;
				appendRow(result.value.row, result.value.index);
				nrows--;
			}
		}

		async function appendPage() {
			const current = reader;
			offset += LIMIT;
			const query = rowsQueryBase(lastFilter).clone().limit(LIMIT).offset(
				offset,
			);
			prefetchPage(offset + LIMIT);
			// deno-lint-ignore no-explicit-any
			const result: any = await ctx.fetch(query);
			if (current !== reader) return; // a new base result replaced us
			current?.enqueueBatch(result[Symbol.iterator](), {
				last: result.numRows < LIMIT,
			});
		}

		const rows = ctx.query(
			(filter: unknown) => {
				lastFilter = filter;
				prefetchPage(LIMIT);
				return rowsQueryBase(filter).limit(LIMIT);
			},
			{ filterBy: ctx.filterBy, params: [sortParam] },
		);
		rows.addEventListener(
			"value",
			// deno-lint-ignore no-explicit-any
			(result: any) => {
				if (result.isError) {
					console.error("quak: rows query failed", result.error);
					return;
				}
				if (!result.isSuccess) return;
				offset = 0;
				reader = new AsyncBatchReader<TableRow>(() => {
					void appendPage();
				});
				reader.enqueueBatch(result.data[Symbol.iterator](), {
					last: result.data.numRows < LIMIT,
				});
				tbody.replaceChildren();
				tableRoot.scrollTop = 0;
				void appendRows(ROWS * 2);
			},
			{ signal },
		);

		tableRoot.addEventListener("scroll", () => {
			const isAtBottom = tableRoot.scrollHeight - tableRoot.scrollTop <
				ROWS * ROW_HEIGHT * 1.5;
			if (isAtBottom) void appendRows(ROWS);
		});

		// ── Status bar (root child, filtered by everything) ────────────────
		{
			const statusBar = document.createElement("div");
			statusBar.classList.add("status-bar");
			const button = document.createElement("button");
			button.innerText = "Reset";
			button.style.visibility = "hidden";
			const span = document.createElement("span");
			const div = document.createElement("div");
			div.appendChild(button);
			div.appendChild(span);
			statusBar.appendChild(div);
			container.appendChild(statusBar);

			// One source of truth: reset clears the trait; the per-column
			// publishes retract their clauses in response.
			button.addEventListener("mousedown", () => {
				model.set("_selections", {});
				model.save_changes();
			});
			const selectionsParam = ctx.param(
				trait(model, "_selections"),
				(a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b),
			);
			const updateButton = (v: unknown) => {
				const any = v != null && Object.keys(v).length > 0;
				button.style.visibility = any ? "visible" : "hidden";
			};
			selectionsParam.addEventListener("value", updateButton, { signal });
			updateButton(selectionsParam.value);

			const countQuery = ctx.query(
				(filter: unknown) =>
					msql.Query.from(tableName)
						.select({ count: msql.count() })
						.where(filter),
				{ filterBy: ctx.filterBy },
			);
			countQuery.addEventListener(
				"value",
				// deno-lint-ignore no-explicit-any
				(result: any) => {
					if (!result.isSuccess) return;
					const count = Number(result.data.get(0)?.count ?? 0);
					span.innerText = count === totalRows
						? `${count.toLocaleString()} rows`
						: `${count.toLocaleString()} of ${totalRows.toLocaleString()} rows`;
				},
				{ signal },
			);
		}

		// ── Per-column summaries + selections ──────────────────────────────
		fields.forEach((field, i) => {
			const visContainer = cols[i].vis;
			if (kinds[field.name] === "interval") {
				wireIntervalColumn({
					ctx,
					mc,
					msql,
					model,
					signal,
					tableName,
					field,
					type: summaryTypeOf(field.type) ?? "number",
					extent: extents[field.name],
					container: visContainer,
				});
			} else {
				wirePointColumn({
					ctx,
					msql,
					model,
					signal,
					tableName,
					field,
					container: visContainer,
				});
			}
		});
	},
});

/**
 * A producer over one key of the `_selections` dict trait (absent ≡ null).
 * The default param equality (shallow, array-aware) gates emissions per
 * column even though the producer fires on every whole-dict change.
 */
function columnSelection(model: AnyModel, name: string) {
	return (set: (v: unknown) => void) => {
		const update = () => {
			const selections = model.get("_selections") ?? {};
			set(selections[name] ?? null);
		};
		update();
		model.on("change:_selections", update);
		return () => model.off("change:_selections", update);
	};
}

/** Write one column's selection: read-modify-write dict reassignment. */
function writeSelection(model: AnyModel, name: string, value: unknown) {
	const next = { ...(model.get("_selections") ?? {}) };
	if (value == null) delete next[name];
	else next[name] = value;
	model.set("_selections", next);
	model.save_changes();
}

function wireIntervalColumn(opts: {
	ctx: Ctx;
	mc: Mc;
	msql: Msql;
	model: AnyModel;
	signal: AbortSignal;
	tableName: string;
	field: flech.Field;
	type: "number" | "date";
	extent: [number, number];
	container: HTMLElement;
}) {
	const { ctx, mc, msql, model, signal, tableName, field, type, extent } = opts;
	const name = field.name;
	const child = ctx.child(`col:${name}`);
	const colExpr = msql.column(name);

	// Binning, exactly mosaic-plot's bin transform: binSpec's "nice" scheme
	// for numbers, time_bucket-snapped edges (via dateBin) for date/times.
	let lo: number, hi: number;
	let binSelect: Record<string, unknown>;
	let groupby: Array<string>;
	// deno-lint-ignore no-explicit-any
	let entryOf: (row: any) => { x0: number; x1: number; length: number };
	if (type === "number") {
		const spec = binSpec(extent[0], extent[1], BIN_STEPS);
		lo = spec.min;
		hi = spec.max;
		const step = (spec.max - spec.min) / spec.steps;
		const binExpr = msql
			.sql`FLOOR((${colExpr} - ${lo}) / ${step}) * ${step} + ${lo}`;
		binSelect = { x0: binExpr, n: msql.count() };
		groupby = ["x0"];
		entryOf = (row) => ({
			x0: Number(row.x0),
			x1: Number(row.x0) + step,
			length: Number(row.n),
		});
	} else {
		lo = extent[0];
		hi = extent[1];
		const { unit, step } = timeInterval(lo, hi, BIN_STEPS);
		const x0Expr = msql.dateBin(colExpr, unit, step);
		binSelect = {
			x0: x0Expr,
			x1: msql.add(x0Expr, msql.interval(unit, step)),
			n: msql.count(),
		};
		groupby = ["x0", "x1"];
		entryOf = (row) => ({
			x0: Number(row.x0),
			x1: Number(row.x1),
			length: Number(row.n),
		});
	}

	// The one trait→clause encoder for this column. `scaleRef` starts as a
	// d3 scale mirroring the plot's and is swapped for the plot's own once
	// rendered, so activate/update preagg metas stay consistent.
	const scaleRef = { current: makeScale(type, [lo, hi]) };
	const selParam = ctx.param(columnSelection(model, name));
	child.publish(selParam, (v: unknown) => {
		const value = v == null ? null : toClauseInterval(type, v);
		return mc.clauseInterval(colExpr, value, {
			scale: scaleRef.current,
			pixelSize: 1,
		});
	});

	let plot: ReturnType<typeof CrossfilterHistogramPlot> | undefined;
	const bins = child.query(
		(filter: unknown) =>
			msql.Query.from(tableName)
				.select(binSelect)
				.where(filter)
				.groupby(groupby),
		{ filterBy: child.filterBy },
	);
	bins.addEventListener(
		"value",
		// deno-lint-ignore no-explicit-any
		(result: any) => {
			if (result.isError) {
				console.error(`quak: bins query failed for ${name}`, result.error);
				return;
			}
			if (!result.isSuccess) return;
			let nullCount = 0;
			const entries: Array<{ x0: number; x1: number; length: number }> = [];
			for (const row of result.data) {
				if (row.x0 == null) {
					nullCount = Number(row.n);
					continue;
				}
				entries.push(entryOf(row));
			}
			entries.sort((a, b) => a.x0 - b.x0);
			if (!plot) {
				// an all-filtered first result still needs a real extent for
				// the scale (and a brushable surface to clear filters with)
				const initial = entries.length > 0
					? entries
					: [{ x0: lo, x1: hi, length: 0 }];
				plot = CrossfilterHistogramPlot(initial, field, { type, nullCount });
				opts.container.appendChild(plot);
				scaleRef.current = plot.scale("x");
				wireBrush();
			} else {
				plot.update(entries, { nullCount });
			}
		},
		{ signal },
	);

	function wireBrush() {
		assert(plot, "plot must exist");
		const scale = plot.scale("x");
		const [r0, r1] = scale.range;
		const brushG = d3.select(plot).append("g");
		const brush = d3.brushX()
			.extent([[r0, 0], [r1, HIST.height - HIST.marginBottom]])
			.on("brush end", (event) => {
				// Programmatic brush.move calls have no sourceEvent — skip.
				if (!event.sourceEvent) return;
				let value: [number, number] | null = null;
				if (event.selection) {
					// pixel-snapped inversion, as mosaic-plot's Interval1D
					// (pixelSize = 1)
					const inverted = (event.selection as [number, number])
						.map((px) => +scale.invert(Math.floor(px)))
						.sort((a, b) => a - b);
					value = [inverted[0], inverted[1]];
				}
				writeSelection(model, name, value);
			});
		brushG.call(brush);

		function moveBrushDOM(v: unknown) {
			const value = v as [number, number] | null;
			// deno-lint-ignore no-explicit-any
			const apply = scale.apply as any;
			const want = value
				? [
					apply(coerceScaleValue(type, value[0])),
					apply(coerceScaleValue(type, value[1])),
				].sort((a, b) => a - b)
				: null;
			const have = d3.brushSelection(brushG.node()!) as
				| [number, number]
				| null;
			const same = (!want && !have) ||
				(want && have && want[0] === have[0] && want[1] === have[1]);
			// deno-lint-ignore no-explicit-any
			if (!same) brushG.call(brush.move as any, want);
		}
		selParam.addEventListener("value", moveBrushDOM, { signal });
		moveBrushDOM(selParam.value);
	}
}

function wirePointColumn(opts: {
	ctx: Ctx;
	msql: Msql;
	model: AnyModel;
	signal: AbortSignal;
	tableName: string;
	field: flech.Field;
	container: HTMLElement;
}) {
	const { ctx, msql, model, signal, tableName, field } = opts;
	const name = field.name;
	const child = ctx.child(`col:${name}`);
	const colExpr = msql.column(name);

	const selParam = ctx.param(columnSelection(model, name));
	// Hand-rolled predicate (boro stamps identity): mosaic's clausePoint
	// renders a null value as `IN (NULL)`, which matches nothing — the null
	// bar needs a real `IS NULL`.
	child.publish(selParam, (v: unknown) => {
		const values = v == null ? [] : Array.isArray(v) ? v : [v];
		if (values.length === 0) {
			return { meta: { type: "point" }, value: null, predicate: null };
		}
		const rest = values.filter((x) => x !== NULL_KEY);
		const parts = [];
		if (rest.length > 0) {
			parts.push(msql.isIn(colExpr, rest.map((x) => msql.literal(x))));
		}
		if (rest.length !== values.length) {
			parts.push(msql.isNull(colExpr));
		}
		return {
			meta: { type: "point" },
			value: values,
			predicate: parts.length > 1 ? msql.or(parts) : parts[0],
		};
	});

	let plot: ReturnType<typeof ValueCountsPlot> | undefined;
	const counts = child.query(
		(filter: unknown) => {
			// deno-fmt-ignore
			const caseExpr = msql.sql`CASE
				WHEN ${colExpr} IS NULL THEN '__quak_null__'
				ELSE CAST(${colExpr} AS VARCHAR)
			END`;
			const inner = msql.Query.from(tableName)
				.select({ value: caseExpr, count: msql.count() })
				.groupby(caseExpr)
				.where(filter);
			return msql.Query.with({ counts: inner })
				.select({
					key: msql
						.sql`CASE WHEN "count" = 1 AND "value" != '__quak_null__' THEN '__quak_unique__' ELSE "value" END`,
					total: msql.sum("count"),
				})
				.from("counts")
				.groupby("key");
		},
		{ filterBy: child.filterBy },
	);
	counts.addEventListener(
		"value",
		// deno-lint-ignore no-explicit-any
		(result: any) => {
			if (result.isError) {
				console.error(`quak: counts query failed for ${name}`, result.error);
				return;
			}
			if (!result.isSuccess) return;
			if (!plot && result.data.numRows === 0) {
				// nothing to summarize yet (all rows filtered by siblings) —
				// initialize once data shows up
				return;
			}
			if (!plot) {
				plot = ValueCountsPlot(result.data, field);
				opts.container.appendChild(plot);
				// clicks are writes to the trait; the param loops them back
				signals.effect(() => {
					const selected = plot!.selected.value;
					const current = currentValue();
					const next = selected === undefined ? null : [selected];
					if (JSON.stringify(current) !== JSON.stringify(next)) {
						writeSelection(model, name, next);
					}
				});
				const syncPlot = (v: unknown) => {
					const values = v == null ? [] : Array.isArray(v) ? v : [v];
					plot!.selected.value = values.length === 1
						? String(values[0])
						: undefined;
				};
				selParam.addEventListener("value", syncPlot, { signal });
				syncPlot(selParam.value);
			} else {
				plot.data.value = result.data;
			}
		},
		{ signal },
	);

	function currentValue(): Array<unknown> | null {
		const v = (model.get("_selections") ?? {})[name];
		return v == null ? null : Array.isArray(v) ? v : [v];
	}
}

/**
 * number/date columns get an interval brush; everything else point select.
 * Mirrors mosaic-core's `jsType` mapping (which classified columns before
 * the rewrite) — note TIME is a "date" there too.
 */
function summaryTypeOf(type: flech.DataType): "number" | "date" | null {
	switch (type.typeId) {
		case flech.Type.Int:
		case flech.Type.Float:
		case flech.Type.Decimal:
			return "number";
		case flech.Type.Date:
		case flech.Type.Timestamp:
		case flech.Type.Time:
			return "date";
		default:
			return null;
	}
}

function toClauseInterval(
	type: "number" | "date",
	v: unknown,
): [number, number] | [Date, Date] {
	const value = v as [number, number];
	if (type === "date") {
		return [new Date(value[0]), new Date(value[1])];
	}
	return value;
}

function coerceScaleValue(type: "number" | "date", value: number) {
	return type === "date" ? new Date(value) : value;
}

/**
 * A d3 scale wrapped to Observable Plot's interface, mirroring the plot's
 * construction — used for clause metas until the real plot scale exists.
 */
function makeScale(type: "number" | "date", domain: [number, number]) {
	// deno-lint-ignore no-explicit-any
	const scale: any = type === "date" ? d3.scaleUtc() : d3.scaleLinear();
	scale.domain(domain).range([HIST.left, HIST.width - HIST.right]).nice();
	return Object.assign(
		(value: number) => scale(coerceScaleValue(type, value)),
		{
			type: type === "date" ? "time" : "linear",
			domain: scale.domain(),
			range: scale.range(),
			apply: scale,
			invert: scale.invert?.bind(scale),
		},
	);
}

const TRUNCATE = {
	whiteSpace: "nowrap",
	overflow: "hidden",
	textOverflow: "ellipsis",
} as const;

function thcol(field: flech.Field, minWidth: number, vis: HTMLElement) {
	const buttonVisible = signals.signal(false);
	const width = signals.signal(minWidth);
	const sortState: signals.Signal<"unset" | "asc" | "desc"> = signals.signal(
		"unset",
	);

	function nextSortState() {
		// simple state machine: unset -> asc -> desc -> unset
		sortState.value = ({
			"unset": "asc",
			"asc": "desc",
			"desc": "unset",
		} as const)[sortState.value];
	}

	// @deno-fmt-ignore
	const svg = html`<svg style=${{ width: "1.5em" }} fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
		<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 9L12 5.25L15.75 9" />
		<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 15L12 18.75L15.75 15" />
	</svg>`;
	const uparrow: SVGPathElement = svg.children[0];
	const downarrow: SVGPathElement = svg.children[1];
	const verticalResizeHandle = document.createElement("div");
	verticalResizeHandle.className = "resize-handle";

	// @deno-fmt-ignore
	const sortButton = html`<span aria-role="button" class="sort-button" onmousedown=${nextSortState}>${svg}</span>`;
	// @deno-fmt-ignore
	const th: HTMLTableCellElement = html`<th style=${{ overflow: "hidden" }}>
		<div style=${{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
			<span style=${{ marginBottom: "5px", maxWidth: "250px", ...TRUNCATE }}>${field.name}</span>
			${sortButton}
		</div>
		${verticalResizeHandle}
		<span class="gray" style=${{ fontWeight: 400, fontSize: "12px", userSelect: "none" }}>${formatDataType(field.type)}</span>
		${vis}
	</th>`;

	signals.effect(() => {
		uparrow.setAttribute("stroke", "var(--moon-gray)");
		downarrow.setAttribute("stroke", "var(--moon-gray)");
		// @deno-fmt-ignore
		const element = { "asc": uparrow, "desc": downarrow, "unset": null }[sortState.value];
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
		// reset column width, but don't interfere with the sort button
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
		const startX = event.clientX;
		const startWidth = th.offsetWidth -
			parseFloat(getComputedStyle(th).paddingLeft) -
			parseFloat(getComputedStyle(th).paddingRight);
		function onMouseMove(event: MouseEvent) {
			const dx = event.clientX - startX;
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

function formatof(schema: flech.Schema) {
	const format: Record<string, (value: unknown) => string> = Object.create(
		null,
	);
	for (const field of schema.fields) {
		format[field.name] = formatterForValue(field.type);
	}
	return format;
}

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

function isTableCellElement(node: unknown): node is HTMLTableCellElement {
	// @ts-expect-error - tagName is not defined on unknown
	return node?.tagName === "TD";
}

function isTableRowElement(node: unknown): node is HTMLTableRowElement {
	return node instanceof HTMLTableRowElement;
}

function shouldGrayoutValue(value: string) {
	return (
		value === "null" ||
		value === "undefined" ||
		value === "NaN" ||
		value === "TODO"
	);
}

/**
 * Adds custom wheel behavior, allowing horizontal or vertical scrolling based
 * on the dominant direction, preventing propagation to parent elements.
 */
function addDirectionalScrollWithPreventDefault(
	root: HTMLElement,
	scrollThreshold = 10,
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
				if (Math.abs(accumulatedDeltaX) > scrollThreshold) {
					root.scrollLeft += accumulatedDeltaX;
					accumulatedDeltaX = 0;
					accumulatedDeltaY = 0;
				}
			} else {
				if (Math.abs(accumulatedDeltaY) > scrollThreshold) {
					root.scrollTop += accumulatedDeltaY;
					accumulatedDeltaX = 0;
					accumulatedDeltaY = 0;
				}
			}
		},
		{ passive: false },
	);
}
