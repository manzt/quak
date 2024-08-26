export default `\
:host {
	all: initial;
	--sans-serif: -apple-system, BlinkMacSystemFont, "avenir next", avenir,
		helvetica, "helvetica neue", ubuntu, roboto, noto, "segoe ui", arial,
		sans-serif;
	--light-silver: #efefef;
	--spacing-none: 0;
	--white: #fff;
	--gray: #929292;
	--dark-gray: #333;
	--moon-gray: #c4c4c4;
	--mid-gray: #6e6e6e;

	--stone-blue: #64748b;
	--yellow-gold: #ca8a04;

	--teal: #027982;
	--dark-pink: #d35a5f;

	--light-blue: #7e93cf;
	--dark-yellow-gold: #a98447;

	--purple: #987fd3;

	--primary: var(--stone-blue);
	--secondary: var(--yellow-gold);
}

.highlight {
	background-color: var(--light-silver);
}

.highlight-cell {
	border: 1px solid var(--moon-gray);
}

.quak {
	border: 1px solid var(--light-silver);
	background-color: var(--white);
	border-radius: 0.2rem;
}

.table-container {
	overflow-y: auto;
}

table {
	border-collapse: separate;
	border-spacing: 0;
	white-space: nowrap;
	box-sizing: border-box;

	margin: var(--spacing-none);
	color: var(--dark-gray);
	font: 13px / 1.2 var(--sans-serif);

	width: 100%;
}

thead {
	position: sticky;
	vertical-align: top;
	text-align: left;
	top: 0;
}

td {
	border: 1px solid var(--light-silver);
	border-bottom: solid 1px transparent;
	border-right: solid 1px transparent;
	overflow: hidden;
	-o-text-overflow: ellipsis;
	text-overflow: ellipsis;
	padding: 4px 6px;
}

tr:first-child td {
	border-top: solid 1px transparent;
}

th {
	display: table-cell;
	vertical-align: inherit;
	font-weight: bold;
	text-align: -internal-center;
	unicode-bidi: isolate;

	position: relative;
	background: var(--white);
	border-bottom: solid 1px var(--light-silver);
	border-left: solid 1px var(--light-silver);
	padding: 5px 6px;
	user-select: none;
}

.number,
.date {
	font-variant-numeric: tabular-nums;
}

.gray {
	color: var(--gray);
}

.number {
	text-align: right;
}

td:nth-child(1),
th:nth-child(1) {
	font-variant-numeric: tabular-nums;
	text-align: center;
	color: var(--moon-gray);
	padding: 0 4px;
}

td:first-child,
th:first-child {
	border-left: none;
}

th:first-child {
	border-left: none;
	vertical-align: top;
	width: 20px;
	padding: 7px;
}

td:nth-last-child(2),
th:nth-last-child(2) {
	border-right: 1px solid var(--light-silver);
}

tr:first-child td {
	border-top: solid 1px transparent;
}

.resize-handle {
	width: 5px;
	height: 100%;
	background-color: transparent;
	position: absolute;
	right: -2.5px;
	top: 0;
	cursor: ew-resize;
	z-index: 1;
}

.quak .sort-button {
	cursor: pointer;
	background-color: var(--white);
	user-select: none;
}

.status-bar {
	display: flex;
	justify-content: flex-end;
	font-family: var(--sans-serif);
	margin-right: 10px;
	margin-top: 5px;
	margin-bottom: 5px;
}

.status-bar button {
	border: none;
	background-color: var(--white);
	color: var(--primary);
	font-weight: 600;
	font-size: 0.875rem;
	cursor: pointer;
	margin-right: 5px;
}

.status-bar span {
	color: var(--gray);
	font-weight: 400;
	font-size: 0.75rem;
	font-variant-numeric: tabular-nums;
}
`;
