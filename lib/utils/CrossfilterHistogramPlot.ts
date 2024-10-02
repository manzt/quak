import { effect, signal } from "@preact/signals-core";
// @ts-types="npm:@types/d3"
import * as d3 from "d3";
import { assert } from "../utils/assert.ts";
import { tickFormatterForBins } from "./tick-formatter-for-bins.ts";
import type { Bin, Scale } from "../types.ts";
import type * as flech from "@uwdata/flechette";
import { formatDataType, percentFormatter } from "./formatting.ts";

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
	field: flech.Field,
	{
		type = "number",
		width = 125,
		height = 40,
		marginTop = 0,
		marginRight = 2,
		marginBottom = 12,
		marginLeft = 2,
		nullCount = 0,
		fillColor = "var(--primary)",
		nullFillColor = "var(--secondary)",
		backgroundBarColor = "var(--moon-gray)",
	}: HistogramOptions,
): SVGSVGElement & {
	scale: (type: string) => Scale<number, number>;
	update(bins: Array<Bin>, opts: { nullCount: number }): void;
} {
	const fieldType = formatDataType(field.type);
	const total = bins.reduce((sum, bin) => sum + bin.length, 0);
	let hovered = signal<number | Date | undefined>(undefined);
	let countLabel = signal<string>(fieldType);
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

	// Min and max values labels
	const axes = svg
		.append("g")
		.attr("transform", `translate(0,${height - marginBottom})`)
		.call(
			d3
				.axisBottom(x)
				.tickValues([...x.domain(), 0]) // min/max ticks and hovered
				.tickFormat(tickFormatterForBins(type, bins))
				.tickSize(2.5),
		)
		.call((g) => {
			g.select(".domain").remove();
			g.attr("class", "gray");
			g.selectAll(".tick text")
				.attr("text-anchor", (_, i) => ["start", "end", "start"][i])
				.attr("dx", (_, i) => ["-0.25em", "0.25em", "-0.25em"][i]);
		});

	const hoveredTickGroup = axes.node()?.querySelectorAll(".tick")[2];
	assert(hoveredTickGroup, "invariant");
	const hoveredTick = d3.select(hoveredTickGroup);

	//~ Background rect for the next section (hover label)
	const hoverLabelBackground = hoveredTick
		.insert("rect", ":first-child")
		.attr("width", 20)
		.attr("height", 20)
		.style("fill", "white");

	const fmt = type === "number"
		? d3.format(".3s")
		: tickFormatterForBins(type, bins);

	let [xmin, xmax] = x.domain();
	effect(() => {
		hoveredTick
			.attr("transform", `translate(${x(hovered.value ?? xmin)},0)`)
			.attr("visibility", hovered.value ? "visible" : "hidden");

		hoveredTick
			.selectAll("text")
			.text(`${fmt(hovered.value ?? xmin)}`)
			.attr("visibility", hovered.value ? "visible" : "hidden");

		const hoveredTickText = hoveredTick
			.select("text")
			.node() as SVGTextElement;
		const bbox = hoveredTickText.getBBox();
		const cond = (x(hovered.value ?? xmin) + bbox.width) > x(xmax);

		hoveredTickText.setAttribute("text-anchor", cond ? "end" : "start");
		hoveredTickText.setAttribute("dx", cond ? "-0.25em" : "0.25em");

		hoverLabelBackground
			.attr("visibility", hovered.value ? "visible" : "hidden")
			.attr(
				"transform",
				`translate(${(cond ? -bbox.width : 0) - 2.5}, 2.5)`,
			)
			.attr("width", bbox.width + 5)
			.attr("height", bbox.height + 5);

		const labelElement = svg
			.node()
			?.parentElement?.parentElement?.querySelector(".gray");
		if (labelElement) {
			labelElement.textContent = countLabel.value;
		}
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
			.attr("height", (d) => y(0) - y(d.length))
			.attr("opacity", 1);
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

	// Function to find the closest rect to a given x-coordinate
	function findClosestRect(x: number): SVGRectElement | null {
		let closestRect: SVGRectElement | null = null;
		let minDistance = Infinity;

		foregroundBarGroup.selectAll("rect").each(function () {
			const rect = d3.select(this);
			const rectX = parseFloat(rect.attr("x"));
			const rectWidth = parseFloat(rect.attr("width"));
			const rectCenter = rectX + rectWidth / 2;
			const distance = Math.abs(x - rectCenter);

			if (distance < minDistance) {
				minDistance = distance;
				closestRect = this as SVGRectElement;
			}
		});

		return closestRect;
	}

	axes.on("mousemove", (event) => {
		const relativeX = event.clientX - node.getBoundingClientRect().left;
		const hoveredX = x.invert(relativeX);
		hovered.value = clamp(hoveredX, xmin, xmax);

		const closestRect = findClosestRect(relativeX);

		foregroundBarGroup.selectAll("rect").attr("opacity", function () {
			return this === closestRect ? 1 : 0.3;
		});

		const hoveredValue = hovered.value;

		const hoveredBin = hoveredValue !== undefined
			? bins.find((bin) => hoveredValue >= bin.x0 && hoveredValue < bin.x1)
			: undefined;
		const hoveredValueCount = hoveredBin?.length;

		countLabel.value =
			hoveredValue !== undefined && hoveredValueCount !== undefined
				? `${hoveredValueCount} row${hoveredValueCount === 1 ? "" : "s"} (${
					percentFormatter(hoveredValueCount / total)
				})`
				: fieldType;
	});

	node.addEventListener("mousemove", (event) => {
		const relativeX = event.clientX - node.getBoundingClientRect().left;
		hovered.value = clamp(x.invert(relativeX), xmin, xmax);
	});

	axes.on("mouseleave", () => {
		hovered.value = undefined;
		foregroundBarGroup.selectAll("rect").attr("opacity", 1);
		countLabel.value = fieldType;
	});

	node.addEventListener("mouseleave", () => {
		hovered.value = undefined;
	});

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

function clamp(
	value: number | Date,
	min: number | Date,
	max: number | Date,
): number {
	// @ts-expect-error - value is either number or Date
	return Math.max(min, Math.min(max, value));
}
