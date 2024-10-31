import * as flech from "@uwdata/flechette";
// @ts-types="../deps/mosaic-core.d.ts"
import {
	type Interactor,
	MosaicClient,
	type Selection,
} from "@uwdata/mosaic-core";
// @ts-types="../deps/mosaic-sql.d.ts"
import { count, Query } from "@uwdata/mosaic-sql";
import { assert } from "../utils/assert.ts";

interface StatusBarOptions {
	table: string;
	filterBy?: Selection;
}

export class StatusBar extends MosaicClient {
	#table: string;
	#el = document.createElement("div");
	#button: HTMLButtonElement;
	#span: HTMLSpanElement;
	#totalRows: number | undefined = undefined;

	constructor(options: StatusBarOptions) {
		super(options.filterBy);
		this.#table = options.table;
		this.#button = document.createElement("button");
		this.#button.innerText = "Reset";
		this.#span = document.createElement("span");

		let div = document.createElement("div");
		div.appendChild(this.#button);
		div.appendChild(this.#span);
		this.#el.appendChild(div);
		this.#el.classList.add("status-bar");

		this.#button.addEventListener("mousedown", () => {
			if (!this.filterBy) return;
			// TODO: A better way to do this?
			// We want to clear all the existing selections
			// @see https://github.com/uwdata/mosaic/blob/8e63149753e7d6ca30274c032a04744e14df2fd6/packages/core/src/Selection.js#L265-L272
			for (let { source } of this.filterBy.clauses) {
				if (!isInteractor(source)) {
					console.warn("Skipping non-interactor source", source);
					continue;
				}
				source.reset();
				this.filterBy.update(source.clause());
			}
		});

		this.#button.style.visibility = "hidden";
		this.filterBy?.addEventListener("value", () => {
			// decide whether to display the reset button any time the filter changes
			if (this.filterBy?.clauses.length === 0) {
				this.#button.style.visibility = "hidden";
			} else {
				this.#button.style.visibility = "visible";
			}
		});
	}

	override query(filter = []) {
		let query = Query.from(this.#table)
			.select({ count: count() })
			.where(filter);
		return query;
	}

	override queryResult(table: flech.Table) {
		assert(
			table.schema.fields.find((f) => f.name === "count")?.type.typeId ===
				flech.Type.Int,
			"Expected count field to be an integer",
		);

		let count = Number(table.get(0)?.count ?? 0);
		if (!this.#totalRows) {
			// we need to know the total number of rows to display
			this.#totalRows = count;
		}
		let countStr = count.toLocaleString();
		if (count == this.#totalRows) {
			this.#span.innerText = `${countStr} rows`;
		} else {
			let totalStr = this.#totalRows.toLocaleString();
			this.#span.innerText = `${countStr} of ${totalStr} rows`;
		}
		return this;
	}

	node() {
		return this.#el;
	}
}

function isObject(x: unknown): x is Record<string, unknown> {
	return typeof x === "object" && x !== null && !Array.isArray(x);
}

function isInteractor(x: unknown): x is Interactor {
	return isObject(x) && "clause" in x && "reset" in x;
}
