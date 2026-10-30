# lavalamp.app

A 2D particle lava lamp, on its way to 3D. Robert Kempton is the engineer and makes every
call about how it looks and moves. Claude supplies mechanism, measurement and typing.

## Vibes only

No tests, no package.json, no build step. The lamp is judged by feel, not correctness. Preserve
the tuned behaviour; when a change could alter how it looks, say so before or as you make it, and
offer a before and after screenshot.

## This project is talk material

The making of the 3D lamp is the subject of a meetup talk about directing AI as the engineer
(docs/talk-v1.md is the first talk; the sequel is being recorded now). Recording is not optional
and a Stop hook (scripts/talk-check.sh) will nag when it is skipped. Capture:

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

Do not push to origin unless asked. Committing checkpoints locally is expected.

## Layout

src/sim is the simulation with no DOM, src/render the metaball pass, src/ui settings and
panel, src/app.js the wiring. Serve index.html from any static server.
