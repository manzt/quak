// @ts-check

let regex = /^npm:(?:@([^/]+)\/)?([^@]+)@(.+)$/;

/**
 * @param {string} specifier
 * @returns {{scope: string | null, packageName: string, version: string}}
 */
function parseNpmSpecifier(specifier) {
	let match = specifier.match(regex);
	if (!match) {
		throw new Error(`Invalid npm specifier: ${specifier}`);
	}
	let [, scope, packageName, version] = match;
	return { scope: scope || null, packageName, version };
}

/**
 * @param {string} specifier
 */
export function npmSpecifierToCdnUrl(specifier) {
	let { scope, packageName, version } = parseNpmSpecifier(specifier);
	let name = scope ? `@${scope}/${packageName}` : packageName;
	if (name.startsWith("@uwdata")) {
		// prefer jsdelivr for @uwdata packages
		return `https://cdn.jsdelivr.net/npm/${name}@${version}/+esm`;
	}
	return `https://esm.sh/${name}@${version}`;
}

/**
 * @param {Record<string, string>} imports
 * @returns {Record<string, string>}
 */
export function mapImports(imports) {
	return Object.fromEntries(
		Object
			.entries(imports)
			.map(([k, v]) => [k, npmSpecifierToCdnUrl(v)]),
	);
}
