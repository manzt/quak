/// <reference types="npm:vite/client" />
import * as mc from "@uwdata/mosaic-core";
import * as arrow from "apache-arrow";

import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

import { assert } from "../lib/utils/assert.ts";
import { DataTable, datatable } from "../lib/clients/DataTable.ts";

const decoder = new TextDecoder();
async function query(sql: string, kind: "arrow" | "json") {
	assert(kind === "arrow" || kind === "json", `Invalid kind: ${kind}`);
	let response = await invoke<ArrayBuffer>("query", { sql, kind });
	if (kind === "json") {
		let text = decoder.decode(response);
		return JSON.parse(text);
	}
	return arrow.tableFromIPC(new Uint8Array(response));
}

async function exec(sql: string) {
	await invoke<ArrayBuffer>("exec", { sql });
}

let coordinator = new mc.Coordinator();
// let logger = coordinator.logger(voidLogger());
let logger = coordinator.logger();
coordinator.databaseConnector({
	async query(q: { type: "arrow" | "json"; sql: string }) {
		logger.group(`query`);
		logger.log(q);
		let result = await query(q.sql, q.type);
		logger.log(result);
		logger.groupEnd(`query`);
		return result;
	},
});

let dt: DataTable;
let el = document.querySelector("#datatable")!;

let height = () => globalThis.innerHeight - 65;
globalThis.onresize = () => dt.resize(height());

document.querySelector("#open")?.addEventListener("mousedown", async () => {
	coordinator.clear();
	el.replaceChildren();
	let file = await open({ multiple: false });
	assert(file, "No file selected.");
	await exec("DROP VIEW IF EXISTS df");
	await exec(`CREATE VIEW df AS SELECT * FROM '${file.path}'`);
	dt = await datatable("df", { coordinator, height: height() });
	document.querySelector("#open")?.remove();
	el.appendChild(dt.node());
});
