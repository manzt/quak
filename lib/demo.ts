/// <reference types="npm:vite/client" />
import * as mc from "@uwdata/mosaic-core";
import * as msql from "@uwdata/mosaic-sql";

import { assert } from "./utils/assert.ts";
import { datatable } from "./clients/DataTable.ts";

let dropzone = document.querySelector("input")!;
let options = document.querySelector("#options")!;
let table = document.querySelector("#table")!;

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

async function main() {
	handleBanner();
	let source = new URLSearchParams(location.search).get("source");
	handleLoading(source);
	let tableName = "df";
	let coordinator = new mc.Coordinator();
	let connector = mc.wasmConnector();
	let db = await connector.getDuckDB();
	coordinator.databaseConnector(connector);

	let exec;
	if (source) {
		exec = source.endsWith(".csv")
			? msql.loadCSV(tableName, source, { replace: true })
			: msql.loadParquet(tableName, source, { replace: true });
	} else {
		let file = await getFile();
		if (file.name.endsWith(".csv")) {
			await db.registerFile(file.name, await file.text());
			exec = msql.loadCSV(tableName, file.name, { replace: true });
		} else {
			assert(file.name.endsWith(".parquet"));
			await db.registerFileBuffer(
				file.name,
				new Uint8Array(await file.arrayBuffer()),
			);
			exec = msql.loadParquet(tableName, file.name, { replace: true });
		}
	}

	await coordinator.exec([exec]);
	let dt = await datatable(tableName, { coordinator, height: 500 });
	options.remove();
	table.replaceChildren();
	table.appendChild(dt.node());
}

main();
