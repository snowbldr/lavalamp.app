// The lamp's versions. Every lamp that ever ran at lavalamp.app is kept under versions/ as the
// static files it was (versions/versions.json lists them), and the root page decides which one
// a visitor gets: index.html's loader sends every link that names an older version, or none at
// all, to that version, so the links people have keep opening the lamp they bookmarked, and only
// a link or a saved choice that says the current version gets this one (Robert: "The currently
// live version at lavalamp.app should be considered v1 and any link that doesn't specify a
// version should default to v1 so that any current link keeps working"). This module is the
// current version's side of that: its number, the saved choice, the upgrade from an older
// version's settings, and the way back.
import { notify } from './ui/components.js'

export const CURRENT = '2'
export const CHOICE_KEY = 'lavalamp.app-version'
const MANIFEST = 'versions/versions.json'

let manifestPromise = null
export const versions = () => {
  if (!manifestPromise) manifestPromise = fetch(MANIFEST).then(r => r.json()).then(m => m.versions).catch(() => [])
  return manifestPromise
}

// Remember the version this browser chose, and go there. The current version opens by its own
// number in the address so the loader lets it through; an older one opens at its own files.
export const goTo = version => {
  try { localStorage.setItem(CHOICE_KEY, version) } catch {}
  window.location.href = version === CURRENT ? `index.html?v=${CURRENT}` : `versions/v${version}/index.html`
}

// v1's settings (the 2023 lamp: lavaColor, lavaHighlight, bgColor, and a liquid of 300
// particles at Radius 60, Stiff 4000, Near 25000, Rest 4.25, Size 30) onto v2's. The colours
// carry: the one lava colour becomes the cold, cool and warm stops of the heat map and the
// highlight the hot and peak stops, so the lamp keeps its colour. The liquid does not: v2 runs
// tens of thousands of particles on another scale, where v1's numbers mean nothing (its Stiff
// times Rest is 17000 against a Pull of 2700), so the liquid is v2's default. Gravity, Max Temp
// and Count are sized to the window in both and take v2's defaults too.
const v1ToV2 = old => {
  const out = {}
  if (old.bgColor) out.bgColor = { ...old.bgColor }
  if (old.lavaColor) { out.heatCold = { ...old.lavaColor }; out.heatCool = { ...old.lavaColor }; out.heatWarm = { ...old.lavaColor } }
  if (old.lavaHighlight) { out.heatHot = { ...old.lavaHighlight }; out.heatPeak = { ...old.lavaHighlight } }
  return out
}

// What each older version's settings become here. A version without an entry upgrades to the
// defaults (the v0 lamps: their settings were a different lamp's).
const mappings = { 1: v1ToV2 }

// The upgrade the root page was asked for, if any: ?upgrade=<old version>&from=<base64 of the
// old settings>, as the banner in an old version sends. Returns the mapped settings to apply
// over the defaults, or null when this is an ordinary load. The parameters are taken out of
// the address so a reload does not upgrade again.
export const takeUpgrade = () => {
  const query = new URLSearchParams(window.location.search)
  if (!query.has('upgrade')) return null
  const from = query.get('upgrade')
  let old = null
  try { old = JSON.parse(atob(query.get('from') || '')) } catch { old = null }
  const map = mappings[from]
  const mapped = old && map ? map(old) : {}
  query.delete('upgrade'); query.delete('from')
  const rest = query.toString().replace(/=(?=&|$)/g, '')
  window.history.replaceState(null, '', `${window.location.pathname}${rest ? '?' + rest : ''}${window.location.hash}`)
  try { localStorage.setItem(CHOICE_KEY, CURRENT) } catch {}
  notify(old && map ? `Upgraded from v${from}: colours carried over` : `Now on v${CURRENT}`)
  return { from, mapped, carried: Object.keys(mapped) }
}
