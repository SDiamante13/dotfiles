---
name: dex-gates-playground
description: Builds an interactive single-file HTML design playground that walks an engineering change through Dex Horthy's four gates (Product, Architecture, Program Design, Vertical Slices), with a live SVG call-flow diagram, per-gate decision controls, and a copy-out prompt carrying the decisions back into chat. Use when the user names the method ("Dex Horthy", "4 gates", "program design gate", "vertical slices"), or when a change has several structurally different implementations to compare — "where should the seam go", "what are the change points", "which layer should this branch at". Best when the tradeoff is spatial (call flow, layering, where a branch lands). NOT for prose planning or scoping ("plan this ticket", "help me scope this"), AC-writing, story splitting, or interviews — use plan, story-planner, split, write-ac, interview; for a generic explorer use playground. Never fire when the user wants a conversation: it builds a large HTML artifact, wasted on a single-shape change.
---

# Dex Gates Playground

Turn a ticket into a design tool the engineer can steer, instead of a wall of prose they have to argue with.

## Why the gates exist

Worth internalizing, because it changes how hard you push on the early gates.

Models are trained with reinforcement learning against oracles that return fast. "Do the tests pass" answers in seconds. "Did this change make the codebase harder to modify six months from now" answers in months, so nothing in training penalizes architectural decay. The result is a model that solves the isolated problem well and erodes the system slowly, and the erosion is invisible at review time because each individual diff looks fine.

The fix isn't more tokens on the prompt — that raises the floor, not the ceiling. The fix is moving human judgment earlier, to the point where changing direction is still cheap. Once thousands of lines exist, redirecting is expensive and everyone rationalizes instead. Thirty minutes of alignment up front turns a pull request from a discovery process into a confirmation of something already agreed.

The number Horthy attaches to this is **2–3× faster, safely** — against the 10–100× that fully automated pipelines promise and don't deliver. Treat that as his claim, not a measured result you can promise someone.

So the playground is not decoration. It is the artifact that makes the expensive thinking happen while it's still cheap, and it makes disagreement visible early, when it costs a click instead of a rewrite.

## When to skip the build

The playground earns its cost when a change has **several structurally different implementations** and choosing between them is genuinely hard. That is not most tickets.

Skip it and just talk when: the change has one obvious shape; it's a bug fix with a known root cause; the ticket is small enough that the diff is easier to read than a diagram; or the user asked a question and wants an answer, not a tool. In those cases run the gates conversationally — the thinking still matters, the artifact doesn't.

Say which you're doing and why, in one line, before you start building. Nothing sours a person on a process faster than watching an agent spend five minutes generating a 400-line file when they wanted two paragraphs.

## The four gates

Each gate has a job, and the job of each is to be *rejectable*. A gate nobody could disagree with isn't doing work.

**Gate 1 — Product.** The user's problem and what success looks like, in end-user language. No schemas, endpoints, class names, or file paths. If a sentence could only be understood by someone who has read the code, it belongs in a later gate. This gate is where you discover the story shouldn't be built at all — which is a win, not a failure.

Two artifacts from the source method are worth producing here when the change is user-visible: a short **announcement** — the blog post or release note you'd write when it ships, 3–6 sentences — and **plain-HTML mockups** of any screen involved. Both force the problem into the user's vocabulary, and both are cheap to reject. If you can't write the announcement, you don't yet understand what you're building.

**Gate 2 — Architecture.** How the change meets the systems that already exist: which services and modules are touched, what the call flow is end to end, what data moves, what config or flags gate it. Read the actual code before writing this. Guessing here is what produces plans that dissolve on contact.

**Gate 3 — Program Design.** The step people skip. Types, method signatures, where the seam goes, which file gets touched and why, what the test names are before the tests exist. Bodies omitted — shape only. Also: an explicit list of the decisions you are least confident about, so the human knows where to push.

**Gate 4 — Vertical Slices.** Thin end-to-end paths, each one demonstrable on its own. The first slice is a tracer bullet — wired end to end and doing nothing real, typically a mocked endpoint against a stubbed UI. Then the happy path. Then one capability per slice. Never horizontal (all the DB, then all the API, then all the UI) — horizontal layers can't be demonstrated, so they can't be corrected.

Within a slice, the source method has an integration order that's worth keeping: **API contract first, backed by mocks**, then the frontend against those mocks, then the real services, then any database migration. It front-loads the contract — the thing most expensive to change once both sides are built — and it lets the two halves proceed without blocking each other. When a slice spans repositories, say explicitly which repo moves first and what the other one codes against in the meantime.

## How to build one

### 1. Research first — the playground is worthless if the facts are wrong

Read the ticket. Read its parent epic and linked issues. Then read the actual code paths it names, and check the claims in the ticket against them. Tickets carry stale assertions, and a playground that renders a stale assertion in a nice diagram just makes the wrong thing more persuasive.

Things worth checking that people routinely get wrong:

- **Does the thing the ticket describes still work that way?** Audit docs and ticket descriptions drift from code.
- **Is the code path actually reachable?** Check traffic, callers, and whether the endpoint or branch is live. Work on dead code is the most expensive kind, because it looks productive.
- **Does the counterpart the plan assumes exist actually exist?** A "route it to the new service" plan dies if the new service has no such endpoint.

When you find that the premise is wrong, say so plainly and early. That finding is worth more than the playground.

### 2. Find the real decisions

A good playground presents choices where a competent engineer could reasonably pick either. Filter out anything that is really just one option with three wrong ones next to it — those waste the reader's attention and make the tool feel like a quiz.

The decisions that earn a control are usually:

- **Where the seam goes** — which layer takes the new branch, and what that costs
- **What gates it** — new flag vs reuse, and what independent rollback is worth
- **Scope boundaries** — what is deliberately left for another story
- **The thing the ticket got wrong or didn't consider** — transaction semantics, error propagation, a shared code path with wider blast radius

Mark options honestly with a tag: `recommended`, `risk`, or `story says` when the ticket prescribes something you think is wrong. Showing the ticket's own choice next to a better one, with the tradeoff stated, is more useful than silently overriding it.

### 3. Build the file

One self-contained HTML file. No CDNs, no build step, no external fonts. Write it, then `open` it.

Structure: header with a theme toggle, gate tabs, a left control column, a live preview on the right, and a prompt output pinned at the bottom with a copy button.

**Light mode is the default.** Define the full light palette on `:root`, then override only the changed tokens under `:root[data-theme="dark"]`. Never give a color its only definition inside the dark block. Persist the choice in `localStorage` and default to `light` when nothing is stored.

```css
:root{ --bg:#f6f7f9; --panel:#fff; --ink:#16202b; --dim:#5b6673; --accent:#1c6fd4; /* … */ }
:root[data-theme="dark"]{ --bg:#0e1116; --panel:#151a21; --ink:#e6edf3; --dim:#93a0b0; --accent:#4ea1ff; }
```

The whole UI, **including every SVG fill and stroke**, reads from those variables — `fill="var(--node-fill)"` resolves inside inline SVG, so one toggle restyles the diagram for free. A diagram with hardcoded hexes is the usual reason a light mode looks broken.

Keep one state object; every control writes to it and every render reads from it. One `renderAll()` after any change. No apply button — the point is that the diagram moves while you're deciding.

`assets/playground-template.html` is a complete working scaffold with all of this wired. Start from it rather than from scratch.

### 4. Draw a diagram, not a pile of boxes

This is where these tools usually fall down. Identical rounded rectangles connected by curved arrows carry almost no information — the reader has to decode every label because the picture itself says nothing.

**Rebuild the node set for this ticket — do not relabel the template's.** The scaffold ships one topology (a flag-gated branch from an existing path to a new one, landing in two stores) because it needed *a* worked example. That shape fits strangler migrations and little else. A pure refactor has no old/new branch. A read-path change has no write at all. An event-driven change is a producer, a queue, and consumers, and its interesting property is ordering. Greenfield has nothing to branch *from*.

Ask what the actual decision is, then draw the smallest topology that makes it visible:

| Change shape | What the diagram must show |
|---|---|
| Strangler / migration | The branch point and both destinations |
| Refactor, no behaviour change | Current call graph vs proposed, side by side |
| New capability | The path through existing layers and where it attaches |
| Read path | Source of truth vs cache/mirror, and staleness |
| Event-driven | Producer, transport, consumers, and ordering guarantees |
| Performance | The hot path with the cost at each hop |

If you find yourself forcing a ticket into the flag-routing scaffold, that is the signal to throw the scaffold's nodes away and keep only its helpers.

Read `references/diagramming.md` before writing the SVG. The short version:

- **Shape carries meaning.** Rounded rect = service or code unit. Cylinder = datastore. Hexagon = a decision or gate. The reader should be able to find the routing decision without reading a word.
- **Lanes give the flow a spine.** Group nodes into labeled horizontal bands (entry, routing, write path, stores). It turns a scatter into a sequence.
- **Orthogonal edges with rounded corners**, not freehand béziers. Straight runs read as structure; a bundle of curves reads as noise.
- **Labels get a pill background** in the panel color so they never collide with the line they sit on.
- **The decision under discussion is the focal point** — a dashed accent outline that *moves* as the user changes the seam control. That motion is the whole reason this is interactive instead of a PNG.

### 5. Write a prompt worth pasting

The output at the bottom is the actual deliverable — it's how the thinking gets back into the conversation. Make it a decision record, not a settings dump.

- Organize under the four gate headings.
- State each decision **and its consequence**, in the voice of something already agreed: "resolve the creator once per request — one flag read, no duplicated loop, per-item error handling untouched."
- Carry the evidence that constrains the design (traffic numbers, flag state, existing counterparts), because whoever reads it next won't have the research context.
- When the user picks a risky option, say so in the prompt and name what it breaks. The prompt should be honest about the choice, not just obedient to it.
- Include any comments the user attached to diagram nodes.

### 6. Interview alongside it

The playground doesn't replace the conversation — it gives it something to point at. Walk the gates in order, ask about the decisions the playground can't settle, and don't advance a gate until the current one is actually agreed.

Ask about what you genuinely can't determine from the code: who the users are, why it's prioritized now, what "done" means, whether an interface is externally committed. Don't ask what you could have looked up — that's how you burn the person's patience before reaching the questions that matter.

Batch questions rather than dripping them one at a time, and when an answer makes the rest of the plan moot, stop and say that instead of continuing down the list.

## Where to put it

Ask, or default to a working-docs directory outside the repo (planning artifacts usually shouldn't be committed). Name it after the ticket: `<TICKET>/playground.html`.

## Reference files

- `assets/playground-template.html` — complete working scaffold: light/dark tokens with toggle, gate tabs, state object, diagram primitives, prompt builder. Copy and fill in.
- `references/diagramming.md` — the SVG shape vocabulary, lane layout, orthogonal edge routing, and label-pill helpers, with the reasoning behind each.
