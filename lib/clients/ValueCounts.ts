// @ts-types="../deps/mosaic-core.d.ts";
import { clausePoint, MosaicClient, type Selection } from "@uwdata/mosaic-core";
// @ts-types="../deps/mosaic-sql.d.ts";
import {
	column,
	count,
	Query,
	sql,
	type SQLExpression,
	sum,
} from "@uwdata/mosaic-sql";
import type * as arrow from "apache-arrow";
import { effect } from "@preact/signals-core";

import { ValueCountsPlot } from "../utils/ValueCountsPlot.ts";
import { assert } from "../utils/assert.ts";

interface UniqueValuesOptions {
	/** The table to query. */
	table: string;
	/** An arrow Field containing the column info to use for the histogram. */
	field: arrow.Field;
	/** A mosaic selection to filter the data. */
	filterBy: Selection;
}

type CountTable = arrow.Table<{ key: arrow.Utf8; total: arrow.Int }>;

export class ValueCounts extends MosaicClient {
	#table: string;
	#column: string;
	#field: arrow.Field;
	#el: HTMLElement = document.createElement("div");
	#plot: ReturnType<typeof ValueCountsPlot> | undefined;

	constructor(options: UniqueValuesOptions) {
		super(options.filterBy);
		this.#table = options.table;
		this.#column = options.field.name;
		this.#field = options.field;

		// FIXME: There is some issue with the mosaic client or the query we
		// are using here. Updates to the Selection (`filterBy`) seem to be
		// missed by the coordinator, and query/queryResult are not called
		// by the coordinator when the filterBy is updated.
		//
		// Here we manually listen for the changes to filterBy and update this
		// client internally. It _should_ go through the coordinator.
		options.filterBy.addEventListener("value", async () => {
			let filters = options.filterBy.predicate();
			let query = this.query(filters);
			if (this.#plot) {
				let data = await this.coordinator.query(query);
				this.#plot.data.value = data;
			}
		});
	}

	query(filter: Array<SQLExpression> = []): Query {
		let counts = Query
			.from({ source: this.#table })
			.select({
				value: sql`CASE
					WHEN ${column(this.#column)} IS NULL THEN '__quak_null__'
					ELSE ${column(this.#column)}
				END`,
				count: count(),
			})
			.groupby("value")
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

	queryResult(data: CountTable): this {
		if (!this.#plot) {
			let plot = (this.#plot = ValueCountsPlot(data, this.#field));
			this.#el.appendChild(plot);
			effect(() => {
				let clause = this.clause(plot.selected.value);
				this.filterBy!.update(clause);
			});
		} else {
			this.#plot.data.value = data;
		}
		return this;
	}

	clause<T>(value?: T) {
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
