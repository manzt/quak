import type * as flech from "@uwdata/flechette";
import { MosaicClient, type Selection } from "@uwdata/mosaic-core";
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
			this.filterBy?.reset();
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
		return Query.from(this.#table)
			.select({ count: count() })
			.where(filter);
	}

	override queryResult(table: flech.Table) {
		let count: unknown = table.get(0)?.count ?? 0;
		assert(
			typeof count === "number" && !Number.isNaN(count),
			"Got NaN for count.",
		);
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
