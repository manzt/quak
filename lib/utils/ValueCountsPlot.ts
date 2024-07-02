import type * as arrow from "apache-arrow";

import * as d3 from "../deps/d3.ts";

interface ValueCountsPlot {
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

export function ValueCountsPlot(
	data: arrow.Table<{
		key: arrow.Utf8;
		total: arrow.Int;
	}>,
	{
		width = 125,
		height = 30,
		marginTop = 0,
		marginRight = 2,
		// marginBottom = 12,
		marginLeft = 2,
		fillColor = "#64748b",
		nullFillColor = "#ca8a04",
		backgroundBarColor = "var(--moon-gray)",
	}: ValueCountsPlot = {},
) {
	let arr: Array<{ key: string; total: number }> = data
		.toArray()
		.toSorted(
			(a, b) => {
				if (a.key === "__quak_null__") return 1;
				if (b.key === "__quak_null__") return -1;
				if (a.key === "__quak_unique__") return 1;
				if (b.key === "__quak_unique__") return -1;
				return b.total - a.total;
			},
		);

	let container = document.createElement("div");
	container.style.position = "relative";

	let bars = document.createElement("div");
	Object.assign(bars.style, {
		width: `${width}px`,
		height: `${height}px`,
		display: "flex",
		marginTop: `${marginTop}px`,
		borderRadius: "5px",
		overflow: "hidden",
		cursor: "pointer",
	});

	let total = arr.reduce((acc, d) => acc + d.total, 0);
	let x = d3.scaleLinear()
		.domain([0, total])
		.range([marginLeft, width - marginRight]);

	let nullItem: undefined | { key: string; total: number };
	if (arr.at(-1)?.key === "__quak_null__") {
		nullItem = arr.pop();
	}
	let uniqueItem: undefined | { key: string; total: number };
	if (arr.at(-1)?.key === "__quak_unique__") {
		uniqueItem = arr.pop();
	}

	// number of bars to show before virtualizing
	let thresh = 20;
	for (let d of arr.slice(0, thresh)) {
		let bar = createBar({
			title: d.key,
			fillColor: fillColor,
			textColor: "white",
			width: x(d.total),
			height,
		});
		bar.addEventListener("mouseenter", () => {
			text.innerText = d.key;
			bars.querySelectorAll("div").forEach((b) => {
				b.style.opacity = b === bar ? "1" : "0.4";
			});
		});
		bar.addEventListener("mouseleave", () => {
			text.innerText = "";
			bars.querySelectorAll("div").forEach((b) => {
				b.style.opacity = "1";
			});
		});
		bars.appendChild(bar);
	}

	// TODO: create a div "hover" bar for this "area" of the visualization

	if (arr.length > thresh) {
		let total = arr.slice(thresh).reduce((acc, d) => acc + d.total, 0);
		let bar = Object.assign(document.createElement("div"), {
			title: "more",
		});
		Object.assign(bar.style, {
			background:
				`repeating-linear-gradient(to right, ${fillColor} 0px, ${fillColor} 1px, white 1px, white 2px)`,
			width: `${x(total)}px`,
			height: "100%",
			borderColor: "white",
			borderWidth: "0px 1px 0px 0px",
			borderStyle: "solid",
			opacity: 1,
			cursor: "pointer",
		});

		let hoverBar = document.createElement("div");
		Object.assign(hoverBar.style, {
			position: "absolute",
			top: "0",
			width: "1.5px",
			height: "100%",
			backgroundColor: fillColor,
			pointerEvents: "none",
			visibility: "hidden",
		});

		bar.addEventListener("mousemove", (event) => {
			let barRect = bar.getBoundingClientRect();
			let mouseX = event.clientX - barRect.left;
			let totalWidth = barRect.width;
			let totalItems = arr.length - thresh;
			// Calculate the index based on the mouse position
			let index = Math.floor(mouseX / totalWidth * totalItems) + thresh;
			text.innerText = arr[index].key ?? "";
			bars.querySelectorAll("div").forEach((b) => {
				b.style.opacity = "0.4";
			});
			let pos = event.clientX - container.getBoundingClientRect().left;
			hoverBar.style.left = `${pos}px`;
			hoverBar.style.visibility = "visible";
		});
		bar.addEventListener("mouseleave", () => {
			text.innerText = "";
			bars.querySelectorAll("div").forEach((b) => {
				b.style.opacity = "1";
			});
			hoverBar.style.left = "0px";
			hoverBar.style.visibility = "hidden";
		});

		bars.appendChild(bar);
		container.appendChild(hoverBar);
	}

	if (uniqueItem) {
		let bar = createBar({
			title: "unique",
			fillColor: backgroundBarColor,
			textColor: "var(--mid-gray)",
			width: x(uniqueItem.total),
			height,
		});
		bar.addEventListener("mouseenter", () => {
			text.innerText = "unique";
			bars.querySelectorAll("div").forEach((b) => {
				b.style.opacity = b === bar ? "1" : "0.4";
			});
		});
		bar.addEventListener("mouseleave", () => {
			text.innerText = "";
			bars.querySelectorAll("div").forEach((b) => {
				b.style.opacity = "1";
			});
		});
		bars.appendChild(bar);
	}

	if (nullItem) {
		let bar = createBar({
			title: "null",
			fillColor: nullFillColor,
			textColor: "white",
			width: x(nullItem.total),
			height,
		});
		bar.addEventListener("mouseenter", () => {
			text.innerText = "null";
			bars.querySelectorAll("div").forEach((b) => {
				b.style.opacity = b === bar ? "1" : "0.4";
			});
		});
		bar.addEventListener("mouseleave", () => {
			text.innerText = "";
			bars.querySelectorAll("div").forEach((b) => {
				b.style.opacity = "1";
			});
		});
		bars.appendChild(bar);
	}

	let text = document.createElement("div");
	Object.assign(text.style, {
		pointerEvents: "none",
		height: "15px",
		maxWidth: "100%",
		overflow: "hidden",
		textOverflow: "ellipsis",
		position: "absolute",
		fontWeight: 400,
		color: "var(--mid-gray)",
	});

	container.appendChild(bars);
	container.appendChild(text);
	return container;
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
		background: fillColor,
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
