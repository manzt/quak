import * as d3 from "../deps/d3.ts";
import { assert } from "../utils/assert.ts";
import { tickFormatterForBins } from "./tick-formatter-for-bins.ts";
import type { Bin, Scale } from "../types.ts";

interface HistogramOptions {
	type: "number" | "date";
	width?: number;
	height?: number;
	marginTop?: number;
	marginRight?: number;
	marginBottom?: number;
	marginLeft?: number;
	nullCount?: number;
	fillColor?: string;
	nullFillColor?: string;
	backgroundBarColor?: string;
}

/**
 * Returns an SVG element.
 *
 * @param bins - the "complete", or total bins for the crossfilter histogram.
 * @param options - A bag of options to configure the histogram
 */
export function CrossfilterHistogramPlot(
	bins: Array<Bin>,
	{
		type = "number",
		width = 125,
		height = 40,
		marginTop = 0,
		marginRight = 2,
		marginBottom = 12,
		marginLeft = 2,
		nullCount = 0,
		fillColor = "#64748b",
		nullFillColor = "#ca8a04",
		backgroundBarColor = "var(--moon-gray)",
	}: HistogramOptions,
): SVGSVGElement & {
	scale: (type: string) => Scale<number, number>;
	update(bins: Array<Bin>, opts: { nullCount: number }): void;
} {
	let nullBinWidth = nullCount === 0 ? 0 : 5;
	let spacing = nullBinWidth ? 4 : 0;
	let extent = /** @type {const} */ ([
		Math.min(...bins.map((d) => d.x0)),
		Math.max(...bins.map((d) => d.x1)),
	]);
	let x = type === "date" ? d3.scaleUtc() : d3.scaleLinear();
	x
		.domain(extent)
		// @ts-expect-error - range is ok with number for both number and time
		.range([marginLeft + nullBinWidth + spacing, width - marginRight])
		.nice();

	let y = d3.scaleLinear()
		.domain([0, Math.max(nullCount, ...bins.map((d) => d.length))])
		.range([height - marginBottom, marginTop]);

	let svg = d3.create("svg")
		.attr("width", width)
		.attr("height", height)
		.attr("viewBox", [0, 0, width, height])
		.attr("style", "max-width: 100%; height: auto; overflow: visible;");

	{
		// background bars with the "total" bins
		svg.append("g")
			.attr("fill", backgroundBarColor)
			.selectAll("rect")
			.data(bins)
			.join("rect")
			.attr("x", (d) => x(d.x0) + 1.5)
			.attr("width", (d) => x(d.x1) - x(d.x0) - 1.5)
			.attr("y", (d) => y(d.length))
			.attr("height", (d) => y(0) - y(d.length));
	}

	// Foreground bars for the current subset
	let foregroundBarGroup = svg
		.append("g")
		.attr("fill", fillColor);

	svg
		.append("g")
		.attr("transform", `translate(0,${height - marginBottom})`)
		.call(
			d3
				.axisBottom(x)
				.tickValues(x.domain())
				.tickFormat(tickFormatterForBins(type, bins))
				.tickSize(2.5),
		)
		.call((g) => {
			g.select(".domain").remove();
			g.attr("class", "gray");
			g.selectAll(".tick text")
				.attr("text-anchor", (_, i) => i === 0 ? "start" : "end")
				.attr("dx", (_, i) => i === 0 ? "-0.25em" : "0.25em");
		});

	/** @type {typeof foregroundBarGroup | undefined} */
	let foregroundNullGroup: typeof foregroundBarGroup | undefined = undefined;
	if (nullCount > 0) {
		let xnull = d3.scaleLinear()
			.range([marginLeft, marginLeft + nullBinWidth]);

		// background bar for the null bin
		svg.append("g")
			.attr("fill", backgroundBarColor)
			.append("rect")
			.attr("x", xnull(0))
			.attr("width", xnull(1) - xnull(0))
			.attr("y", y(nullCount))
			.attr("height", y(0) - y(nullCount));

		foregroundNullGroup = svg
			.append("g")
			.attr("fill", nullFillColor)
			.attr("color", nullFillColor);

		foregroundNullGroup.append("rect")
			.attr("x", xnull(0))
			.attr("width", xnull(1) - xnull(0));

		// Append the x-axis and add a null tick
		let axisGroup = foregroundNullGroup.append("g")
			.attr("transform", `translate(0,${height - marginBottom})`)
			.append("g")
			.attr("transform", `translate(${xnull(0.5)}, 0)`)
			.attr("class", "tick");

		axisGroup
			.append("line")
			.attr("stroke", "currentColor")
			.attr("y2", 2.5);

		axisGroup
			.append("text")
			.attr("fill", "currentColor")
			.attr("y", 4.5)
			.attr("dy", "0.71em")
			.attr("text-anchor", "middle")
			.text("∅")
			.attr("font-size", "0.9em")
			.attr("font-family", "var(--sans-serif)")
			.attr("font-weight", "normal");
	}

	// Apply styles for all axis ticks
	svg.selectAll(".tick")
		.attr("font-family", "var(--sans-serif)")
		.attr("font-weight", "normal");

	/**
	 * @param {Array<Bin>} bins
	 * @param {number} nullCount
	 */
	function render(bins: Array<Bin>, nullCount: number) {
		foregroundBarGroup
			.selectAll("rect")
			.data(bins)
			.join("rect")
			.attr("x", (d) => x(d.x0) + 1.5)
			.attr("width", (d) => x(d.x1) - x(d.x0) - 1.5)
			.attr("y", (d) => y(d.length))
			.attr("height", (d) => y(0) - y(d.length));
		foregroundNullGroup
			?.select("rect")
			.attr("y", y(nullCount))
			.attr("height", y(0) - y(nullCount));
	}

	let scales = {
		x: Object.assign(x, {
			type: "linear",
			domain: x.domain(),
			range: x.range(),
		}),
		y: Object.assign(y, {
			type: "linear",
			domain: y.domain(),
			range: y.range(),
		}),
	};
	let node = svg.node();
	assert(node, "Infallable");

	render(bins, nullCount);
	return Object.assign(node, {
		/** @param {string} type */
		scale(type: string) {
			// @ts-expect-error - scales is not defined
			let scale = scales[type];
			assert(scale, "Invalid scale type");
			return scale;
		},
		/**
		 * @param {Array<Bin>} bins
		 * @param {{ nullCount: number }} opts
		 */
		update(bins: Array<Bin>, { nullCount }: { nullCount: number }) {
			render(bins, nullCount);
		},
		reset() {
			render(bins, nullCount);
		},
	});
}
