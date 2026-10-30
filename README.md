## Lavalamp.app

Because lavalamps are cool.

A particle fluid simulation dressed up as a lava lamp. No build step, no dependencies to install:
open `index.html` from any static server and it runs.

    python3 -m http.server 8000

### How it works

The fluid is double density relaxation from Clavet, Beaudoin and Poulin, "Particle-based Viscoelastic
Fluid Simulation" (SCA 2005), as translated to JavaScript by Peeke Kuepers
(peeke.nl/simulating-blobs-of-fluid). Only the relaxation step is used, and velocity is rebuilt from
scratch every frame instead of carried over, which makes the fluid as viscous as wax.

The lava lamp part is a temperature per particle: it rises on contact with the floor, falls at a
constant rate everywhere, and a particle rises exactly as fast as it is hot. Blobs form, stick together
and rise as a unit because of the surface tension that falls out of the relaxation step.

Left alone, that model has nothing sideways in it, so blobs rise and fall in the same lane forever.
A slow convection roll (up the middle, down the walls, in along the floor) stirs the lava the way the
circulation in a real lamp does, and now and then a slow eddy appears somewhere for a few seconds and
stirs that spot (Turbulence), while a couple of others drift about, bounce off the walls and die away
(Drifting Eddies). Heat also conducts between touching particles, which is what lets a blob
warm up and lift as one piece instead of shedding droplets; the Conduction slider sets how much, and a
little goes a long way. On load the lava appears warm and settled on the floor and the heat spreads from
the centre of the base outward, so the first thing to lift is one big glob from the middle. Once warm, the heater is a few hot spots at random
places along the floor, mostly near the middle, each with its own size, power and life (Heat Spots is the
seconds between them, 0 for a steady heater), so a big stretch of the pool heats together and lifts as
one glob. Pace runs the whole lamp in slow motion, and two buttons in the menu are ways of looking: Flow Field draws the stirring as arrows, like
wind on a weather map, and Heat Map colours the lava by temperature like an infrared camera, with a
strip along the floor for the heater.

Rendering is the 2D canvas metaball trick: soft discs, an alpha threshold so nearby discs fuse, then a
highlight along the underside of each blob.

### Layout

    index.html                 page shell and import map
    src/app.js                 wiring: settings into the sim, the frame loop, the page
    src/sim/                   the simulation, no DOM
      simulation.js            state arrays and the step
      fluid.js                 double density relaxation
      heat.js                  heating, cooling, buoyancy
      spatialHash.js           neighbour lookup grid
      random.js
    src/render/canvasRenderer.js
    src/input/motion.js        device motion
    src/ui/                    settings state, persistence, the settings panel
    experiments/               scratch pages

### Settings

The menu in the top left exposes every tuning parameter. Save keeps them in local storage, Share
copies a link that carries them.

<sub>Copyright © 2020 Robert Kempton</sub>
