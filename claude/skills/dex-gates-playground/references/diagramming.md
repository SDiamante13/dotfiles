# Drawing the architecture diagram

The default failure mode is a grid of identical rounded rectangles joined by curved arrows. It looks like a diagram and carries almost none of the information one, because every distinction lives in text the reader has to decode node by node.

A diagram earns its space when the *picture* answers a question before any label is read. For a design playground the question is almost always: **where does the new behaviour branch off, and what is downstream of that branch?**

## Shape vocabulary

Give different kinds of things different silhouettes. This is the single highest-leverage change.

| Shape | Means | Notes |
|---|---|---|
| Rounded rect with a colored left bar | A service, class, or code unit | The bar color encodes which side it belongs to (legacy vs new) |
| Cylinder | A datastore | Ellipse cap + body; reads as "database" instantly |
| Hexagon | A decision, gate, or router | Visually interrupts the flow, which is what a branch does |
| Rect with a doubled border | An external system you don't own | Signals "network call, can fail" |

Once shapes differ, a reader scanning the picture finds the gate immediately. That's the whole point.

## Lanes

Group nodes into labeled horizontal bands — `entry`, `routing decision`, `write path`, `cascade`, `stores`. Draw each as a soft filled rect behind the nodes with a small uppercase monospace label in the top-left corner.

Lanes do two things: they turn a scatter of boxes into a sequence with a direction, and they make an empty region meaningful ("nothing happens in the cascade lane on the legacy branch").

```js
function lane(x,y,w,h,label){
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="var(--lane-fill)"/>
    <text x="${x+12}" y="${y+16}" fill="var(--lane-ink)" font-size="9.5" font-weight="700"
      letter-spacing="1.2" font-family="ui-monospace,monospace">${label.toUpperCase()}</text>`;
}
```

Draw lanes first, then edges, then nodes — so nodes sit on top of the lines that enter them.

## Edges: orthogonal, rounded, labeled

Freehand béziers cross each other at arbitrary angles and produce visual noise. Orthogonal routing with small rounded corners reads as deliberate structure — it's the convention every circuit and network diagram uses, and readers already parse it.

Two helpers cover nearly everything: down-flow (node above to node below) and across-flow (same band).

```js
function edgeDown(A,B,{color,dash,label}){
  const x1=A.x+A.w/2, y1=A.y+A.h, x2=B.x+B.w/2, y2=B.y, my=(y1+y2)/2, r=9;
  let d;
  if(Math.abs(x1-x2)<3){ d=`M${x1},${y1} L${x2},${y2}`; }
  else{
    const s = x2>x1 ? 1 : -1;   // turn direction
    d=`M${x1},${y1} L${x1},${my-r} Q${x1},${my} ${x1+r*s},${my} `
     +`L${x2-r*s},${my} Q${x2},${my} ${x2},${my+r} L${x2},${y2}`;
  }
  return path(d,color,dash,label,(x1+x2)/2,my);
}
```

The `Q` control point sits exactly on the corner vertex, which is what makes the fillet look machined rather than sketched.

### Route around obstacles, and check that you did

The default midpoint (`my = (y1+y2)/2`) puts the horizontal run halfway between the two nodes — which is fine until some *third* node occupies that corridor. Nodes are drawn after edges, so the edge silently disappears behind an unrelated box. It looks like a missing connection rather than a layout bug, which is why it survives review.

Take a `midY` override on the edge helper and use it whenever a long horizontal run crosses another lane:

```js
edgeDown(A,B,{midY:310})   // below the obstacle, not halfway
```

Then verify rather than eyeball it. For each edge, compute its horizontal segment and test it against every node's bounds:

```js
function occludes(seg, n){                       // seg = {y, x1, x2}
  const yHit = n.y <= seg.y && seg.y <= n.y+n.h;
  const xHit = !(Math.max(seg.x1,seg.x2) < n.x || Math.min(seg.x1,seg.x2) > n.x+n.w);
  return yHit && xHit;
}
```

Run it over the node list once while building the diagram and fix whatever it flags. Thirty seconds of arithmetic beats a reader wondering why the legacy branch appears to connect to nothing.

`edgeAcross` has a related sharp edge: it assumes flow moves forward. When `B` sits to the *left* of `A`, the final corner backtracks and the arrowhead points the wrong way. Either keep across-edges left-to-right, or route backward connections with `edgeDown` through a lane below.

Give each edge color its own arrowhead marker — a marker's `fill` is fixed at definition time, so one shared marker means every arrow ends in the same color regardless of its line.

```js
`<marker id="ar-${id}" markerWidth="7" markerHeight="6" refX="6.5" refY="3" orient="auto">
   <polygon points="0 0, 7 3, 0 6" fill="${color}"/></marker>`
```

## Label pills

Text dropped directly on a line is unreadable wherever they overlap. Put every edge label in a rounded rect filled with the panel background and stroked in the edge color.

```js
function pill(cx,cy,text,color){
  const w = text.length*6.2 + 12;
  return `<rect x="${cx-w/2}" y="${cy-9}" width="${w}" height="18" rx="9"
      fill="var(--panel)" stroke="${color}" stroke-width="1"/>
    <text x="${cx}" y="${cy+4}" text-anchor="middle" fill="${color}"
      font-size="10" font-family="ui-monospace,monospace">${text}</text>`;
}
```

The pill doubles as a legend: color-matched to its edge, it tells you what kind of flow you're looking at without consulting the key.

## Make the seam move

The reason this is interactive rather than a screenshot is that the design decision is *visible as motion*. When the user changes where the seam goes, the dashed accent outline should jump to a different node.

```js
// keys here MUST match your OPTIONS.seam values exactly — a stale key
// from another ticket yields undefined and the highlight silently vanishes
const seamNode = {controller:'ctl', service:'svc', 'per-item':'loop'}[state.seam];
// then, when rendering that node:
`<rect x="${n.x-6}" y="${n.y-6}" width="${n.w+12}" height="${n.h+12}" rx="12"
   fill="none" stroke="var(--violet)" stroke-width="1.4" stroke-dasharray="5,4"/>`
```

Do the same for state that changes an edge's meaning — e.g. a cascade edge that is green and labeled `locations ok` under one choice and red and labeled `locations lost` under another. One glance shows the consequence of the toggle, which is the argument the prose is trying to make anyway.

## Theming

Every `fill` and `stroke` reads a CSS variable, never a literal hex:

```js
fill="var(--node-fill)" stroke="var(--accent)"
```

Inline SVG resolves custom properties from the document, so the theme toggle restyles the diagram with no redraw and no JS. Hardcoded hexes are the usual reason a dark-mode diagram turns into black text on a black card.

Lane fills need their own token (`--lane-fill`) rather than reusing the panel color — in light mode the lane must be *darker* than the page and in dark mode *lighter*, so it can't be derived from one value.

## Sizing and typography

- Node title 11.5px semibold; subtitle 9.5px monospace in `--dim`. The subtitle is where the file path or line number goes.
- Truncate long labels with an ellipsis at a fixed character count rather than letting text escape its box.
- Give the SVG a fixed `viewBox` and let its wrapper scroll horizontally. Scaling a diagram down to fit makes the type unreadable, which is worse than a scrollbar.
- Leave ~10px between a node and its lane edge. Cramped nodes read as a wireframe rather than a finished drawing.

## Clickable nodes

Attach `data-node` and `data-label` to each node group and let a click open a comment prompt. Mark commented nodes with a dot and a colored border, and feed the comments into the copy-out prompt. It turns the diagram from a picture into an input.

```js
`<g data-node="${n.id}" data-label="${n.label}" style="cursor:pointer"> … </g>`
```

## What to leave out

Resist drawing the whole system. A diagram that shows every service is a map; this needs to be a *route*. Include the path the change travels, the branch point, and the stores at the end. Everything else is context the reader already has.

If a node doesn't participate in the decision being made, it's costing attention without paying for it.
