/// <reference types="npm:vite/client" />
import * as mc from "@uwdata/mosaic-core";
import * as msql from "@uwdata/mosaic-sql";
import * as arrow from "apache-arrow";

import { FileResponse, open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

import { datatable } from "../lib/clients/DataTable.ts";

let table: keyof typeof datasets = "athletes";
let base = new URL(
	"https://raw.githubusercontent.com/uwdata/mosaic/main/data/",
);
let datasets = {
	athletes: new URL("athletes.csv", base).href,
	unemployment: new URL("us-county-unemployment.csv", base).href,
	metros: new URL("metros.csv", base).href,
} as const;

let coordinator = new mc.Coordinator();
// let logger = coordinator.logger(voidLogger());
let logger = coordinator.logger();
coordinator.databaseConnector({
	async query(query: msql.Query) {
		logger.group(`query`);
		logger.log(query);
		let bytes = await invoke("query", query.toString());
		let result = arrow.tableFromIPC(bytes);
		logger.log(result);
		logger.groupEnd(`query`);
		return result;
	},
});

document.querySelector("#open")?.addEventListener("mousedown", async () => {
	let response = await open({ multiple: false });
	let file = response;
	console.log(file);
});
