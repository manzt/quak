import * as mc from "@uwdata/mosaic-core";
import * as arrow from "apache-arrow";

import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

import { assert } from "../lib/utils/assert.ts";
import { datatable } from "../lib/clients/DataTable.ts";

let decoder = new TextDecoder();

/**
 * @param {{ type: "arrow" | "json"; sql: string }} param
 */
async function query({ type: kind, sql }) {
	assert(kind === "arrow" || kind === "json", `Invalid kind: ${kind}`);
	/** @type {ArrayBuffer} */
	let response = await invoke("query", { sql, kind });
	if (kind === "json") {
		let text = decoder.decode(response);
		return JSON.parse(text);
	}
	return arrow.tableFromIPC(new Uint8Array(response));
}

/**
 * @param {string} sql
 * @returns {Promise<void>}
 */
async function exec(sql) {
	await invoke("exec", { sql });
}

/** @returns {Promise<string>} */
function getFilePath() {
	return new Promise((resolve) => {
		document.querySelector("#open").addEventListener("click", async () => {
			let file = await open({ multiple: false });
			assert(file, "No file selected.");
			resolve(file.path);
		});
	});
}

function windowHeight() {
	return globalThis.innerHeight - 45;
}

async function main() {
	let path = await getFilePath();
	let coordinator = new mc.Coordinator();
	coordinator.databaseConnector({ query });

	await exec("DROP VIEW IF EXISTS df");
	await exec(`CREATE VIEW df AS SELECT * FROM '${path}'`);

	let dt = await datatable("df", { coordinator, height: windowHeight() });
	document.querySelector("#dropzone")?.remove();
	document.body.appendChild(dt.node());
	globalThis.onresize = () => dt?.resize?.(windowHeight());
}

main();
