import * as d3 from "https://esm.sh/d3@7";
import createREGL from "https://esm.sh/regl@2";

// ── Categorical palette (Tableau-10 + a couple extras); index -1 → "other". ──
const PALETTE = [
  "#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f", "#edc948",
  "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac", "#86bcb6", "#d37295",
];
const OTHER_COLOR = "#c7c7c7";

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

function quoteIdent(name) {
  return `"${name.replace(/"/g, '""')}"`;
}

// A single drill-down box → SQL predicate. Coords come from scale.invert(...),
// so they're plain numbers — safe to inline. Idents are quoted defensively.
function boxPredicate([[x0, x1], [y0, y1]], xCol, yCol) {
  const x = quoteIdent(xCol), y = quoteIdent(yCol);
  return `(${x} BETWEEN ${Math.min(x0, x1)} AND ${Math.max(x0, x1)} AND ` +
    `${y} BETWEEN ${Math.min(y0, y1)} AND ${Math.max(y0, y1)})`;
}

// Map a linear d3 scale to clip-space coefficients: clip = m * data + c.
// `flip` handles the y axis (pixel-down vs clip-up).
function clipParams(scale, size, flip) {
  const [d0, d1] = scale.domain();
  const a = (scale(d1) - scale(d0)) / (d1 - d0);
  const b = scale(d0) - a * d0;
  return flip
    ? [-2 * a / size, 1 - 2 * b / size]
    : [2 * a / size, 2 * b / size - 1];
}

// ── NBA half-court markings in shot-chart coords (tenths of a foot, hoop at
//    the origin, y increasing away from the baseline). ──
function sampleArc(cx, cy, r, a0, a1, n = 64) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = a0 + (a1 - a0) * (i / n);
    pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
  return pts;
}

function drawCourt(g, xs, ys) {
  const line = d3.line().x((d) => xs(d[0])).y((d) => ys(d[1]));
  const stroke = "#5b5b5b";
  const add = (pts, { closed = false, dashed = false } = {}) =>
    g.append("path")
      .attr("d", line(closed ? [...pts, pts[0]] : pts))
      .attr("fill", "none")
      .attr("stroke", stroke)
      .attr("stroke-width", 1.4)
      .attr("stroke-dasharray", dashed ? "4 4" : null);

  // Court outline + baseline.
  add([[-250, -47.5], [250, -47.5], [250, 422.5], [-250, 422.5]], {
    closed: false,
  });
  add([[-250, 422.5], [250, 422.5]]); // half-court line
  // Paint (outer + inner box).
  add([[-80, -47.5], [-80, 142.5], [80, 142.5], [80, -47.5]]);
  add([[-60, -47.5], [-60, 142.5], [60, 142.5], [60, -47.5]]);
  // Free-throw circle: solid top, dashed bottom.
  add(sampleArc(0, 142.5, 60, 0, Math.PI));
  add(sampleArc(0, 142.5, 60, Math.PI, 2 * Math.PI), { dashed: true });
  // Restricted area.
  add(sampleArc(0, 0, 40, 0, Math.PI));
  // Backboard + hoop.
  add([[-30, -7.5], [30, -7.5]]);
  add(sampleArc(0, 0, 7.5, 0, 2 * Math.PI), { closed: true });
  // Three-point line: corners at x=±220 up to y≈89.5, then the arc.
  const cornerY = Math.sqrt(237.5 ** 2 - 220 ** 2);
  const a = Math.atan2(cornerY, 220);
  add([[-220, -47.5], [-220, cornerY]]);
  add([[220, -47.5], [220, cornerY]]);
  add(sampleArc(0, 0, 237.5, a, Math.PI - a));
  // Center circles.
  add(sampleArc(0, 422.5, 60, Math.PI, 2 * Math.PI));
  add(sampleArc(0, 422.5, 20, Math.PI, 2 * Math.PI));
}

export default {
  async render({ model, host, signal, el }) {
    const coord = await host.getWidget(model.get("coord"));
    const { msql, createClient, trait } = coord.exports;
    const { Query } = msql;
    const ctx = await createClient({ model, host, signal });

    const W = model.get("width");
    const H = model.get("height");
    const xCol = model.get("x");
    const yCol = model.get("y");
    const colorCol = model.get("color") || null;
    const tableName = model.get("table");
    const pointSize = model.get("point_size");
    const opacity = model.get("opacity");
    const pad = 12;
    const dpr = globalThis.devicePixelRatio || 1;

    // Drill-down stack: list of [[x0,x1],[y0,y1]] boxes. Compare by value so a
    // Python re-set of the same stack doesn't re-fire.
    const narrow = ctx.param(
      trait(model, "narrow"),
      (p, q) => JSON.stringify(p) === JSON.stringify(q),
    );

    el.style.cssText =
      `font: 12px ui-sans-serif, system-ui; position: relative; width: ${W}px;`;

    const stage = document.createElement("div");
    stage.style.cssText =
      `position: relative; width: ${W}px; height: ${H}px; background: #fafaf7;` +
      ` border: 1px solid #e5e5e0; border-radius: 6px; overflow: hidden;`;
    el.appendChild(stage);

    const canvas = document.createElement("canvas");
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.cssText =
      `position: absolute; top: 0; left: 0; width: ${W}px; height: ${H}px;`;
    stage.appendChild(canvas);

    const svg = d3.create("svg")
      .attr("width", W).attr("height", H)
      .style("position", "absolute").style("top", 0).style("left", 0);
    stage.appendChild(svg.node());

    const courtG = svg.append("g");
    const boxesG = svg.append("g");
    const brushG = svg.append("g");

    // Status + controls.
    const bar = document.createElement("div");
    bar.style.cssText =
      `display: flex; align-items: center; gap: 10px; padding: 6px 2px; color: #555;`;
    const status = document.createElement("span");
    const spacer = document.createElement("span");
    spacer.style.flex = "1";
    const hint = document.createElement("span");
    hint.textContent = "drag to drill-down · dbl-click to clear";
    hint.style.color = "#999";
    const clearBtn = document.createElement("button");
    clearBtn.textContent = "clear drill-down";
    clearBtn.style.cssText =
      `font: inherit; padding: 2px 8px; border: 1px solid #ccc;` +
      ` border-radius: 4px; background: #fff; cursor: pointer;`;
    bar.append(status, spacer, hint, clearBtn);
    el.appendChild(bar);

    const legend = document.createElement("div");
    legend.style.cssText =
      `display: flex; flex-wrap: wrap; gap: 4px 12px; padding: 0 2px 4px;`;
    el.appendChild(legend);

    // ── Fixed court domain (overridable). Fit into the canvas preserving the
    //    true court aspect ratio, so markings never distort. ──
    let xdomain = model.get("xdomain");
    let ydomain = model.get("ydomain");
    if (!xdomain || !ydomain) {
      const r = (await ctx.fetch(
        Query.from(tableName).select({
          xlo: msql.min(msql.column(xCol)),
          xhi: msql.max(msql.column(xCol)),
          ylo: msql.min(msql.column(yCol)),
          yhi: msql.max(msql.column(yCol)),
        }),
      )).toColumns();
      xdomain = xdomain || [Number(r.xlo[0]), Number(r.xhi[0])];
      ydomain = ydomain || [Number(r.ylo[0]), Number(r.yhi[0])];
    }
    const dataW = xdomain[1] - xdomain[0];
    const dataH = ydomain[1] - ydomain[0];
    const s = Math.min((W - 2 * pad) / dataW, (H - 2 * pad) / dataH);
    const drawW = dataW * s, drawH = dataH * s;
    const ox = (W - drawW) / 2, oy = (H - drawH) / 2;
    const xScale = d3.scaleLinear().domain(xdomain).range([ox, ox + drawW]);
    const yScale = d3.scaleLinear().domain(ydomain).range([oy + drawH, oy]);

    drawCourt(courtG, xScale, yScale);

    // ── Category encoding: fetch distinct values, build a CASE-free index via
    //    list_position, and a matching legend/palette. ──
    let cats = [];
    let catExpr = "0";
    if (colorCol) {
      const col = (await ctx.fetch(
        Query.from(tableName)
          .select({ v: msql.column(colorCol) })
          .distinct()
          .orderby(msql.column(colorCol)),
      )).toColumns().v;
      cats = Array.from(col, (v) => v).filter((v) => v != null).slice(0, 12);
      const list = cats
        .map((v) => `'${String(v).replace(/'/g, "''")}'`)
        .join(", ");
      // list_position is 1-based; 0 (not found / null) → -1 → "other".
      catExpr = `(list_position([${list}], ${quoteIdent(colorCol)}) - 1)`;
    }
    const rgbFor = (i) =>
      i < 0 || i >= cats.length ? hexToRgb(OTHER_COLOR) : hexToRgb(PALETTE[i % PALETTE.length]);

    // Legend swatches.
    for (let i = 0; i < cats.length; i++) {
      const item = document.createElement("span");
      item.style.cssText = "display: flex; align-items: center; gap: 5px;";
      const sw = document.createElement("span");
      sw.style.cssText =
        `width: 10px; height: 10px; border-radius: 2px; display: inline-block;` +
        ` background: ${PALETTE[i % PALETTE.length]};`;
      const label = document.createElement("span");
      label.textContent = String(cats[i]);
      item.append(sw, label);
      legend.appendChild(item);
    }

    // ── regl point renderer. Position is in DATA coords; the vertex shader maps
    //    it to clip space with the same linear transform as the d3 scales, so
    //    points, court, and brush all share one coordinate system. ──
    const regl = createREGL({
      canvas,
      attributes: { antialias: true, premultipliedAlpha: false },
    });
    const [mx, cx] = clipParams(xScale, W, false);
    const [my, cy] = clipParams(yScale, H, true);
    const posBuffer = regl.buffer(1);
    const colorBuffer = regl.buffer(1);
    let count = 0;

    const draw = regl({
      vert: `
        precision highp float;
        attribute vec2 position;
        attribute vec3 color;
        uniform vec2 mX, mY;
        uniform float pointSize;
        varying vec3 vColor;
        void main() {
          gl_Position = vec4(mX.x * position.x + mX.y,
                             mY.x * position.y + mY.y, 0.0, 1.0);
          gl_PointSize = pointSize;
          vColor = color;
        }`,
      frag: `
        precision highp float;
        varying vec3 vColor;
        uniform float alpha;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = dot(d, d);
          if (r > 0.25) discard;
          float a = smoothstep(0.25, 0.18, r);
          gl_FragColor = vec4(vColor, alpha * a);
        }`,
      attributes: { position: posBuffer, color: colorBuffer },
      uniforms: {
        mX: [mx, cx],
        mY: [my, cy],
        pointSize: pointSize * dpr,
        alpha: opacity,
      },
      count: () => count,
      primitive: "points",
      depth: { enable: false },
      blend: {
        enable: true,
        func: {
          srcRGB: "src alpha",
          srcAlpha: 1,
          dstRGB: "one minus src alpha",
          dstAlpha: 1,
        },
      },
    });

    function paint() {
      regl.clear({ color: [0, 0, 0, 0], depth: 1 });
      if (count > 0) draw();
    }

    // ── Live, filter-driven query. filterBy carries the SHARED selection
    //    (e.g. the quak DataTable); the drill-down boxes are ANDed on top,
    //    locally, so they never propagate back upstream. ──
    const pts = ctx.query(
      (filter) => {
        const boxes = narrow.value || [];
        const preds = boxes.map((b) => boxPredicate(b, xCol, yCol));
        const q = Query.from(tableName)
          .select({
            x: msql.column(xCol),
            y: msql.column(yCol),
            c: msql.sql`${catExpr}`,
          })
          .where(filter);
        for (const p of preds) q.where(msql.sql`${p}`);
        return q;
      },
      { filterBy: ctx.filterBy, params: [narrow] },
    );

    pts.addEventListener("value", (result) => {
      if (result.isError) {
        status.textContent = `error: ${result.error.message}`;
        console.error(result.error);
        return;
      }
      if (!result.isSuccess) return;
      const cols = result.data.toColumns();
      const xs = cols.x, ys = cols.y, cs = cols.c;
      count = xs.length;
      const pos = new Float32Array(count * 2);
      const rgb = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        pos[2 * i] = Number(xs[i]);
        pos[2 * i + 1] = Number(ys[i]);
        const [r, g, b] = rgbFor(cs ? Number(cs[i]) : 0);
        rgb[3 * i] = r;
        rgb[3 * i + 1] = g;
        rgb[3 * i + 2] = b;
      }
      posBuffer({ data: pos });
      colorBuffer({ data: rgb });
      const depth = (narrow.value || []).length;
      status.textContent =
        `${count.toLocaleString()} points` +
        (depth ? ` · ${depth} drill-down${depth > 1 ? "s" : ""}` : "");
      paint();
    }, { signal });

    // ── Drill-down UI: each completed brush ADDS a box to the narrow stack
    //    (intersection = narrowing in), then resets so the next drag stacks. ──
    function renderBoxes() {
      const boxes = narrow.value || [];
      const sel = boxesG.selectAll("rect").data(boxes);
      sel.enter().append("rect")
        .merge(sel)
        .attr("x", (b) => xScale(Math.min(b[0][0], b[0][1])))
        .attr("y", (b) => yScale(Math.max(b[1][0], b[1][1])))
        .attr("width", (b) => Math.abs(xScale(b[0][1]) - xScale(b[0][0])))
        .attr("height", (b) => Math.abs(yScale(b[1][1]) - yScale(b[1][0])))
        .attr("fill", "rgba(70,130,180,0.08)")
        .attr("stroke", "#4e79a7")
        .attr("stroke-width", 1.25)
        .attr("stroke-dasharray", "3 3")
        .attr("pointer-events", "none");
      sel.exit().remove();
    }
    narrow.addEventListener("value", renderBoxes, { signal });
    renderBoxes();

    function setNarrow(next) {
      model.set("narrow", next);
      model.save_changes();
    }

    const brush = d3.brush()
      .extent([[ox, oy], [ox + drawW, oy + drawH]])
      .on("end", (event) => {
        if (!event.sourceEvent || !event.selection) return;
        const [[px0, py0], [px1, py1]] = event.selection;
        const box = [
          [xScale.invert(px0), xScale.invert(px1)],
          [yScale.invert(py1), yScale.invert(py0)], // y inverted in screen space
        ];
        setNarrow([...(narrow.value || []), box]);
        brushG.call(brush.move, null); // reset so the next drag stacks
      });
    brushG.call(brush);
    brushG.on("dblclick", () => setNarrow([]));
    clearBtn.addEventListener("click", () => setNarrow([]), { signal });
  },
};
