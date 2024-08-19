/// <reference types="npm:vite/client" />
import * as mc from "@uwdata/mosaic-core";
import * as msql from "@uwdata/mosaic-sql";

import { assert } from "./utils/assert.ts";
import { DataTable, datatable } from "./clients/DataTable.ts";

let dropzone = document.querySelector("input")!;
let options = document.querySelector("#options")!;
let table = document.querySelector("#table")!;
let exportButton = document.querySelector("#export")! as HTMLButtonElement;

function getFile(): Promise<File> {
	return new Promise((resolve) => {
		// on input file change
		dropzone.addEventListener("input", (e) => {
			let file = (e.target as HTMLInputElement).files![0];
			assert(file, "No file selected.");
			resolve(file);
		});
	});
}

function handleBanner() {
	let banner = document.querySelector("#banner")!;
	if (localStorage.getItem("quak-hide-banner") === "true") {
		banner.remove();
	} else {
		banner.classList.remove("hidden");
		document.querySelector("#dismiss")!.addEventListener("click", () => {
			localStorage.setItem("quak-hide-banner", "true");
			banner.remove();
		});
	}
}

function handleLoading(source: string | null) {
	if (!source) {
		options.classList.remove("hidden");
		return;
	}
	let loading = document.createElement("div");
	let file = source.split("/").pop();
	let text = document.createTextNode(`loading ${file}...`);
	loading.classList.add(
		"animate-bounce",
		"flex",
		"justify-center",
		"p-4",
	);
	loading.appendChild(text);
	table.appendChild(loading);
}

let dt: DataTable;
let tableName = "df";
let coordinator = new mc.Coordinator();

async function main() {
	handleBanner();
	let source = new URLSearchParams(location.search).get("source");
	handleLoading(source);
	let connector = mc.wasmConnector();
	let db = await connector.getDuckDB();
	coordinator.databaseConnector(connector);

	let exec: string;
	if (source) {
		exec = source.endsWith(".csv")
			? msql.loadCSV(tableName, source, { replace: true })
			: source.endsWith(".json")
			? msql.loadJSON(tableName, source, { replace: true })
			: msql.loadParquet(tableName, source, { replace: true });
	} else {
		let file = await getFile();
		if (file.name.endsWith(".csv")) {
			await db.registerFileText(file.name, await file.text());
			exec = msql.loadCSV(tableName, file.name, { replace: true });
		} else if (file.name.endsWith(".json")) {
			await db.registerFileText(file.name, await file.text());
			exec = msql.loadJSON(tableName, file.name, { replace: true });
		} else {
			assert(file.name.endsWith(".parquet"));
			await db.registerFileBuffer(
				file.name,
				new Uint8Array(await file.arrayBuffer()),
			);
			exec = msql.loadParquet(tableName, file.name, { replace: true });
		}
	}

	// Bug in mosaic-sql
	exec = exec.replace("json_format", "format");

	await coordinator.exec([exec]);
	dt = await datatable(tableName, { coordinator, height: 500 });
	options.remove();
	table.replaceChildren();
	table.appendChild(dt.node());

	function copyToClipboard() {
		let from = exec.match(/ FROM .*$/)?.[0];
		assert(from, "Could not find FROM clause in exec string.");
		let sql = dt.sql?.replace(' FROM "df"', from);
		navigator.clipboard.writeText(sql!);
		const icons = exportButton.querySelectorAll("svg")!;
		icons[0].classList.add("hidden");
		icons[1].classList.remove("hidden");
		setTimeout(() => {
			icons[0].classList.remove("hidden");
			icons[1].classList.add("hidden");
		}, 1000);
	}
	exportButton.addEventListener("mousedown", copyToClipboard);
	exportButton.addEventListener(
		"keydown",
		(e) => e?.key === "Enter" && copyToClipboard(),
	);
	exportButton.classList.remove("hidden");
}

main();

// Allows for hot-reloading of the data table code without needing to reload
// the input data source with duckdb.
// @ts-expect-error - HMR types not working with Deno
if (import.meta.hot) {
	// @ts-expect-error - HMR types not working with Deno
	import.meta.hot.accept("./clients/DataTable.ts", async ({ datatable }) => {
		coordinator.disconnect(dt);
		dt = await datatable("df", {
			coordinator,
			height: 500,
		});
		table.replaceChildren();
		table.appendChild(dt.node());
	});
}
