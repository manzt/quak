import {
	clausePoint,
	MosaicClient,
	type Selection,
	type SelectionClause,
} from "@uwdata/mosaic-core";
import {
	column,
	count,
	type ExprNode,
	Query,
	sql,
	sum,
} from "@uwdata/mosaic-sql";
import type * as flech from "@uwdata/flechette";
import { effect } from "@preact/signals-core";

import { ValueCountsPlot } from "../utils/ValueCountsPlot.ts";
import { assert } from "../utils/assert.ts";

interface UniqueValuesOptions {
	/** The table to query. */
	table: string;
	/** An arrow Field containing the column info to use for the histogram. */
	field: flech.Field;
	/** A mosaic selection to filter the data. */
	filterBy: Selection;
}

type CountTable = flech.Table;

export class ValueCounts extends MosaicClient {
	#table: string;
	#column: string;
	#field: flech.Field;
	#el: HTMLElement = document.createElement("div");
	#plot: ReturnType<typeof ValueCountsPlot> | undefined;

	constructor(options: UniqueValuesOptions) {
		super(options.filterBy);
		this.#table = options.table;
		this.#column = options.field.name;
		this.#field = options.field;
	}

	override query(filter: Array<ExprNode> = []): Query {
		let col = column(this.#column);
		let counts = Query
			.from({ source: this.#table })
			.select({
				value: sql`CASE
					WHEN ${col} IS NULL THEN '__quak_null__'
					ELSE CAST(${col} AS VARCHAR)
				END`,
				count: count(),
			})
			.groupby(sql`CASE
				WHEN ${col} IS NULL THEN '__quak_null__'
				ELSE CAST(${col} AS VARCHAR)
			END`)
			.where(filter);
		return Query
			.with({ counts })
			.select(
				{
					key: sql`CASE
						WHEN "count" = 1 AND "value" != '__quak_null__' THEN '__quak_unique__'
						ELSE "value"
					END`,
					total: sum("count"),
				},
			)
			.from("counts")
			.groupby("key");
	}

	override queryResult(data: CountTable): this {
		if (!this.#plot) {
			let plot = (this.#plot = ValueCountsPlot(data, this.#field));
			this.#el.appendChild(plot);
			effect(() => {
				let clause = this.clause(plot.selected.value);
				this.filterBy?.update(clause);
			});
		} else {
			this.#plot.data.value = data;
		}
		return this;
	}

	clause<T>(value?: T): SelectionClause {
		let update = value === "__quak_null__" ? null : value;
		return clausePoint(this.#column, update, {
			source: this,
		});
	}

	reset() {
		assert(this.#plot, "ValueCounts plot not initialized");
		this.#plot.selected.value = undefined;
	}

	get plot() {
		return {
			node: () => this.#el,
		};
	}
}
