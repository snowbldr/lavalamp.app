# lavalamp.app

A 2D particle lava lamp, on its way to 3D. Robert Kempton is the engineer and makes every
call about how it looks and moves. Claude supplies mechanism, measurement and typing.

## Vibes only

No tests, no build step, and no package.json for the lamp (the local server has its own, scripts/server, for spliffy). JavaScript only: no Python or shell scripts in the project (Robert: "this is a js project, we will use spliffy for the backend"). The lamp is judged by feel, not correctness. Preserve
the tuned behaviour; when a change could alter how it looks, say so before or as you make it, and
offer a before and after screenshot.

## This project is talk material

The making of the 3D lamp is the subject of a meetup talk about directing AI as the engineer
(docs/talk-v1.md is the first talk; the sequel is being recorded now). Recording is not optional
and a Stop hook (scripts/talk-check.mjs) will nag when it is skipped. Capture:

1. Decisions, in docs/decisions.md, as they happen, newest at the bottom. For each: what was
   seen, what was proposed (including what Claude proposed), what Robert decided, why, and what
   it looked like. Quote Robert's own words when he makes a call; the talk is about judgment and
   his phrasing is the evidence. Record rejected ideas and measured numbers, not just winners.
2. Checkpoints, as annotated git tags named checkpoint-NN-slug, at every point where the lamp
   visibly changes how it looks or moves. Commit messages explain why and what was tried first.
3. Screenshots, in docs/checkpoints/ named NN-slug.jpg or .png, before and after each visual
   change. Chrome screenshots from the local server are fine.
4. Measurements, when something is argued from numbers (lane persistence, wall mass, frame
   time), copied into the log entry so the talk can show them.

docs/ is its own git repository, private, at github.com/snowbldr/lavalamp-docs, and is ignored by
this one: raw records do not belong on a public system. Commit in docs/ and push it every time
the log, a screenshot or the talk changes (Robert: "push to lavalamp-docs any time the context is
updated"). The lamp repository itself is public: commit checkpoints locally, never push it unless
asked. A full backup of the repository from before docs was split out is at
~/lavalamp.app-backup-2026-10-30 (and the ref backup/master-with-docs); keep both until Robert
says go.

## When the lamp looks wrong

Measure before guessing. docs/methods/measured-hunt.md is the method that found the honeycomb
(a deterministic link at Pace 3, an in-page detector that draws what the renderer draws, windows
in sim steps, causes ruled out by the number, the fix A/B'd live); the scripts are in
docs/methods/tools.

## Layout

src/sim is the simulation with no DOM, src/render the metaball pass, src/ui settings and
panel, src/app.js the wiring. Serve it with node scripts/server/serve.mjs (--https for phones on the LAN).
Private checkouts inside this folder are kept out of git by .git/info/exclude (never .gitignore,
which is public), and the server will not serve them.
