import * as arrow from "apache-arrow";
// @deno-types="../deps/mosaic-core.d.ts"
import { MosaicClient, Selection } from "@uwdata/mosaic-core";
// @deno-types="../deps/mosaic-sql.d.ts"
import { count, Query } from "@uwdata/mosaic-sql";

interface StatusBarOptions {
	table: string;
	filterBy?: Selection;
}

export class StatusBar extends MosaicClient {
	#table: string;
	#el = document.createElement("div");
	#button: HTMLButtonElement;
	#span: HTMLSpanElement;

	constructor(options: StatusBarOptions) {
		super(options.filterBy);
		this.#table = options.table;
		this.#button = document.createElement("button");
		this.#button.innerText = "Reset";
		this.#span = document.createElement("span");
		this.#el.appendChild(this.#button);
		this.#el.appendChild(this.#span);

		this.#button.addEventListener("mousedown", () => {
			console.log(this.filterBy);
			// TODO: Figure this out
			// We want to clear all the existing selections
			// @see https://github.com/uwdata/mosaic/blob/8e63149753e7d6ca30274c032a04744e14df2fd6/packages/core/src/Selection.js#L265-L272

			// let _resolver = this.filterBy?.resolver;
			// this.filterBy.clauses.forEach(c => c.source?.reset?.());
			// this.filterBy.clauses.map(clause => {
			//   this.filterBy.update(clause);
			// })
		});

		Object.assign(this.#el.style, {
			textAlign: "right",
		});
	}

	query(filter = []) {
		let query = Query.from(this.#table)
			.select({ count: count() })
			.where(filter);
		return query;
	}

	queryResult(table: arrow.Table<{ count: arrow.Int }>) {
		let total = table.get(0)?.count ?? 0;
		this.#span.innerText = `${total.toLocaleString()} rows`;
		return this;
	}

	node() {
		return this.#el;
	}
}
