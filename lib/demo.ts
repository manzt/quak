import * as mc from "@uwdata/mosaic-core";
import * as msql from "@uwdata/mosaic-sql";

import { assert } from "./utils/assert.ts";
import { type DataTable, datatable } from "./clients/DataTable.ts";

interface DuckDBClient {
	registerFileText(name: string, text: string): Promise<void>;
	registerFileBuffer(name: string, buffer: Uint8Array): Promise<void>;
}

let dropzone = document.querySelector("input")!;
let options = document.querySelector("#options")!;
let table = document.querySelector("#table")!;
let exportButton = document.querySelector("#export")! as HTMLButtonElement;

function getFileSelect(): Promise<File> {
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

type SupportedFileType = "csv" | "tsv" | "json" | "parquet";

function isSupportedFileType(t: unknown): t is SupportedFileType {
	return (
		t === "csv" ||
		t === "tsv" ||
		t === "json" ||
		t === "parquet"
	);
}

function resolveFileType(
	filename: string,
	type: string | null,
): SupportedFileType {
	if (type) {
		assert(isSupportedFileType(type), `Unsupported file type: ${type}`);
		return type as SupportedFileType;
	}
	let ext = filename.split(".").pop();
	assert(ext, "Could not determine file type.");
	if (isSupportedFileType(ext)) {
		return ext;
	}
	throw new Error(`Unsupported file type: ${ext}`);
}

async function getUrl(
	source: URL,
	{ db, type }: { db: DuckDBClient; type: string | null },
) {
	let fileType = resolveFileType(source.pathname, type);

	/**
	 * DuckDB for whatever reason tries to make range requests for CSV/JSON files
	 * We manually fetch TEXT files here and register them with DuckDB.
	 */
	if (fileType === "csv" || fileType === "tsv" || fileType === "json") {
		let file = source.pathname.split("/").pop() ?? "";
		let response = await fetch(source);
		await db.registerFileText(file, await response.text());
		if (fileType === "csv") {
			return msql.loadCSV("df", file, { replace: true });
		}
		if (fileType === "tsv") {
			return msql.loadCSV("df", file, { replace: true, delim: "\t" });
		}
		if (fileType === "json") {
			return msql.loadJSON("df", file, { replace: true });
		}
	}
	assert(fileType === "parquet", "Unsupported file type.");
	return msql.loadParquet(tableName, source.toString(), { replace: true });
}

async function getFile(
	f: File,
	{ db, type }: { db: DuckDBClient; type: string | null },
) {
	let fileType = resolveFileType(f.name, type);
	if (fileType === "csv") {
		await db.registerFileText(f.name, await f.text());
		return msql.loadCSV(tableName, f.name, { replace: true });
	}
	if (fileType === "tsv") {
		await db.registerFileText(f.name, await f.text());
		return msql.loadCSV(tableName, f.name, { replace: true, delim: "\t" });
	}
	if (fileType === "json") {
		await db.registerFileText(f.name, await f.text());
		return msql.loadJSON(tableName, f.name, { replace: true });
	}
	assert(fileType === "parquet", "Unsupported file type.");
	let bytes = new Uint8Array(await f.arrayBuffer());
	await db.registerFileBuffer(f.name, bytes);
	return msql.loadParquet(tableName, f.name, { replace: true });
}

let dt: DataTable;
let tableName = "df";
let coordinator = new mc.Coordinator();

async function main() {
	handleBanner();
	let params = new URLSearchParams(location.search);
	let source = params.get("source");
	let type = params.get("type");
	handleLoading(source);
	let connector = mc.wasmConnector();
	let db: DuckDBClient = await connector.getDuckDB();
	coordinator.databaseConnector(connector);

	let exec = source
		? await getUrl(new URL(source), { db, type })
		: await getFile(await getFileSelect(), { db, type: null });

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
		if (source?.startsWith("http://") || source?.startsWith("https://")) {
			// we need to replace the source with the actual URL
			let file = new URL(source).pathname.split("/").pop()!;
			from = from.replace(`'${file}'`, `'${source}'`);
		}
		let sql = dt.sql.value?.replace(' FROM "df"', from);
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
		dt = await datatable("df", { coordinator, height: 500 });
		table.replaceChildren();
		table.appendChild(dt.node());
	});
}
