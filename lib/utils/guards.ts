import type * as flech from "@uwdata/flechette";

export function isObject(x: unknown): x is Record<string, unknown> {
	return typeof x === "object" && x !== null && !Array.isArray(x);
}

export function isFlechetteTable(x: unknown): x is flech.Table {
	// just check a couple of properties
	return isObject(x) && "schema" in x && "numCols" in x;
}
