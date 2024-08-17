import { effect, signal } from "@preact/signals-core";
import type * as arrow from "apache-arrow";
import * as d3 from "../deps/d3.ts";
import { assert } from "./assert.ts";
import { formatDataType, percentFormatter } from "./formatting.ts";

type CountTableData = arrow.Table<{
	key: arrow.Utf8;
	total: arrow.Int;
}>;

interface ValueCountsPlot {
	width?: number;
	height?: number;
	marginRight?: number;
	marginBottom?: number;
	marginLeft?: number;
	nullCount?: number;
	fillColor?: string;
	nullFillColor?: string;
	backgroundBarColor?: string;
}

export function ValueCountsPlot(
	data: CountTableData,
	field: arrow.Field,
	{
		width = 125,
		height = 30,
		marginBottom = 12,
		marginRight = 2,
		marginLeft = 2,
		fillColor = "var(--primary)",
		nullFillColor = "var(--secondary)",
		backgroundBarColor = "rgb(226, 226, 226)",
	}: ValueCountsPlot = {},
) {
	const fieldType = formatDataType(field.type);

	let root = document.createElement("div");
	root.style.position = "relative";

	let container = document.createElement("div");
	Object.assign(container.style, {
		width: `${width}px`,
		height: `${height}px`,
		display: "flex",
		borderRadius: "5px",
		overflow: "hidden",
	});

	let bars = createBars(data, {
		width,
		height,
		marginRight,
		marginLeft,
		fillColor,
		nullFillColor,
		backgroundBarColor,
	});

	for (let bar of bars.elements) {
		container.appendChild(bar);
	}

	let text = createTextOutput();

	let hovering = signal<string | undefined>(undefined);
	let selected = signal<string | undefined>(undefined);
	let counts = signal<CountTableData>(data);
	let countLabel = signal<string>(fieldType);

	let hitArea = document.createElement("div");
	Object.assign(hitArea.style, {
		position: "absolute",
		top: "0",
		left: "-5px",
		width: `${width + 10}px`,
		height: `${height + marginBottom}px`,
		backgroundColor: "rgba(255, 255, 255, 0.01)",
		cursor: "pointer",
	});
	hitArea.addEventListener("mousemove", (event) => {
		hovering.value = bars.nearestX(event);

		let update: Record<string, number> = Object.fromEntries(
			Array.from(data.toArray(), (d) => [d.key, d.total]),
		);

		let total = Object.values(update).reduce((a, b) => a + b, 0);

		const hoveredValue = hovering.value;
		const hoveredValueCount = hoveredValue !== undefined
			? update[hoveredValue]
			: undefined;

		countLabel.value =
			hoveredValue !== undefined && hoveredValueCount !== undefined
				? `${hoveredValueCount} row${hoveredValueCount === 1 ? "" : "s"} (${
					percentFormatter(hoveredValueCount / total)
				})`
				: fieldType;
	});
	hitArea.addEventListener("mouseout", () => {
		hovering.value = undefined;
		countLabel.value = fieldType;
	});
	hitArea.addEventListener("mousedown", (event) => {
		let next = bars.nearestX(event);
		selected.value = selected.value === next ? undefined : next;
	});

	effect(() => {
		text.textContent = bars.textFor(hovering.value ?? selected.value);
		bars.render(counts.value, hovering.value, selected.value);

		const labelElement = root.parentElement?.parentElement?.querySelector(
			".gray",
		);
		if (labelElement) {
			labelElement.textContent = countLabel.value;
		}
	});

	root.appendChild(container);
	root.appendChild(text);
	root.appendChild(hitArea);

	return Object.assign(root, { selected, data: counts });
}

function createBar(opts: {
	title: string;
	fillColor: string;
	textColor: string;
	height: number;
	width: number;
}) {
	let { title, fillColor, textColor, width, height } = opts;
	let bar = document.createElement("div");
	bar.title = title;
	Object.assign(bar.style, {
		background: createSplitBarFill({
			color: fillColor,
			bgColor: "var(--moon-gray)",
			frac: 50,
		}),
		width: `${width}px`,
		height: `${height}px`,
		borderColor: "white",
		borderWidth: "0px 1px 0px 0px",
		borderStyle: "solid",
		opacity: 1,
		textAlign: "center",
		position: "relative",
		display: "flex",
		overflow: "hidden",
		alignItems: "center",
		fontWeight: 400,
		fontFamily: "var(--sans-serif)",
		boxSizing: "border-box",
	});
	let span = document.createElement("span");
	Object.assign(span.style, {
		overflow: "hidden",
		width: `calc(100% - 4px)`,
		left: "0px",
		position: "absolute",
		padding: "0px 2px",
		color: textColor,
	});
	if (width > 10) {
		span.textContent = title;
	}
	bar.appendChild(span);
	return bar;
}

function prepareData(data: CountTableData) {
	let arr: Array<{ key: string; total: number }> = data
		.toArray()
		.toSorted((a, b) => b.total - a.total);
	let total = arr.reduce((acc, d) => acc + d.total, 0);
	return {
		bins: arr.filter((d) =>
			d.key !== "__quak_null__" && d.key !== "__quak_unique__"
		),
		nullCount: arr.find((d) => d.key === "__quak_null__")?.total ?? 0,
		uniqueCount: arr.find((d) => d.key === "__quak_unique__")?.total ?? 0,
		total,
	};
}

type Entry = { key: string; total: number };

function createBars(data: CountTableData, opts: {
	width: number;
	height: number;
	marginRight: number;
	marginLeft: number;
	fillColor: string;
	backgroundBarColor: string;
	nullFillColor: string;
}) {
	let source = prepareData(data);
	let x = d3.scaleLinear()
		.domain([0, source.total])
		.range([opts.marginLeft, opts.width - opts.marginRight]);

	// number of bars to show before virtualizing
	let thresh = 20;

	let bars: Array<HTMLElement & { data: Entry }> = [];
	for (let d of source.bins.slice(0, thresh)) {
		let bar = createBar({
			title: d.key,
			fillColor: opts.fillColor,
			textColor: "white",
			width: x(d.total),
			height: opts.height,
		});
		bars.push(Object.assign(bar, { data: d }));
	}

	// TODO: create a div "hover" bar for this "area" of the visualization
	let hoverBar = createVirtualSelectionBar(opts);
	let selectBar = createVirtualSelectionBar(opts);
	let virtualBar: HTMLElement | undefined;
	if (source.bins.length > thresh) {
		let total = source.bins.slice(thresh).reduce(
			(acc, d) => acc + d.total,
			0,
		);
		virtualBar = Object.assign(document.createElement("div"), {
			title: "__quak_virtual__",
		});
		Object.assign(virtualBar.style, {
			width: `${x(total)}px`,
			height: "100%",
			borderColor: "white",
			borderWidth: "0px 1px 0px 0px",
			borderStyle: "solid",
			opacity: 1,
		});
		let vbars = document.createElement("div");
		Object.assign(vbars.style, {
			width: "100%",
			height: "100%",
			background:
				`repeating-linear-gradient(to right, ${opts.fillColor} 0px, ${opts.fillColor} 1px, white 1px, white 2px)`,
		});
		virtualBar.appendChild(vbars);
		virtualBar.appendChild(hoverBar);
		virtualBar.appendChild(selectBar);
		Object.defineProperty(virtualBar, "data", {
			value: source.bins.slice(thresh),
		});
		// @ts-expect-error - data is different for virtual bar...
		// TODO: need to represent difference in types
		bars.push(virtualBar);
	}

	if (source.uniqueCount) {
		let bar = createBar({
			title: "unique",
			fillColor: opts.backgroundBarColor,
			textColor: "var(--mid-gray)",
			width: x(source.uniqueCount),
			height: opts.height,
		});
		bar.title = "__quak_unique__";
		bars.push(Object.assign(bar, {
			data: {
				key: "__quak_unique__",
				total: source.uniqueCount,
			},
		}));
	}

	if (source.nullCount) {
		let bar = createBar({
			title: "null",
			fillColor: opts.nullFillColor,
			textColor: "white",
			width: x(source.nullCount),
			height: opts.height,
		});
		bar.title = "__quak_null__";
		bars.push(Object.assign(bar, {
			data: {
				key: "__quak_null__",
				total: source.uniqueCount,
			},
		}));
	}

	let first = bars[0];
	let last = bars[bars.length - 1];
	if (first === last) {
		first.style.borderRadius = "5px";
	} else {
		first.style.borderRadius = "5px 0px 0px 5px";
		last.style.borderRadius = "0px 5px 5px 0px";
	}

	function virtualBin(key: string) {
		assert(virtualBar);
		//TODO: Is there a better way to do this?
		let voffset = bars
			.slice(0, thresh)
			.map((b) => b.getBoundingClientRect().width)
			.reduce((a, b) => a + b, 0);

		// @ts-expect-error - data is a property we set on the element
		let vbins: Array<{ key: string; total: number }> = virtualBar.data;
		let rect = virtualBar.getBoundingClientRect();
		let dx = rect.width / vbins.length;
		let idx = vbins.findIndex((d) => d.key === key);
		assert(idx !== -1, `key ${key} not found in virtual bins`);
		return {
			...vbins[idx],
			x: dx * idx + voffset,
		};
	}

	function reset(opactiy: number) {
		bars.forEach((bar) => {
			if (bar.title === "__quak_virtual__") {
				// @ts-expect-error - we set this above
				let vbars: HTMLDivElement = bar.firstChild!;
				vbars.style.opacity = opactiy.toString();
				vbars.style.background = createVirtualBarRepeatingBackground({
					color: opts.fillColor,
				});
			} else {
				bar.style.opacity = opactiy.toString();
				bar.style.background = createSplitBarFill({
					color: bar.title === "__quak_unique__"
						? opts.backgroundBarColor
						: bar.title === "__quak_null__"
						? opts.nullFillColor
						: opts.fillColor,
					bgColor: opts.backgroundBarColor,
					frac: 1,
				});
			}
			bar.style.borderColor = "white";
			bar.style.borderWidth = "0px 1px 0px 0px";
			bar.style.removeProperty("box-shadow");
		});
		bars[bars.length - 1].style.borderWidth = "0px";
		hoverBar.style.visibility = "hidden";
		selectBar.style.visibility = "hidden";
	}

	function hover(key: string, selected?: string) {
		let bar = bars.find((b) => b.data.key === key);
		if (bar !== undefined) {
			bar.style.opacity = "1";
			return;
		}
		let vbin = virtualBin(key);
		hoverBar.title = vbin.key;
		hoverBar.data = vbin;
		hoverBar.style.opacity = selected ? "0.25" : "1";
		hoverBar.style.left = `${vbin.x}px`;
		hoverBar.style.visibility = "visible";
	}

	function select(key: string) {
		let bar = bars.find((b) => b.data.key === key);
		if (bar !== undefined) {
			bar.style.opacity = "1";
			bar.style.boxShadow = "inset 0 0 0 1.2px black";
			return;
		}
		let vbin = virtualBin(key);
		selectBar.style.opacity = "1";
		selectBar.title = vbin.key;
		selectBar.data = vbin;
		selectBar.style.left = `${vbin.x}px`;
		selectBar.style.visibility = "visible";
	}

	let counts: Record<string, number> = Object.fromEntries(
		Array.from(data.toArray(), (d) => [d.key, d.total]),
	);

	return {
		elements: bars,
		nearestX(event: MouseEvent): string | undefined {
			let bar = nearestX(event, bars);
			if (!bar) return;
			if (bar.title !== "__quak_virtual__") {
				// @ts-expect-error - data is a property we set on the element
				return bar.data.key;
			}
			let rect = bar.getBoundingClientRect();
			let mouseX = event.clientX - rect.left;
			// @ts-expect-error - data is a property we set on the element
			let data: Array<{ key: string; total: number }> = bar.data;
			let idx = Math.floor((mouseX / rect.width) * data.length);
			return data[idx].key;
		},
		render(data: CountTableData, hovering?: string, selected?: string) {
			reset(hovering || selected ? 0.4 : 1);
			let update: Record<string, number> = Object.fromEntries(
				Array.from(data.toArray(), (d) => [d.key, d.total]),
			);
			let total = Object.values(update).reduce((a, b) => a + b, 0);
			for (let bar of bars) {
				if (bar.title === "__quak_virtual__") {
					let vbars = bar.firstChild as HTMLDivElement;
					vbars.style.background = createVirtualBarRepeatingBackground({
						color: (total < source.total) || selected
							? opts.backgroundBarColor
							: opts.fillColor,
					});
				} else {
					let key: string = bar.data.key;
					let frac = (update[key] ?? 0) / counts[key];
					if (selected) frac = key === selected ? frac : 0;
					bar.style.background = createSplitBarFill({
						color: bar.title === "__quak_unique__"
							? opts.backgroundBarColor
							: bar.title === "__quak_null__"
							? opts.nullFillColor
							: opts.fillColor,
						bgColor: opts.backgroundBarColor,
						frac: isNaN(frac) ? 0 : frac,
					});
				}
			}
			if (hovering !== undefined) {
				hover(hovering, selected);
			}
			if (selected !== undefined) {
				select(selected);
			}
		},
		textFor(key?: string): string {
			if (key === undefined) {
				let ncats = data.numRows;
				return `${ncats.toLocaleString()} categor${ncats === 1 ? "y" : "ies"}`;
			}
			if (key === "__quak_unique__") {
				return `${source.uniqueCount.toLocaleString()} unique value${
					source.uniqueCount === 1 ? "" : "s"
				}`;
			}
			if (key === "__quak_null__") {
				return "null";
			}
			return key.toString();
		},
	};
}

function createTextOutput() {
	let node = document.createElement("div");
	Object.assign(node.style, {
		pointerEvents: "none",
		height: "15px",
		maxWidth: "100%",
		overflow: "hidden",
		textOverflow: "ellipsis",
		position: "absolute",
		fontWeight: 400,
		marginTop: "1.5px",
		color: "var(--mid-gray)",
	});
	return node;
}

function createVirtualSelectionBar(opts: { fillColor: string }) {
	let node = document.createElement("div");
	Object.assign(node.style, {
		position: "absolute",
		top: "0",
		width: "1.5px",
		height: "100%",
		backgroundColor: opts.fillColor,
		pointerEvents: "none",
		visibility: "hidden",
	});
	return Object.assign(node, {
		data: { key: "", total: 0 },
	});
}

function nearestX({ clientX }: MouseEvent, bars: Array<HTMLElement>) {
	// could use a binary search here if needed
	for (let bar of bars) {
		let rect = bar.getBoundingClientRect();
		if (clientX >= rect.left && clientX <= rect.right) {
			return bar;
		}
	}
}

/**
 * Creates a fill gradient that is filled x% with a color and the rest with a background color.
 */
function createSplitBarFill(
	options: { color: string; bgColor: string; frac: number },
) {
	let { color, bgColor, frac } = options;
	let p = frac * 100;
	// deno-fmt-ignore
	return `linear-gradient(to top, ${color} ${p}%, ${bgColor} ${p}%, ${bgColor} ${100 - p}%)`;
}

function createVirtualBarRepeatingBackground({ color }: { color: string }) {
	return `repeating-linear-gradient(to right, ${color} 0px, ${color} 1px, white 1px, white 2px)`;
}
