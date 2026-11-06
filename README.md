## Lavalamp.app

Because lavalamps are cool.

A particle fluid simulation dressed up as a lava lamp. No build step, no dependencies to install:
open `index.html` from any static server and it runs. The local one, with caching off:

    cd scripts/server && npm install && cd ../..
    node scripts/server/serve.mjs            # http://localhost:8765
    node scripts/server/serve.mjs --https    # the LAN over https, for phones, port 8443

### How it works

The fluid is double density relaxation from Clavet, Beaudoin and Poulin, "Particle-based Viscoelastic
Fluid Simulation" (SCA 2005), as translated to JavaScript by Peeke Kuepers
(peeke.nl/simulating-blobs-of-fluid). Only the relaxation step is used, and velocity is rebuilt from
scratch every frame instead of carried over, which makes the fluid as viscous as wax.

The lava lamp part is a temperature per particle: it rises on contact with the floor, falls at a
constant rate everywhere, and a particle rises exactly as fast as it is hot. Blobs form, stick together
and rise as a unit because of the surface tension that falls out of the relaxation step.

Velocity is rebuilt every frame, so the lava has no inertia; the Wobble knob in Physics gives it
some, easing each particle toward its drift over that many seconds and letting the pull of surface
tension on a stretched neck or a blob's skin carry on as motion, so necks snap back and freed blobs
ring. 0, the default, is the thick wax.

Left alone, that model has nothing sideways in it, so blobs rise and fall in the same lane forever.
A slow convection roll (up the middle, down the walls, in along the floor) stirs the lava the way the
circulation in a real lamp does, and now and then a slow eddy appears somewhere for a few seconds and
stirs that spot (Turbulence), while a couple of others drift about, bounce off the walls and die away
(Drifting Eddies). Heat also conducts between touching particles, which is what lets a blob
warm up and lift as one piece instead of shedding droplets; the Conduction slider sets how much, and
high conduction is where the lava gets gloopy. On load the lava appears warm and settled on the floor and the heat spreads from
the centre of the base outward, so the first thing to lift is one big glob from the middle. Once warm,
the heater is a set of small football shaped elements, three times wider than tall, laid at random along
the floor once, each its own size; every so often one lights at its own heat for a few seconds and warms the lava in a half
disc around it, the way a finger on Heat does, so a lump of the pool warms at once and lifts as one
(Heat Spots is the seconds between lightings, 0 for a steady floor heater). Pace runs the whole lamp in slow motion, and two buttons in the menu are ways of looking: Flow Field draws the stirring as arrows, like
wind on a weather map, and Heat Map colours the lava by temperature like a weather map, with a
a Heater switch shows the heater strip and its elements along the floor in either view.

The ceiling is a row of bottles hanging above the screen, like the cap on a real lamp: each is a mouth
in the top edge, a neck of its own random length, and a bulb above, so a glob that reaches the top
rises through the mouth, gathers in the bulb while it is hot, cools as a glob and falls back out whole
instead of spreading into a sheet and falling as a strip (Bottles, in Physics, scales them; 0 is a flat
ceiling). The floor has pots: open bulbs hanging below the screen with no necks, holding a cool reserve
of lava under the visible pool (the glass base keeps it from cooling fast), each one a heating element
whose core runs from its mouth down into its bulb. Bottles above, pots below, reservoirs together. They
are laid out from the seed in sizes from a wide bell curve, a few small and the odd giant, with gaps
that are mostly slivers and now and then wide, their mouths kept apart while their bulbs may overlap,
as if they stood at different depths. Bulbs come in shapes drawn from the seed, round, star, cloud,
ooze or splat, stretched into ellipses at random angles, shaped only on the side away from the mouth
so nothing can trap lava; necks meet their bulbs on tangent fillets; lava never passes from one
reservoir to another, and heat conducts between neighbours at a third of the usual rate, as through
glass. The Count knob is the visible lava; the pots fill themselves on top of it.
The Reservoirs switch in the menu
pulls the whole lamp into frame, bottles and pots and all, with their outlines and the screen edge
drawn over it; with Heater on as well, the pots light up in their heater's colour.

Rendering is the metaball trick, on the GPU: soft discs composited into a texture, then one WebGL pass
thresholds the alpha so nearby discs fuse and lights the underside of each blob. The same picture
drawn with the 2D canvas (soft discs, getImageData, a threshold pass and a highlight pass in
JavaScript) is kept as the fallback where WebGL is missing, and `?canvas` in the URL forces it.
`?profile` prints frame, simulation and drawing times to the console every two seconds.

### Touch and tilt

A finger or the mouse acts on the lava in a soft circle; the Touch row in the menu picks what it does:
Push shoves lava away and carries it along as you drag, Pull gathers it, Spin is a little tornado
under your finger, Heat and Cool change its temperature. Several fingers work at once. On a phone,
gravity decides which edge of the screen is the floor and the lamp turns to match, and a shake shoves
the lava, so it behaves like the liquid in a real lamp.

### Layout

    index.html                 page shell and import map
    src/app.js                 wiring: settings into the sim, the frame loop, the page
    src/sim/                   the simulation, no DOM
      simulation.js            state arrays and the step
      fluid.js                 double density relaxation
      heat.js                  heating, cooling, buoyancy
      spatialHash.js           neighbour lookup grid
      random.js
    src/render/renderer.js     picks WebGL, or the 2D canvas as the fallback
      glRenderer.js            the metaball pass as shaders
      canvasRenderer.js        the same pass in JavaScript
      overlays.js              heater strip and flow arrows
    src/input/motion.js        device motion: shakes, and which edge is down
    src/input/pointer.js       fingers and the mouse
    src/input/frame.js         the lamp's quarter turns inside the page
    src/ui/                    settings state, persistence, the settings panel
    experiments/               scratch pages; pinch.html is the pinch lab: one blob, one heat pulse,
                               fixed seed, silhouette on orange, knobs for the liquid, a filmstrip

### Settings

The menu in the top left has two sections: Lamp, for colours, heat, gloop (conduction), stir, pace,
what a finger does and how to look at it, and Physics, folded away, for the particle model. The colour
swatches follow the view: the heat map's five stop gradient while it is on, the lava and glow colours
while it is off, and the flow field's slow to fast pair while the arrows are up. The
numbers are knobs: drag sideways or up, scroll, or use the arrow keys; click the number to reset one.
Save keeps the settings in local storage, Share copies a link that carries them, and the ? button
puts one sentence under every control saying what it changes. Every random number in the lamp comes
from one seeded generator; the Seed field shows the seed in play, and typing one (or pressing New)
reloads the lamp from it, so a seed and a window size reproduce the cups, the elements and every
eddy. Saved and shared with the rest.

<sub>Copyright © 2020-2026 Robert Kempton</sub>
