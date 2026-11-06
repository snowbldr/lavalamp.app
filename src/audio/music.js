import { createSections } from './sections.js'
import { createEnvelope, createWaits, hitIn, tailOf } from './shape.js'
// The lamp listening to music (Robert: "one thing I would love is a music sync"). Nothing is
// sent anywhere: the browser's own microphone, or on a desktop a tab's audio, goes into a Web
// Audio AnalyserNode, and once a frame the lamp reads three band energies, a loudness and a
// beat from it. The numbers are 0 to 1 or so after Sensitivity, smoothed with a fast attack
// and a slow release so a hit lands at once and a quiet bar fades. The beat is bass energy
// against its own running average, with a refractory time so a kick counts once.
//
// Sources: 'mic' (getUserMedia, audio only, one permission prompt from a gesture; the phone
// over https works; any audio input can be chosen, so a loopback driver such as BlackHole
// hears every app on the machine), 'system' (getDisplayMedia asking for system audio, a desktop
// browser, a share dialog each time; the picture is stopped the moment it arrives and only the
// audio is used: Robert, "we do not record any visuals from the screen or connect to any
// devices like webcam and only use the audio stream from the screen share"), and 'test' (a
// synthetic 120 bpm kick with a hi-hat, for checking the detector from a laptop with no music in
// the room; it reaches the analyser through a muted gain, so nothing is heard).
//
// Each sync reads its own frequency range, set by knobs (Robert: "we'll need to have like
// frequency range sliders for selecting a min and max for each type of sync we have so it can
// be dialed in for certain songs"): the beat, the heat, the eddies and the kick.
//
// Cost: one getByteFrequencyData a frame over 512 bins and a few sums. Measured on the GPU lamp
// at the defaults (see docs/decisions.md): well under a tenth of a millisecond a frame.
export const SOURCES = ['mic', 'system']
const QUIET_WAIT = 400 // ms a start with no click waits for the audio to be allowed to run (see open)
// The attack of a beat (an option, off as tuned; a tool turns it on): a hit's bass rises ATTACK_RISE
// times over its level just before, reaching 90% of its peak within ATTACK_MS of 10%. Robert's bass hits on
// his tap along (18 of them, a 5 ms RMS of 40 to 150 Hz): attack 8 to 31 ms, median 14; 4.2 to 22.4 times,
// median 14 (Robert: "it's got this very similar small wave to big wave rise over a similar amount of time.
// we could just look for anything liek that within a range, attack I guess, and use that as part of the
// trigger signal"; "let's add the attack. I do see occasional extra fires"). The spectrum is read every
// 17 ms, longer than the attack, so the shape is read from the bass's own waveform, the analyser's last
// 2048 samples band passed to the beat's range, in 1 ms steps; a beat fires only with an attack seen in its
// frame or the one before.
const ATTACK_RISE = 4
const ATTACK_MS = [6, 35]
const ATTACK_FRAMES = 2
// A window's shape: { rise, attack } (attack in ms, Infinity when no rise from low starts in it).
export function shapeOf (samples, rate) {
  const step = Math.max(1, Math.round(rate / 1000)), n = Math.floor(samples.length / step)
  const env = new Float32Array(n)
  for (let k = 0; k < n; k++) { let q = 0; for (let i = k * step; i < (k + 1) * step; i++) q += samples[i] * samples[i]; env[k] = Math.sqrt(q / step) }
  let kp = Math.max(0, n - 20)
  for (let k = n - 20; k < n; k++) if (k >= 0 && env[k] > env[kp]) kp = k
  let floor = Infinity
  for (let k = Math.max(0, kp - 30); k < kp; k++) floor = Math.min(floor, env[k])
  if (!(floor < Infinity)) return { rise: 0, attack: Infinity }
  const peak = env[kp], rise = peak / Math.max(1e-6, floor)
  let a10 = -1
  for (let k = kp; k >= Math.max(0, kp - 30); k--) if (env[k] < floor + 0.1 * (peak - floor)) { a10 = k; break }
  if (a10 < 0) return { rise, attack: Infinity }
  let a90 = kp
  for (let k = a10; k <= kp; k++) if (env[k] >= floor + 0.9 * (peak - floor)) { a90 = k; break }
  return { rise, attack: a90 - a10 }
}
// The shapes of the other triggers (shape.js; options, each off as tuned; a tool turns them on;
// Robert: "impelemnt the shape for all of those triggers"). Each band keeps its envelope, the 1 ms RMS of its
// waveform from frame to frame: bass (the beat's range), mids (BEAT_MIDS), kick (the kick's range) and broad
// (the whole waveform). A tool's scan gives each frame its new milliseconds of each with its bytes
// (frame.bins.shapes, read with the same createEnvelope), so the scan, a replay of its frames and the live
// input judge the same envelope. Live, a band's analyser is made and read only while a shape wants it.
export const SHAPE_TRIGGERS = ['beat', 'hat', 'clap', 'boom', 'drumHit', 'impact', 'stab', 'wobbleNote']
export const shapeBands = ranges => ({ bass: ranges.beat, mids: BEAT_MIDS, kick: ranges.kick, broad: null })
const SHAPE_BANDS_OF = { bass: [], mids: ['drumHit', 'stab'], kick: ['hat', 'clap', 'impact'], broad: [] } // the bands each shape reads (the beat reads its own, timeAnalyser)
export { createEnvelope, hitIn, tailOf } from './shape.js'
// Measured in the tool's scans of its clip library's songs, a shape against the trigger as it is. With no
// hand marked hats, a hat's worth was read from the beat: how closely the hats' envelope peaks sit on a
// sixteenth of the beats around them (the vector strength, 1 all on the grid, 0 none).
// The hat: the kick band rising HAT_RISE times over its lowest in the 30 ms before its peak, and gone under
// HAT_TAIL of it 15 to 30 ms after (it waits for that, at most a frame or two). Hats kept and their vector
// strength, as is and with the shape: C-C 433 at 0.47, 201 at 0.87; Bangarang 204 at 0.40, 96 at 0.54;
// Bohemian 669 at 0.14, 29 at 0.78; Drugs I Like 591 at 0.58, 294 at 0.63; Espresso 349 at 0.55, 193 at 0.71;
// Killing in the Name 557 at 0.25, 192 at 0.30; Sandman 574 at 0.26, 355 at 0.30; Beethoven's first
// movement, with no hat in it, 747 to 1. Robert asked for an attack of 1 to 3 ms; by the grid the attack told
// nothing (hats of 3 ms or less sat no closer to it than those of 7 to 12) and is not tested.
const HAT_RISE = 8
const HAT_TAIL = 0.5
// The clap: a snap's spike in the kick band, its attack CLAP_ATTACK ms or less, rising CLAP_SPIKE times, and
// under CLAP_TAIL of its peak 15 to 40 ms after. Robert's snaps (snaps.m4a, 4.8 to 21 s, 23): one spike each,
// 1 to 3 ms up, 430 to 2970 times, 1 to 5% left; not the two or three spikes of a hand clap, so a tail is
// tested, not a count. The false claps: Bangarang 1.15 (11 ms, 31% left), Bohemian 2.12 and 324.78 (4 and
// 2 times), Killing in the Name 0.52 (20 ms, 25% left).
const CLAP_ATTACK = 5
const CLAP_SPIKE = 10
const CLAP_TAIL = 0.15
// The boom, the stab and the wobble have shapes to try, off in the tool too, as none helped. The boom: the
// sub's rise to its peak (10 to 90%, in power) at least BOOM_SWELL ms, a swell, not a kick. On C-C the
// bwongs at 3:02 to 3:15 rise 9 to 39 dB in 33 to 401 ms out of a sub that is sounding, the kicks at 1:40 to
// 1:46 10 to 13 dB in 33 to 50; Espresso's marked boom at 9.73 rises in 33 ms (lost) and C-C's false one
// at 93.48 in 134 (kept). The stab: an attack in the mids of STAB_ATTACK ms or less; Bohemian's three
// stabs 4 to 10 ms, Killing in the Name's three others 1 to 5, so it holds them all. The wobble note: the
// wobble band's level over the last WOBBLE_WINDOW repeating at 2 to 8 times a second, its autocorrelation at
// a lag of 7 to 30 frames WOBBLE_PERIODIC or more; Bangarang's wobble at 1:16 to 1:30 (30 notes) is
// mostly under 0.5 and Drugs I Like's notes over 0.8 (25 of 41), over 1.5 s or by its brightness alike.
const BOOM_SWELL = 50
const STAB_ATTACK = 12
const WOBBLE_PERIODIC = 0.5
const FFT = 2048 // 1024 bins; at 48 kHz a bin is 23 Hz (at 47 the beat range, 40 to 150 Hz, was three bins)
const ATTACK = 0.08 // seconds to rise
const RELEASE = 0.3 // seconds to fall
const BEAT_AVERAGE = 1.5 // seconds of bass history the beat is judged against
const BEAT_FLOOR = 0.08 // bass under this (of full scale) is never a beat
const BEAT_REFRACTORY = 0.22 // seconds: faster than 270 bpm is not a beat
const BEAT_PEAK_MEMORY = 10 // seconds the loudest recent bass is held over; a beat is within 12 dB of it
// The beat is read in power, not decibels (Robert, on real music: "I think it's reacting to notes
// that are too soft and too high frequency"): in decibels a soft note in a quiet bar rose as far
// as a kick in a loud one. A beat is the beat range's power rising over BEAT_RISE_FRAMES frames by
// BEAT_POWER_RISE times its own average, and by more, for its average, than the mids' rise
// (BEAT_MIDS, 300 Hz to 4 kHz) for theirs: a snare, a piano or a voice lifts the bass bins too,
// but lifts the mids more; a kick is the other way round.
const BEAT_POWER_RISE = 1.5
const BEAT_RISE_FRAMES = 4
const BEAT_MIDS = [300, 4000]
const BEAT_BASS_LEAD = 1
// The pump (listener.pump, on; a tool can turn it off): a kick in a sidechained drop. On Animals the sub (23 to
// 46 Hz) sits pegged near full scale and ducks for a moment on each kick while the kick's body comes up in
// 70 to 150 Hz, so the beat range's power hardly rises: the kicks the beat missed rose a median 0.47 times
// against BEAT_POWER_RISE's 1.5. Pegged is the beat range's 1.5 s average within PUMP_PEG dB of its held
// peak: at the kicks Animals' beat missed it was -1.2 to -1.0 dB, at those it caught -15 to -3.3, and in
// every other song of the library over -2.5 dB for no frame at all but Drugs I Like's 13%. While pegged, a
// beat is also the beat range's bins rising, each over its own lowest in the last BEAT_RISE_FRAMES frames,
// by PUMP_FLUX dB on average, at a peak of that (so a frame late) and over the mids' same rise. A ducking
// sub then hides nothing. Lowering the rise alone was tried first (Sandman 441 beats to 669). Beat F1
// against the teacher's kicks, as is and pumped: Animals 0.42, 0.62 (85 of 267 kicks to 155, 48 extra beats to
// 80); Drugs I Like 0.95, 0.94 (3 beats more); every other song the same beats.
const PUMP_PEG = -2.5
const PUMP_FLUX = 8
// The split (listener.split, on; a tool can turn it off; Robert: "I think kick drum needs to be split into two
// triggers, one is lis like deep bass hits and one is like lower end melody notes, they both read as kick
// drum"). A kick's thump falls in pitch as it rings (an electronic kick sweeps down an octave in 50 ms), a
// bass note holds its pitch. The low end's pitch is the power weighted mean of 30 to 250 Hz, in octaves;
// a beat waits SPLIT_FRAMES frames and how far that fell from the hit to its lowest since is its drop.
// Measured at the tool's beats against the teacher's kicks (an offline separation's, within 0.1 s),
// median drop: kicks Espresso 1.13, Bangarang 1.18, Drugs I Like 0.83, Animals 0.83, C-C 0.64, Killing in
// the Name 0.37, Bohemian 0.24, Sandman 0.04; the bass notes and the rest -0.07 to 0.17 everywhere. Rock's
// kicks hardly sweep (Sandman's), so the drop is only asked for where this song's kicks do: SPLIT_SHARE of
// the last SPLIT_MEMORY beats dropping SPLIT_SWEPT or more. Then a beat that drops under SPLIT_DROP is a
// bass note (`bassNote`), not a beat; elsewhere every beat is a kick, as before. Where it is asked a kick is
// heard the frame its drop passes SPLIT_DROP (most a frame after the hit, 17 ms later than the beat as is)
// and a bass note SPLIT_FRAMES after it. The share and the drop were swept with 1 to 3 frames: 2 was best.
// Beat F1 against the teacher's kicks, as is and split: Espresso 0.57, 0.85 (341 beats to 178: 139 of its
// 150 kicks kept); Bangarang 0.86, 0.87; C-C 0.89, 0.90; Killing in the Name 0.89, 0.90; Drugs I Like 0.95,
// 0.94; Animals 0.42, 0.43; Bohemian 0.70, 0.67; Sandman 0.65, 0.65 (never swept, so as before).
// The drop is measured from the candidate frame itself: its lowest starts at that frame's own pitch, not
// at infinity, so a kick whose pitch has already fallen SPLIT_DROP from the frame before (the top is the
// larger of the two) is heard on the frame it was found and only the rest wait. An offline replay of recorded
// analyser frames found the Demucs trained kick a median 57 ms after the teacher's stamp, 33 ms of it the
// analyser window filling, 17 ms the rise test, 17 ms this wait (one frame on five of the eight songs;
// C-C and Sandman never read as swept). Measured from infinity, 743 of 2408 fires were on their candidate
// frame; from the frame's own pitch 1704 of 2413, the median 50 ms, and the same fires otherwise: kick F1
// against the teacher within 50, 70 and 100 ms pooled over the eight songs 0.30, 0.65, 0.79 to 0.42, 0.72,
// 0.79, precision 0.82 both ways, extra beats 429 to 430, the orchestra's false kicks 422 both ways. Killing
// in the Name within 50 ms 0.33 to 0.59, Bangarang 0.06 to 0.32, Espresso 0.11 to 0.29. Rejected first:
// hearing every candidate at once and marking the bass note afterwards, which is the split turned off for
// kicks (Espresso's precision 0.78 to 0.41, Bangarang's 0.90 to 0.77); a shorter rise history, which moved
// the median by 4 ms at most, since the band is flat before a kick and the lowest of two frames is the
// lowest of four; and firing on the beat clock's grid, which lands 32 to 40% of its predictions on no kick.
const SPLIT_FRAMES = 2
const SPLIT_BAND = [30, 250]
const SPLIT_DROP = 0.5
const SPLIT_SWEPT = 0.8
const SPLIT_SHARE = 0.3
const SPLIT_MEMORY = 32
// The bass note also fires on the bass line's own onsets, the ones the beat never heard: the bytes of
// BASS_BAND rising over those BASS_LAG frames back (summed, in bytes), at a peak of that, over its mean
// and BASS_K spreads of the last second and over BASS_FLOOR, at most every BASS_REFRACTORY; held SPLIT_FRAMES
// frames like a beat, and dropped when a beat came within BASS_NEAR of it (the beat's split decides it).
// Against the teacher's bass notes (Basic Pitch on the bass stem), F1: Sandman 0.59, Animals 0.58, Killing in
// the Name 0.47, Espresso 0.42, Bangarang 0.40, Drugs I Like 0.40, Bohemian 0.35, C-C 0.30. A start, not tuned
// far: a K of 1.5, a floor of 80 or 150 and a refractory of 0.18 were all worse.
const BASS_BAND = [30, 200]
const BASS_LAG = 2
const BASS_K = 1
const BASS_FLOOR = 30
const BASS_REFRACTORY = 0.12
const BASS_NEAR = 0.1
// The hat from the top (listener.hatTop, on; a tool can turn it off): HAT_TOP_BAND's level (dB) rising
// HAT_TOP_RISE over its lowest of the last HAT_TOP_FRAMES frames, at most every HAT_TOP_REFRACTORY. The hat as
// it is reads 2 to 8 kHz, where dubstep's synths and a guitar's crunch live too: against the teacher's hats
// (within 0.1 s, with the tool's shapes on) it caught Bangarang 4 of 694, Animals 69 of 148, C-C 183 of 583.
// Over 12 to 20 kHz only a hat, a cymbal or a snare's sizzle is left. Swept across the library (bands from
// 2 to 22 kHz, rises 2 to 6 dB, 2 or 3 frames, 0.08 to 0.12 s), F1 as is and from the top: Bangarang 0.01,
// 0.72; C-C 0.47, 0.85; Drugs I Like 0.48, 0.59; Espresso 0.54, 0.67; Killing in the Name 0.23, 0.65;
// Sandman 0.18, 0.54; Bohemian 0.03, 0.52; Animals 0.23, 0.44; Beethoven's first movement (no hats) 1 hat
// and 6. A microphone across a room, or a file cut at 16 kHz, has little up there: this is for system audio,
// and on a mic the hats may go quiet. Accepted for now, at Robert's call, with Demucs trained the only detector.
const HAT_TOP_BAND = [12000, 20000]
const HAT_TOP_RISE = 5
const HAT_TOP_FRAMES = 2
const HAT_TOP_REFRACTORY = 0.1
// The snare (listener.snare, on; a tool can turn it off): a backbeat's hit, not the drum fill drumHit is
// (sections.js DRUM_BAND, a fill, which fired 0 to 14 times a song on the teacher's 111 to 477 snares). A
// snare is its body (SNARE_BODY) rising SNARE_BODY_RISE dB, its rattle (SNARE_RATTLE) SNARE_RATTLE_RISE and
// its sizzle (SNARE_TOP) SNARE_TOP_RISE together, each over its lowest of the last SNARE_FRAMES frames, the
// low end (SNARE_LOW) rising less than the body (a kick is the other way round), at most every
// SNARE_REFRACTORY. Swept against the teacher's snares: F1 Animals 0.61, Sandman 0.58, Killing in the Name
// 0.56, Drugs I Like 0.50, Bohemian 0.44, C-C 0.41, Bangarang 0.38, Espresso 0.37 (drumHit 0 to 0.11). It
// fires 171 times in Beethoven's first movement, which has no snare: the orchestra's tutti hits.
const SNARE_BODY = [150, 350]
const SNARE_RATTLE = [2000, 6000]
const SNARE_TOP = [7000, 12000]
const SNARE_LOW = [40, 120]
const SNARE_BODY_RISE = 4
const SNARE_RATTLE_RISE = 3
const SNARE_TOP_RISE = 5
const SNARE_FRAMES = 4
const SNARE_REFRACTORY = 0.15
// The surge: the whole spectrum's power over the last SURGE_FAST seconds against the last
// SURGE_SLOW, so a drop that arrives as everything coming in at once (Robert, on Tom Vek's C-C:
// "at 0:54-0:55 or so, there's a big bass drop and then highly active music"), with no gap in the
// kick before it, still reads as one.
const SURGE_FAST = 0.4
const SURGE_SLOW = 6
// The song's sections, by level (Robert's C-C, scanned offline with docs/methods/tools/song-scan.js:
// the intro -52 rising to -40 dB, the drop at 0:55 -45 to -36, the busy part -33 to -38, after
// 1:51 -37 to -40 with the spectrum half as broad). Measured against the song itself the intro
// was the loudest thing heard yet and read as busy; against a reference it is plainly quiet. The
// reference is the loudest the song has been (2 s power), held and falling REFERENCE_FALL dB a
// second, never under REFERENCE_DB (lower by Sense, for a quiet microphone). Level alone left
// 1:51 busy (2 to 4 dB under), so the score adds the spectrum's breadth (the mean byte) against
// its own held peak, in dB, BREADTH_WEIGHT times, eased over SCORE_SMOOTH: busy above -BUSY_DB,
// calm under -CALM_DB, and in between it stays as it was. On C-C: calm to 0:55, busy from the
// drop, calm 1:52, busy 2:11 to 2:18 and from 2:23, calm 3:20 to 3:29. A drop: while calm, a
// surge past DROP_SURGE that lands within DROP_DB of the reference; the section turns busy at once.
const REFERENCE_DB = -36
const REFERENCE_FALL = 1 / 15
// The floor under the reference sinks for a quiet recording: a song that has not come within
// FLOOR_NEAR dB of it for FLOOR_PATIENCE seconds is quiet, not in an intro, and the floor falls
// FLOOR_FALL dB a second (to FLOOR_LOWEST at most). Kleiber's 1975 Fifth runs -44 to -62 dB, so
// under -36 it read calm the whole first movement, its 5:36 climax at -44 included (Robert:
// "symphony no 5 looked a little too calm around 5:36. I guess that's the beethoven drop right
// htere lol"); C-C, Drugs I Like and Bangarang reach the floor in their first minute.
// The listening level (Robert: "can we check the volume level and normalize it so the reaction
// doesn't depend on listening volume? that seems wrong"): through Spotify, system audio reached the
// lamp 7 dB under the mp3 of the same song (Spotify's own normalizing, the capture after it), and
// C-C's drop at 0:55 was missed. The lamp keeps the loudest system audio has played (2 s power),
// forgetting LEVEL_FORGET dB a second while anything plays, remembered between songs and visits,
// and the analyser's window is moved down by as far as that is under LEVEL_LOUD (where the files
// the lamp was tuned on peak), LEVEL_MOST at most, so the bytes read as the file's would. C-C
// rendered 7.3 dB quiet: the drops at 55.1, 139.9 and 209.0 with the window moved 6.9 to 7.7 dB,
// as the file's; unmoved, 0:55 lost and a false one at 92.9. System audio and loopback inputs only: a file plays at its
// own level, and a microphone's is the room's (the clap wants the room's quiet as it is; Sense is
// its knob). Tried first: the floor under the reference lowered (the rest still heard a quiet
// song: a false drop at 0:36), and the bytes raised (what sank under the window's floor was lost:
// C-C so lifted to its own level still read a false drop at 0:36).
const MIN_DB = -90 // the analyser's window, for a file
const MAX_DB = -10
const LEVEL_LOUD = -35 // a little under C-C's own, since a file played 1 dB over read a false drop at 0:36 and 1 dB under read as the file (peaks: C-C -34.4, Espresso -34.7, Bangarang -33.4, Drugs I Like -33.0; Sandman, Bohemian Rhapsody -36.5; Killing in the Name -43.6)
const LEVEL_FORGET = 1 / 20
// Where it starts: a louder source is learned the moment it plays and a quieter one only as fast as
// LEVEL_FORGET, so it starts low, at streaming's level (Spotify and YouTube turn a loud master
// down about this far; Robert's lamp had learned only -39 of Spotify's -41.7 and still missed 0:55).
const LEVEL_START = -42
const LEVEL_MOST = 20
const LEVEL_SILENT = -70 // dB: under this nothing is playing
const LEVEL_KEY = 'lavalamp-music-level-2-' // 2: what the first, starting at -35, had half learned is let go
// A loopback input chosen as the Mic (BlackHole and its kind) is system audio too, not a room: C-C
// through Spotify into BlackHole still fired only on 0:55's second hit (Robert: "still onlly firing
// on the second drop with the spotify c-c") while only System was lifted. Known by the input's name.
const LOOPBACK = /blackhole|loopback|soundflower|vb-?cable|virtual|aggregate|multi-output/i
const FLOOR_NEAR = 3
const FLOOR_PATIENCE = 90
const FLOOR_FALL = 1 / 10
const FLOOR_LOWEST = -60
const BREADTH_FALL = 1 / 60 // of itself a second, the held peak of the breadth
const BREADTH_WEIGHT = 1.5
const SCORE_SMOOTH = 2
const BUSY_DB = 3
const CALM_DB = 6
const DROP_SURGE = 2
const DROP_DB = 4
const DROP_HOLD = 8 // seconds a drop holds the section busy while the score catches up
// A drop is also the bass coming back after a cut, busy or not (Robert, on Nate Band's Drugs I
// Like: "it didn't fire when the drop hit. drop is at :43-:44"). Scanned: that song reads busy
// from 0:03, so the drop out of a calm part never came; a build to 41.6 s, then the bass (20 to
// 150 Hz) cut to silence, 47 dB under the build, to 43.4 s, then the drop. The kick was gone
// 1.93 s, and the old first-kick-back rule wanted 2. C-C has the same cut, 53.7 to 54.9 s. And
// Skrillex's Bangarang (Robert: "it's doing really bad with skrillex bangarang, which is ironic
// because basically dubstep invented the drop"): its second drop, 2:46.97, comes after a gap of
// only 0.65 s in which the bass flickers back for a frame or two, so a cut counted as unbroken
// never reached its length. A beat is a drop when the bass (20 to 150 Hz) was CUT_DB under the
// kicks' peak for CUT_SHARE of the CUT_TIME seconds before it (up to CUT_SKIP before it, the
// beat's own rise), and the frame is within CUT_LEVEL dB of the reference: the bass of a
// breakdown coming back quiet (Bangarang's at 2:21 and 2:29, 9 dB under) is not a drop.
const CUT_DB = 20
const CUT_TIME = 0.5
const CUT_SHARE = 0.85 // 0.75 let the Bangarang intro's hits at 0:06 and 0:08 through
const CUT_SKIP = 0.07
const CUT_LEVEL = 6
// And something quieter or thinner came first: the section score (below) under CUT_BEFORE_SCORE
// at some point in the CUT_BEFORE seconds before the gap. In a full part dubstep's half-time bars
// leave gaps in the bass all through (Bangarang 1:20, 1:55; Drugs I Like 1:39), with the score
// at -0.5 to -3.2; before the real drops it dipped to -4.1 to -6 (and -53 out of the intro).
const CUT_BEFORE = 8
const CUT_BEFORE_SCORE = -4
// The kick back: the first beat after KICK_GONE seconds with none, landing near the reference (the
// gap is itself the different thing before it; the score, eased over 2 s, dipped only to -1.7). Bangarang's drop at 0:27.3 (Robert: "big pot built but did
// not fire on big drop... that's the drop at :25-:26") has the kick gone 0:23 to 0:27 and the
// level down 3 or 4 dB, but no cut in the bass and no surge.
// The switch: a new tempo (Robert, on Bohemian Rhapsody's rock at his 4:06: "there's a hard drum
// beat that should trigger it"). The hits there are no harder (a rise of 1.5 to 2.3, as before)
// but come 0.27 s apart where they came 0.42. A switch is TEMPO_NEW beats whose gaps agree within
// TEMPO_AGREE of their mean, against the gaps of the beats TEMPO_FROM to TEMPO_TO seconds back, of
// which TEMPO_STEADY agree within 15% of their median; the new gap off that median, and off half
// and twice it, by more than TEMPO_OFF of each. Bohemian Rhapsody 4:10.0 in the video's mp3; C-C,
// Drugs I Like, Bangarang: none (an agreement of 20% let Drugs I Like's 2:14.9 in).
const TEMPO_NEW = 3
const TEMPO_AGREE = 0.15
const TEMPO_FROM = 2
const TEMPO_TO = 6
const TEMPO_STEADY = 0.7
const TEMPO_OFF = 0.2
const KICK_GONE = 2.5 // 2 added drops in Drugs I Like's full parts (1:11, 2:49, 3:03)
const SETTLE = 6 // seconds from the start before a drop: the averages start from the silence before the music, and Drugs I Like's first second read as one
// The boom: a deep sub bass note (Robert, on C-C after the drop: "there's like this deep
// BWOONNNNNGGGG sound, and I would expect some lava bursts to be timed with those"). Scanned
// offline: after 0:55 a note at 23 to 70 Hz every 8 beats (3.45 s at 140 bpm), held 1.5 to
// 2.5 s, its onset jumping 8 dB or more in four frames out of a sub that sat 17 to 30 dB lower
// the half second before, often with the mids ducking. The kick lifts the sub as far but lands
// on a sub that is already sounding (inside a note, or the intro's bass line), so it is judged
// against the half second before, not against its average. A boom is the sub rising BOOM_RISE
// dB over BEAT_RISE_FRAMES frames, BOOM_OVER dB above its mean from BOOM_BEFORE to BOOM_GAP
// seconds before, within BOOM_PEAK dB of the loudest sub lately, at most every BOOM_REFRACTORY.
const BOOM_RANGE = [20, 60]
const BOOM_RISE = 8
const BOOM_OVER = 17
const BOOM_BEFORE = 0.6
const BOOM_GAP = 0.1
const BOOM_PEAK = 14
const BOOM_PEAK_FALL = 0.6 // dB a second
const ANALYSIS_RATE = 60 // frames a second the music is heard at, at most (see update)
const REPLAY_REPORT = 4 // frames: a replay's catch up longer than this reports only its last ones
const FRAME_EVENTS = ['beat', 'hat', 'boom', 'clap', 'drop', 'wobbleNote', 'stab', 'bassNote', 'snare']
const SECTION_EVENTS = ['drumHit', 'soloStart', 'leadNote', 'rollEnd', 'impact', 'half', 'double', 'key']
const BOOM_REFRACTORY = 0 // was 1 s: no limits on how often (app.js BOOM_POT_GAP)
const BOOM_FALL = 2 // dB under the note's highest: past its peak (1 fired on frame jitter, 0:55.15 for a peak at 0:55.33)
const BOOM_WAIT = 0.6 // seconds after the attack at most
// The wobble: dubstep's wah, a mid bass whose filter sweeps open and shut a few times a second
// (Robert, on Bangarang at 1:18: "is there a way to detect that sort of wahwahwah sound that
// sounds kind of spinny and trigger eddies more frequently?"). It shows as the brightness of
// 100 Hz to 3 kHz (the power-weighted mean frequency, in octaves) swinging: its spread over the
// last WOBBLE_WINDOW seconds. Scanned: Bangarang's full parts 0.76 median, bursts of 0.95 to 1.19
// about 2 s every 4.5 s (1:19.5 to 1:26 among them); C-C 0.50 median, over 0.95 once; Drugs I Like
// 0.62, twice. The wobble is 0 at WOBBLE_LO octaves to 1 at WOBBLE_HI, and only while that band
// is within WOBBLE_DB of the reference (a near silent band's brightness swings on nothing).
const WOBBLE_BAND = [100, 3000]
const WOBBLE_WINDOW = 1
const WOBBLE_LO = 0.85 // 0.75 counted C-C and Drugs I Like (10 and 30 eddies a song, against 103 in Bangarang); 0.85: 1, 4, 74
const WOBBLE_HI = 1.05
const WOBBLE_DB = 24
// Its notes: each sweep of the filter, the brightness rising through its mean plus a quarter of
// its spread (after falling under the mean), while the wobble is up; a run of them is counted
// from the first and ends WOBBLE_RUN_END seconds after the wobble goes.
const WOBBLE_RUN_END = 0.5
// The stab: a whole-spectrum hit in a calm part, a choir or a band slamming in at once (Robert,
// on Bohemian Rhapsody's opera, "send a bolt of lightning did not release a pot! one was ready
// though... probably a new trigger form"). Heard as a beat, but in a calm part a beat opens
// nothing, and the opera is 10 to 13 dB under the rock's reference, so no drop. Scanned: at the
// beat and STAB_AFTER seconds after it, each band's highest against its mean over the half second
// before (to STAB_GAP before): the opera's three stabs (3:14.4, 3:27.9, 3:38.7 in the video's mp3)
// rise 41 to 47 dB in the bass and 12 to 28 in the rest; Bangarang's last hit 34 and 8; its first
// kicks 33 and 49 in the bass but 5 to 7 above. A stab is a beat in a calm part with the bass up
// STAB_BASS and every other band up STAB_REST: in C-C, Drugs I Like and Bangarang, none.
const STAB_BANDS = [[20, 150], [150, 1000], [1000, 4000], [4000, 12000]]
const STAB_BEFORE = 0.5
const STAB_GAP = 0.1
const STAB_AFTER = 0.05
const STAB_BASS = 35
const STAB_REST = 10
// The clap: a hand clap or a finger snap at the microphone, for when no music is playing (Robert:
// "My kids attempted to snap and clap at it to trigger it when in mic mode, can we add that
// without breaking the music sync?"). A clap is the CLAP_BAND jumping CLAP_RISE dB over its
// lowest in the last BEAT_RISE_FRAMES frames and CLAP_OVER over its mean in the last CLAP_BEFORE
// seconds, the bass (20 to 150 Hz) rising no more than CLAP_BASS dB past it, at most every
// CLAP_REFRACTORY. (A snap is a click of 4 ms, under the analyser's 43 ms window: it spills into
// the bass. Robert's own snaps, a voice memo of 31: the band up 18 to 44 dB, the bass up to 7.6
// more than it on the softest, so the bass may rise about as much.) It only counts while the
// lamp is calm and has heard fewer than CLAP_BEATS beats in the last CLAP_QUIET seconds, so a
// snare or a hat in a song is never a clap; a beat within CLAP_SNAP_BEAT of the band's jump is
// the snap's own and is not counted (25 of his 31 snaps were heard as beats, and they shut out
// the snaps after them: 3 of 31 fired).
const CLAP_BAND = [1500, 8000]
const CLAP_RISE = 15
const CLAP_OVER = 18
const CLAP_BEFORE = 0.5
const CLAP_BASS = -4
const CLAP_BEATS = 3
const CLAP_REFRACTORY = 0.25
const CLAP_QUIET = 4
const CLAP_SNAP_BEAT = 0.1 // s: a beat this close after the band's jump is the snap's own, not the music's
const CLAP_ROOM = -55 // dB: the 2 s level under this, a room with no music (the songs' quiet parts sit about -40 to -55)
const SECTION_SMOOTH = 2 // seconds the section's power is eased over
const PUNCH_AVERAGE = 2 // seconds of history each sync's punch is judged against
// The beat clock: the lamp has to move before the beat to land on it (a pot takes a while to
// lift a blob, an eddy half a second to spin up), and live audio cannot be heard early, so the
// next beat is predicted from the ones heard (Robert: "it would be better to like preheat for a
// bass hit so that blobs and eddies and such would launch exactly at the base hit or drop").
// The period is the median gap between heard beats folded into 60 to 180 bpm, the phase pulled
// a third of the way toward each heard beat near a predicted one; locked once four in a row land
// within a fifth of a period, and it coasts through a missing kick for eight beats.
const CLOCK_PULL = 0.33 // share of a heard beat's error the phase takes
const CLOCK_WINDOW = 0.2 // of a period: a heard beat this close counts as on the clock
const CLOCK_LOCK = 4 // on-clock beats in a row to lock
const CLOCK_COAST = 64 // predicted beats without a heard one before the lock is dropped: a breakdown
// is coasted through on the clock (at 8 the lock went 4 s into the test's breakdown and the
// drop's first two seconds were late), so the drop can be met on time
const CLOCK_HEARING = 2 // missed beats after which the kick counts as gone (a breakdown)
// The activity: how much is going on in the song now against the rest of it, 0 in a breakdown
// to 1 in the fullest chorus (Robert: "parts that are in between drops should show less
// activity and high energy sections with all the instruments and such should show more").
// Three features, each smoothed over a few seconds and scaled between the lowest and highest
// it has been over the last ACTIVITY_MEMORY seconds: loudness, fullness (the share of 24 bands
// from 40 Hz to 12 kHz that are sounding) and the onsets a second (beats and hats).
const ACTIVITY_SMOOTH = 1.5 // seconds each feature is eased over
const ACTIVITY_MEMORY = 120 // seconds the lowest and highest are held over (45 crept so far through an 8 s breakdown that it read 0.8)
const ACTIVITY_RISE = 1 // seconds the activity takes to rise
const ACTIVITY_FALL = 3 // and to fall
const ACTIVITY_BANDS = 24
const ACTIVITY_SPREAD = 0.375
const bandLevels = new Float32Array(ACTIVITY_BANDS)

// The analyser's bytes at ANALYSIS_RATE over [from, to] seconds of a decoded song, rendered offline
// with the analyser set as the live one is (docs/methods/tools/song-scan.js does a whole song so).
async function renderFrames (buffer, from, to) {
  const start = Math.floor(from * buffer.sampleRate)
  const length = Math.max(1, Math.floor(to * buffer.sampleRate) - start)
  const ctx = new OfflineAudioContext(1, length, buffer.sampleRate)
  const piece = ctx.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate)
  for (let c = 0; c < buffer.numberOfChannels; c++) piece.copyToChannel(buffer.getChannelData(c).subarray(start, start + length), c)
  const play = ctx.createBufferSource()
  play.buffer = piece
  const analyser = ctx.createAnalyser()
  analyser.fftSize = FFT
  analyser.smoothingTimeConstant = 0.2
  analyser.minDecibels = MIN_DB
  analyser.maxDecibels = MAX_DB
  play.connect(analyser).connect(ctx.destination)
  const frames = []
  const quantum = 128 / buffer.sampleRate
  for (let k = 1; k / ANALYSIS_RATE < length / buffer.sampleRate - 0.01; k++) {
    ctx.suspend(Math.round(k / ANALYSIS_RATE / quantum) * quantum).then(() => {
      const bins = new Uint8Array(analyser.frequencyBinCount)
      analyser.getByteFrequencyData(bins)
      frames.push(bins)
      ctx.resume()
    })
  }
  play.start()
  await ctx.startRendering()
  return frames
}

export function createMusic () {
  let context = null
  let analyser = null
  let stream = null // the mic or tab stream, to stop
  let testNodes = null
  let bins = null
  let source = 'mic'
  let enabled = false
  let error = ''
  // Why the last start failed, for the page to say what to do: 'gesture' (the browser wants a click first), 'cancelled'
  // (the share picker was closed), 'blocked' (the system will not let the browser share), 'noaudio' (a share with no
  // sound in it), 'denied' (the microphone is not allowed), 'nodevice' (no input), 'unsupported', or 'other'.
  let errorKind = ''
  let onSourceEnd = null // called when the stream being heard ends by itself (the share stopped, the input unplugged)
  let binHz = 0
  const sections = createSections()
  let waited = 0 // seconds since the music was last heard (see ANALYSIS_RATE)
  const levels = { heat: 0, eddy: 0, kick: 0, level: 0, beat: false, hat: false, boom: false, boomPending: false, clap: false, wobble: 0, wobbleNote: false, wobbleRun: 0, stab: false, bassNote: false, snare: false, bpm: 0, activity: 0.5, sinceBeat: 0, surge: 1, calm: true, drop: false, quiet: 0, powerDb: -90, reference: -36, parts: { loud: 0, full: 0, onsets: 0 }, raw: { beat: 0, heat: 0, eddy: 0, kick: 0 } }
  // The clock, in this module's own seconds: the next predicted beat's time and number.
  let attackOn = false // the attack in the beat (ATTACK_RISE), off as tuned
  // The four fitted against the split tracks (the pump, the split, the hat from the top, the snare) are on: what was
  // the Demucs trained detector is the only one (Robert: "let's make the demucs trained detector the only detector
  // for now, we don't need the old one any more"). Their setters stay, so a tool can turn one off to measure.
  let pumpOn = true // the pump (PUMP_PEG)
  let splitOn = true // the split of the beat into kicks and bass notes (SPLIT_DROP)
  const byteHistory = [] // the last BEAT_RISE_FRAMES frames' bytes, for the pump's and the bass note's rises
  const pumpFlux = [0, 0] // the beat range's rise a bin, dB, the frame before last and last; and the mids'
  let pumpMidsFlux = 0
  const pitchHistory = [] // the low end's pitch (SPLIT_BAND, octaves), the last two frames
  let splitPending = null // a beat waiting on its drop: { at, top, low, frames }
  const splitDrops = [] // the last SPLIT_MEMORY beats' drops
  const bassFlux = [] // BASS_BAND's rise a frame over the last second
  let bassPending = [] // the bass line's onsets waiting SPLIT_FRAMES: { at, frames }
  let lastBassOnset = -1e9
  let lastCandidate = -1e9 // the last beat heard before the split judged it
  let hatTopOn = true // the hat from the top (HAT_TOP_BAND)
  let snareOn = true // the snare (SNARE_BODY)
  const topHistory = [] // HAT_TOP_BAND's dB, the last HAT_TOP_FRAMES frames
  const snareHistory = [] // [body, rattle, top, low] in dB, the last SNARE_FRAMES frames
  let lastSnare = -1e9
  let lastAttackAt = -1e9
  let timeAnalyser = null, timeData = null, bassHp = null, bassLp = null
  const shapeOn = Object.fromEntries(SHAPE_TRIGGERS.map(k => [k, false])) // each trigger's shape (SHAPE_TRIGGERS), off as tuned
  const envs = { bass: createEnvelope(), mids: createEnvelope(), kick: createEnvelope(), broad: createEnvelope() }
  const waits = createWaits() // the shapes waiting on their tails
  const wobbleLevels = [] // the wobble band's level a frame, in dB, over WOBBLE_WINDOW, for its shape
  const bandNodes = {} // live: each band's filters and analyser, made the first time a shape wants it
  const beatClock = { locked: false, period: 0.5, next: 0, index: 0, onClock: 0, missed: 0, tick: false, hit: false, heardAt: -1, sectionAt: 0 }
  const gaps = []
  const fits = [] // [beat number, time] of the on-clock beats, for the period
  // The activity's features: eased value, lowest and highest held, and the onsets heard.
  const features = { loud: { v: 0, lo: 0, hi: 0, seen: false }, full: { v: 0, lo: 0, hi: 0, seen: false }, onsets: { v: 0, lo: 0, hi: 0, seen: false } }
  const onsetTimes = []
  let hatAverage = 0
  let lastHat = -1
  let device = '' // the chosen audio input's deviceId, '' for the default
  let bassAverage = 0
  let beatPeak = 0
  let surgeFast = 0
  let surgeSlow = 0
  let sectionPower = 0
  let peakDb = -90
  let levelPeak = LEVEL_START // the loudest this source has played (see LEVEL_LOUD)
  let levelled = '' // 'system' or 'loopback' when this source is lifted to the files' level, its key in the store
  let levelSaved = 0
  let floorDrop = 0 // dB the reference's floor has sunk for a quiet recording (see FLOOR_PATIENCE)
  let farFromFloor = 0 // seconds since the song came within FLOOR_NEAR of the floor
  let breadth = 0
  let breadthPeak = 0.05
  let score = null
  let droppedAt = -1e9
  let bassPowerAverage = 0
  let midsPowerAverage = 0
  const bassHistory = new Array(BEAT_RISE_FRAMES).fill(0)
  const midsHistory = new Array(BEAT_RISE_FRAMES).fill(0)
  const averages = { heat: 0, eddy: 0, kick: 0 }
  let lastBeat = -1
  let lastBoom = -1e9
  let lastClap = -1e9
  const clapHistory = [] // [time, the clap band in dB, the bass in dB] over CLAP_BEFORE
  let lastSwitch = -1e9 // when the last tempo switch was, so a new tempo counts once
  const recentBeats = [] // times of the beats over the last TEMPO_TO seconds and a few more
  const musicBeats = [] // the beats over the last CLAP_QUIET seconds that were not a clap's own
  let lastBandJump = -1e9 // when the clap band last jumped CLAP_RISE
  const scoreHistory = [] // [time, score] ten times a second over the last CUT_BEFORE seconds
  const bandHistory = [] // [time, the STAB_BANDS in dB] over STAB_BEFORE
  let stabPending = null // a calm beat being judged: { at, before, peak }
  let wobbleArmed = true // the brightness has fallen under its mean since the last note
  let wobbleSeen = -1e9 // when the wobble was last up
  const brightHistory = [] // [time, octaves] of the wobble band's brightness over WOBBLE_WINDOW
  const lowHistory = [] // [time, whether the bass was under the cut] over the last CUT_TIME and CUT_SKIP
  let boomPeak = -90
  let boomArmed = null // an attack heard, waiting for its peak: { at, max }
  const subHistory = [] // [time, dB] of the sub over the last BOOM_BEFORE seconds
  let beatCount = 0
  const beatTimes = []
  let clock = 0
  let startedAt = 0
  let fileStartedAt = -1 // the audio clock when a file began, for its position
  let fileStream = null // the playing file's sound as a MediaStream, for recording
  let onFileEnd = null // called when a playing file reaches its end
  // 'frames': analysis frames made ahead (the analyser's bytes at ANALYSIS_RATE, as renderFrames
  // makes them) heard against an outside clock in song seconds, so a song can be watched slowed
  // down or sped up and still be heard exactly as at its own speed.
  let replay = null
  let warmFrames = null // a file started part way: the frames before it, heard on the next update
  let warmBinHz = 0

  const saveLevel = () => { levelSaved = clock; if (enabled && levelled) try { localStorage.setItem(LEVEL_KEY + levelled, levelPeak.toFixed(1)) } catch (e) {} }
  const band = ([lo, hi]) => {
    if (hi < lo) [lo, hi] = [hi, lo]
    const a = Math.min(bins.length - 1, Math.max(1, Math.floor(lo / binHz)))
    const b = Math.max(a, Math.min(bins.length - 1, Math.ceil(hi / binHz)))
    let sum = 0
    for (let k = a; k <= b; k++) sum += bins[k]
    return sum / ((b - a + 1) * 255)
  }
  // A range's mean power, from the analyser's bytes (decibels, -90 to -10 dB across 0 to 255),
  // 1 at full scale.
  const power = ([lo, hi]) => {
    if (hi < lo) [lo, hi] = [hi, lo]
    const a = Math.min(bins.length - 1, Math.max(1, Math.floor(lo / binHz)))
    const b = Math.max(a, Math.min(bins.length - 1, Math.ceil(hi / binHz)))
    let sum = 0
    for (let k = a; k <= b; k++) sum += Math.pow(10, (bins[k] - 255) * 8 / 255)
    return sum / (b - a + 1)
  }
  // A band's envelope read live, its analyser made the first time it is wanted (the bass's is the attack's own).
  const readBand = (name, ranges) => {
    let n = bandNodes[name]
    if (!n) {
      if (name === 'bass') n = { hp: bassHp, lp: bassLp, an: timeAnalyser, data: timeData }
      else {
        n = { an: context.createAnalyser(), data: new Float32Array(FFT) }
        n.an.fftSize = FFT
        if (shapeBands(ranges)[name]) { n.hp = context.createBiquadFilter(); n.hp.type = 'highpass'; n.lp = context.createBiquadFilter(); n.lp.type = 'lowpass'; analyser.connect(n.hp).connect(n.lp).connect(n.an) } else analyser.connect(n.an)
      }
      bandNodes[name] = n
    }
    const r = shapeBands(ranges)[name]
    if (r && n.hp) { n.hp.frequency.value = r[0]; n.lp.frequency.value = r[1] }
    n.an.getFloatTimeDomainData(n.data)
    envs[name].push(envs[name].read(n.data, context.sampleRate, Math.round(context.currentTime * context.sampleRate)))
  }
  // The sub's rise into now: seconds from 10% to 90% of the way up from its lowest in the history, in power.
  const swellOf = (history, nowDb) => {
    const P = x => Math.pow(10, x / 10)
    let lo = history.length - 1
    for (let j = 0; j < history.length; j++) if (history[j][1] < history[lo][1]) lo = j
    if (lo < 0) return 0
    const floor = P(history[lo][1]), top = P(nowDb)
    let a10 = clock, a90 = clock
    for (let j = history.length - 1; j >= lo; j--) if (P(history[j][1]) < floor + 0.1 * (top - floor)) { a10 = history[j][0]; break }
    for (let j = lo; j < history.length; j++) if (history[j][0] >= a10 && P(history[j][1]) >= floor + 0.9 * (top - floor)) { a90 = history[j][0]; break }
    return a90 - a10
  }
  // How steadily a level repeats: the highest autocorrelation at a lag of lo to hi frames.
  const periodicOf = (v, lo, hi) => {
    const n = v.length
    let m = 0
    for (const x of v) m += x
    m /= n
    let e = 0
    for (const x of v) e += (x - m) * (x - m)
    let best = 0
    for (let L = lo; L <= Math.min(hi, n - 1); L++) {
      let c = 0
      for (let j = L; j < n; j++) c += (v[j] - m) * (v[j - L] - m)
      best = Math.max(best, c / Math.max(1e-9, e * (n - L) / n))
    }
    return best
  }
  const ease = (from, to, dt) => from + (to - from) * Math.min(1, dt / (to > from ? ATTACK : RELEASE))

  // quiet: started with no click (a reload with Music on): the browser may not let the audio run yet, and its resume
  // then waits for a click forever, so it is given a moment and the start gives up, to be tried again on a click.
  async function open (quiet) {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) throw new Error('no Web Audio')
    if (!context) context = new Ctx()
    if (context.state !== 'running') {
      if (!quiet) await context.resume()
      else {
        await Promise.race([context.resume(), new Promise(resolve => setTimeout(resolve, QUIET_WAIT))])
        if (context.state !== 'running') throw Object.assign(new Error('click to start'), { kind: 'gesture' })
      }
    }
    analyser = analyser || context.createAnalyser()
    analyser.fftSize = FFT
    analyser.smoothingTimeConstant = 0.2
    // Headroom: the browser maps -100 to -30 dB onto the bytes, and louder clips at 255. The
    // test's bass sat at 0.98 to 1.0 of full scale every frame, so a kick had nothing to rise
    // into; a loud song through a loopback input does the same. -90 to -10 dB leaves room.
    analyser.minDecibels = MIN_DB - levels.quiet
    analyser.maxDecibels = MAX_DB - levels.quiet
    bins = new Uint8Array(analyser.frequencyBinCount)
    binHz = context.sampleRate / FFT
    // The bass's waveform for the attack: the analyser passes its input on, band passed to the beat's range.
    if (!timeAnalyser) {
      bassHp = context.createBiquadFilter(); bassHp.type = 'highpass'
      bassLp = context.createBiquadFilter(); bassLp.type = 'lowpass'
      timeAnalyser = context.createAnalyser(); timeAnalyser.fftSize = FFT
      analyser.connect(bassHp).connect(bassLp).connect(timeAnalyser)
      timeData = new Float32Array(FFT)
    }
  }

  function closeSource () {
    if (stream) { for (const t of stream.getTracks()) t.stop(); stream = null }
    replay = null
    if (testNodes) { for (const n of testNodes) { try { if (n.stop) n.stop() } catch (e) {} try { n.disconnect() } catch (e) {} } testNodes = null }
  }

  // A kick at 120 bpm (a 55 Hz sine with a fast decay) and a hat every half beat, for the lab, in
  // sections of 16 beats: full (kick, hats, a bass line and a wash of mids) then a breakdown
  // (soft hats and the wash low, no kick), so the activity and the clock's coasting can be seen.
  function startTest () {
    const gain = context.createGain()
    gain.gain.value = 0 // heard by the analyser, not the room
    const kickOsc = context.createOscillator()
    kickOsc.type = 'sine'
    kickOsc.frequency.value = 55
    const kickEnv = context.createGain()
    kickEnv.gain.value = 0
    const noise = context.createBufferSource()
    const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    noise.buffer = buffer
    noise.loop = true
    const hatFilter = context.createBiquadFilter()
    hatFilter.type = 'highpass'
    hatFilter.frequency.value = 5000
    const hatEnv = context.createGain()
    hatEnv.gain.value = 0
    const bass = context.createOscillator()
    bass.type = 'sawtooth'
    bass.frequency.value = 110
    const bassFilter = context.createBiquadFilter()
    bassFilter.type = 'lowpass'
    bassFilter.frequency.value = 600
    const bassEnv = context.createGain()
    bassEnv.gain.value = 0
    const wash = context.createBiquadFilter()
    wash.type = 'bandpass'
    wash.frequency.value = 1500
    wash.Q.value = 0.4
    const washEnv = context.createGain()
    washEnv.gain.value = 0
    kickOsc.connect(kickEnv).connect(analyser)
    noise.connect(hatFilter).connect(hatEnv).connect(analyser)
    bass.connect(bassFilter).connect(bassEnv).connect(analyser)
    noise.connect(wash).connect(washEnv).connect(analyser)
    analyser.connect(gain).connect(context.destination)
    const t0 = context.currentTime + 0.05
    const beat = 0.5 // seconds at 120 bpm
    for (let k = 0; k < 600; k++) {
      const t = t0 + k * beat
      const full = Math.floor(k / 16) % 2 === 0
      if (k % 16 === 0) {
        bassEnv.gain.setValueAtTime(full ? 0.5 : 0, t)
        washEnv.gain.setValueAtTime(full ? 1.2 : 0.25, t)
      }
      const hat = full ? 1 : 0.4
      if (full) {
        kickEnv.gain.setValueAtTime(1, t)
        kickEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
      }
      hatEnv.gain.setValueAtTime(0.4 * hat, t)
      hatEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.05)
      hatEnv.gain.setValueAtTime(0.25 * hat, t + beat / 2)
      hatEnv.gain.exponentialRampToValueAtTime(0.001, t + beat / 2 + 0.04)
    }
    kickOsc.start()
    noise.start()
    bass.start()
    testNodes = [kickOsc, noise, bass, kickEnv, hatEnv, hatFilter, bassFilter, bassEnv, wash, washEnv, gain]
  }

  // A heard beat. Not locked: it starts the clock again from itself and its gap to the last
  // goes into the period. Locked: one near a predicted beat pulls the phase and its gap feeds
  // the period; one off the clock is ignored, since a breakdown's stray hits dragged a locked
  // 0.5 s period to 0.57 and the phase 0.2 s late.
  function hear (t) {
    const c = beatClock
    const previous = c.next - c.period
    const error = Math.abs(t - previous) < Math.abs(t - c.next) ? t - previous : t - c.next
    let onClock = c.heardAt >= 0 && Math.abs(error) < CLOCK_WINDOW * c.period
    // Back from a breakdown the first kick puts the phase right outright: coasting 16 beats on a
    // period 8 ms out left the drop 0.13 s off, outside the window, and a lock that ignores
    // off-clock beats then never heard the song again.
    const returning = c.locked && c.missed >= CLOCK_HEARING
    if (returning && !onClock) {
      const number = c.index + 1 + Math.round((t - c.next) / c.period)
      c.next = t + (c.index + 1 - number) * c.period
      c.sectionAt = number
      c.hit = true
      c.missed = 0
      c.heardAt = t
      fits.length = 0
      fits.push([number, t])
      return
    }
    if (c.locked && !onClock) return
    if (c.heardAt >= 0) {
      let gap = t - c.heardAt
      while (gap > 1) gap /= 2
      while (gap < 1 / 3) gap *= 2
      gaps.push(gap)
      if (gaps.length > 12) gaps.shift()
      if (gaps.length >= 3 && fits.length < 8) {
        const sorted = [...gaps].sort((a, b) => a - b)
        c.period += (sorted[sorted.length >> 1] - c.period) * 0.5
      }
    }
    c.heardAt = t
    if (onClock) {
      // The kick back after a breakdown, or the lock's first beat: the phrase counts from here.
      const number = Math.abs(t - previous) < Math.abs(t - c.next) ? c.index : c.index + 1
      if (c.missed >= CLOCK_HEARING) c.sectionAt = number
      // The period from a straight line through the on-clock beats by number: the median gap
      // was 8 ms out, which coasting through a breakdown turns into 0.13 s.
      fits.push([number, t])
      if (fits.length > 32) fits.shift()
      if (fits.length >= 8) {
        let sn = 0, st = 0, snn = 0, snt = 0
        for (const [n, x] of fits) { sn += n; st += x; snn += n * n; snt += n * x }
        const k = fits.length
        const slope = (k * snt - sn * st) / (k * snn - sn * sn)
        if (slope > 1 / 3 && slope < 1) c.period = slope
      }
      c.next += error * CLOCK_PULL
      c.onClock++
      c.hit = true
      if (c.onClock >= CLOCK_LOCK) c.locked = true
    } else {
      // A new run of beats, numbered from here: the phrase counts from its first beat, not the
      // fourth where the lock comes (counted from the lock, the test's drop missed its pot).
      c.onClock = 0
      c.next = t + c.period
      c.sectionAt = c.index
      fits.length = 0
      fits.push([c.index, t])
    }
  }
  // The predicted beats passing: a tick on the frame one falls in; a predicted beat with no
  // on-clock beat heard since the last is a miss, and CLOCK_COAST misses drop the lock.
  function tickClock () {
    const c = beatClock
    c.tick = false
    if (c.heardAt < 0) return
    while (clock >= c.next + c.period * CLOCK_WINDOW) {
      c.next += c.period
      c.index++
      c.tick = c.locked
      if (c.hit) c.missed = 0; else c.missed++
      c.hit = false
      if (c.missed > CLOCK_COAST) { c.locked = false; c.onClock = 0 }
    }
  }
  // The activity, once a frame, from the bins already read.
  function activity (dt) {
    let loud = 0
    for (let k = 1; k < bins.length; k++) loud += bins[k]
    loud /= (bins.length - 1) * 255
    // A band is sounding within ACTIVITY_SPREAD of the loudest (the bytes are decibels, 80 dB
    // across, so 0.375 is 30 dB): a fixed floor read every band as sounding all song long.
    let loudest = 0
    for (let i = 0; i < ACTIVITY_BANDS; i++) {
      bandLevels[i] = band([40 * Math.pow(300, i / ACTIVITY_BANDS), 40 * Math.pow(300, (i + 1) / ACTIVITY_BANDS)])
      if (bandLevels[i] > loudest) loudest = bandLevels[i]
    }
    let sounding = 0
    for (let i = 0; i < ACTIVITY_BANDS; i++) if (bandLevels[i] > 0.1 && bandLevels[i] > loudest - ACTIVITY_SPREAD) sounding++
    while (onsetTimes.length && clock - onsetTimes[0] > 4) onsetTimes.shift()
    const values = { loud, full: sounding / ACTIVITY_BANDS, onsets: onsetTimes.length / 4 }
    let sum = 0
    if (clock - startedAt < 1) return // the first second is the silence before the music
    for (const [k, f] of Object.entries(features)) {
      const x = values[k]
      if (!f.seen) { f.v = x; f.lo = x; f.hi = x; f.seen = true }
      f.v += (x - f.v) * Math.min(1, dt / ACTIVITY_SMOOTH)
      // The held range creeps back toward now over the memory, so a song's quiet intro does
      // not make every later bar read as full.
      f.hi = Math.max(f.v, f.hi - (f.hi - f.v) * Math.min(1, dt / ACTIVITY_MEMORY))
      f.lo = Math.min(f.v, f.lo + (f.v - f.lo) * Math.min(1, dt / ACTIVITY_MEMORY))
      const span = f.hi - f.lo
      levels.parts[k] = span > 0.02 * Math.max(0.05, f.hi) ? (f.v - f.lo) / span : 0.5
      sum += levels.parts[k]
    }
    const target = sum / 3
    levels.relative = target // the old activity, against the song so far: kept for the log, not used (the intro read as busy)
  }

  return {
    levels,
    get enabled () { return enabled },
    get source () { return source },
    get error () { return error },
    get errorKind () { return errorKind },
    get running () { return !!context && context.state === 'running' },
    // Start listening from `which` ('mic', 'system', 'test' or 'file'). Call from a user gesture.
    // Frames are { frames, binHz, clock: () => the song's seconds, from: the first frame's index }:
    // no audio is opened; each update hears every frame up to the clock (see replay).
    // A file is { data: an ArrayBuffer of an audio file, audible: whether it is heard too }: the
    // page plays it, so the lamp hears it exactly, from the top (Robert's test song, C-C). Or from
    // `at` seconds in, with `warm` seconds before that heard first, offline and silently, so the
    // detector meets the moment with the song's history behind it, not cold (its reference and
    // histories run over 8 s and more; played cold, 0:55 is not the 0:55 of the whole song).
    // quiet: no click behind this start (see open); only the microphone, and only once it is allowed, can start so.
    async start (which = source, file, quiet = false) {
      error = ''
      errorKind = ''
      try {
        if (which !== 'frames') await open(quiet)
        closeSource()
        source = which
        levelled = ''
        if (which === 'test') startTest()
        else if (which === 'frames') replay = { frames: file.frames, binHz: file.binHz, clock: file.clock, next: Math.max(0, Math.floor(file.from || 0)) }
        else if (which === 'file') {
          const buffer = await context.decodeAudioData(file.data.slice(0))
          const play = context.createBufferSource()
          play.buffer = buffer
          play.connect(analyser)
          const out = context.createGain()
          out.gain.value = file.audible ? 1 : 0
          analyser.connect(out).connect(context.destination)
          // The song's own sound, for recording the lamp with it (app.js, Record): exact, with
          // no screen share and no loopback.
          const record = context.createMediaStreamDestination()
          play.connect(record)
          fileStream = record.stream
          play.onended = () => { if (testNodes && testNodes[0] === play && onFileEnd) onFileEnd() }
          const at = Math.max(0, Math.min(buffer.duration, Number(file.at) || 0))
          warmFrames = at > 0 && file.warm > 0 ? await renderFrames(buffer, Math.max(0, at - file.warm), at) : null
          warmBinHz = buffer.sampleRate / FFT
          play.start(0, at)
          fileStartedAt = context.currentTime - at
          testNodes = [play, out, record]
        } else if (which === 'system') {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) throw Object.assign(new Error('this browser cannot share its audio; use Mic'), { kind: 'unsupported' })
          // The browser only offers audio with a screen share, so a share is asked for; the
          // picture is stopped at once and never drawn, kept or sent.
          stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, systemAudio: 'include', selfBrowserSurface: 'exclude', surfaceSwitching: 'include' })
          for (const t of stream.getVideoTracks()) { t.stop(); stream.removeTrack(t) }
          if (!stream.getAudioTracks().length) throw Object.assign(new Error('no audio was shared: turn on "Also share tab audio" (or "Also share system audio") in the dialog'), { kind: 'noaudio' })
          context.createMediaStreamSource(stream).connect(analyser)
        } else {
          const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
          // The chosen input is this machine's: gone (unplugged, or a setup from another computer), the default is heard.
          if (device) audio.deviceId = { exact: device }
          try { stream = await navigator.mediaDevices.getUserMedia({ audio, video: false }) } catch (e) {
            if (!device || (e.name !== 'OverconstrainedError' && e.name !== 'NotFoundError')) throw e
            delete audio.deviceId
            stream = await navigator.mediaDevices.getUserMedia({ audio, video: false })
          }
          context.createMediaStreamSource(stream).connect(analyser)
        }
        const track = stream && stream.getAudioTracks()[0]
        if (track) { const heard = stream; track.addEventListener('ended', () => { if (stream === heard && onSourceEnd) onSourceEnd() }) }
        levelled = which === 'system' ? 'system' : which === 'mic' && track && LOOPBACK.test(track.label) ? 'loopback' : ''
        levelPeak = LEVEL_START
        if (levelled) try { const v = parseFloat(localStorage.getItem(LEVEL_KEY + levelled)); if (v > -90 && v < 0) levelPeak = v } catch (e) {}
        enabled = true
        bassAverage = 0; beatPeak = 0; surgeFast = surgeSlow = sectionPower = 0; peakDb = -90; floorDrop = 0; farFromFloor = 0; breadth = 0; breadthPeak = 0.05; score = null; levels.calm = true; levels.drop = false; bassPowerAverage = midsPowerAverage = 0; bassHistory.fill(0); midsHistory.fill(0); lastBeat = -1; beatCount = 0; beatTimes.length = 0; lastBoom = -1e9; lastClap = -1e9; clapHistory.length = 0; boomPeak = -90; boomArmed = null; subHistory.length = 0; lowHistory.length = 0; scoreHistory.length = 0; recentBeats.length = 0; musicBeats.length = 0; sections.reset(); lastBandJump = -1e9; lastSwitch = -1e9; brightHistory.length = 0; levels.wobble = 0; levels.wobbleRun = 0; wobbleArmed = true; bandHistory.length = 0; stabPending = null; for (const e of Object.values(envs)) e.reset(); waits.reset(); wobbleLevels.length = 0
        Object.assign(beatClock, { locked: false, period: 0.5, next: 0, index: 0, onClock: 0, missed: 0, tick: false, hit: false, heardAt: -1, sectionAt: 0 }); gaps.length = 0; fits.length = 0
        for (const f of Object.values(features)) f.seen = false
        onsetTimes.length = 0; levels.activity = 0.5; levels.sinceBeat = 0; startedAt = clock
      } catch (e) {
        enabled = false
        error = e && e.message ? e.message : String(e)
        const name = e && e.name
        errorKind = e && e.kind ? e.kind
          : name === 'InvalidStateError' ? 'gesture' // a share asked for with no click behind it
            : name === 'NotAllowedError' ? (which === 'system' ? (/system/i.test(error) ? 'blocked' : 'cancelled') : 'denied')
              : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'nodevice'
                : name === 'NotSupportedError' ? 'unsupported' : 'other'
        closeSource()
        throw e
      }
    },
    stop () {
      saveLevel()
      enabled = false
      closeSource()
      levels.heat = levels.eddy = levels.kick = levels.level = 0
      levels.beat = false
    },
    // Once a frame: read the analyser and update `levels`. `ranges` gives each sync its band in
    // Hz ({ beat, heat, eddy, kick }, each [lo, hi]); `sensitivity` scales them.
    update (dt, sensitivity = 1, ranges, frame) {
      if (replay && !frame) {
        // Every frame up to the clock, at the song's own rate whatever the screen's or the
        // playback's; the one-frame events of the last few reported together. A longer catch up (the
        // warm seconds, or a stall) is heard, its events not: they are past.
        const r = replay
        const target = Math.min(r.frames.length, Math.floor(r.clock() * ANALYSIS_RATE))
        const caught = {}
        const caughtSections = {}
        let kind = ''
        let heard = false
        while (r.next < target && replay === r) {
          this.update(1 / ANALYSIS_RATE, sensitivity, ranges, { bins: r.frames[r.next++], binHz: r.binHz })
          heard = true
          if (r.next < target - REPLAY_REPORT) continue
          for (const k of FRAME_EVENTS) if (levels[k]) caught[k] = true
          if (levels.sections) for (const k of SECTION_EVENTS) if (levels.sections[k]) caughtSections[k] = true
          if (levels.drop) kind = levels.dropKind
        }
        for (const k of FRAME_EVENTS) levels[k] = !!caught[k]
        if (levels.sections) for (const k of SECTION_EVENTS) levels.sections[k] = !!caughtSections[k]
        if (caught.drop) levels.dropKind = kind
        if (!heard) { beatClock.tick = false; beatClock.hit = false }
        return levels
      }
      if (warmFrames && !frame) {
        const warm = warmFrames
        warmFrames = null
        for (const b of warm) this.update(1 / ANALYSIS_RATE, sensitivity, ranges, { bins: b, binHz: warmBinHz })
        enabled = true
        waited = 0
      }
      levels.beat = false
      levels.hat = false
      levels.boom = false
      levels.bassNote = false
      levels.snare = false
      // Heard at ANALYSIS_RATE whatever the screen's rate: the beat's rise is over
      // BEAT_RISE_FRAMES frames and the lamp was tuned at 60 of them a second. At 120 a second
      // the rise was over half the time, and C-C's drop at 0:55 went (a false one at 0:27.7, and
      // none at all live in Chrome at 120 Hz). Between, only the one-frame events are cleared.
      // The time left over is kept, so at 97 a second (every other frame heard, 48 a second, with
      // it thrown away) it still averages ANALYSIS_RATE.
      waited += dt
      if (waited < 1 / ANALYSIS_RATE - 0.001) {
        for (const k of FRAME_EVENTS) levels[k] = false
        if (levels.sections) for (const k of SECTION_EVENTS) levels.sections[k] = false
        beatClock.tick = false
        beatClock.hit = false
        return levels
      }
      if (waited < 2 / ANALYSIS_RATE) { dt = 1 / ANALYSIS_RATE; waited -= dt } else { dt = waited; waited = 0 } // a slow screen: every frame heard, as before
      if (frame) {
        // A frame given rather than read (docs/methods/tools/song-scan.js runs a whole song
        // through this offline, faster than it plays): its bytes and Hz a bin.
        if (!bins || bins.length !== frame.bins.length) bins = new Uint8Array(frame.bins.length)
        bins.set(frame.bins)
        binHz = frame.binHz
        if (!enabled) { enabled = true; startedAt = clock }
      } else {
        if (!enabled || !analyser) return levels
        analyser.getByteFrequencyData(bins)
      }
      clock += dt
      // The bands' envelopes (see SHAPE_TRIGGERS): given with the frame, or read live for the shapes that are on.
      const given = frame && frame.bins && frame.bins.shapes
      if (given) { for (const b in envs) if (given[b]) envs[b].push(given[b]) } else if (!frame && timeAnalyser) { for (const b in SHAPE_BANDS_OF) if (SHAPE_BANDS_OF[b].some(k => shapeOn[k])) readBand(b, ranges) }
      const quiet = levels.quiet
      const raw = levels.raw
      raw.beat = band(ranges.beat); raw.heat = band(ranges.heat); raw.eddy = band(ranges.eddy); raw.kick = band(ranges.kick)
      // Each sync follows its range's punch, how far it is above its own average over the last
      // PUNCH_AVERAGE seconds, not its loudness: a song's bass sits near 0.8 of full scale the
      // whole way through, and driven by loudness the floor stayed at three times its heat.
      for (const k of ['heat', 'eddy', 'kick']) {
        averages[k] += (raw[k] - averages[k]) * Math.min(1, dt / PUNCH_AVERAGE)
        const punch = Math.max(0, raw[k] - averages[k]) / Math.max(0.05, averages[k])
        levels[k] = ease(levels[k], Math.min(1.5, punch * sensitivity), dt)
      }
      levels.level = ease(levels.level, Math.min(1.5, (raw.heat + raw.eddy + raw.kick) / 3 * sensitivity), dt)
      // A hat: the same test on the kick range, quicker (a hi-hat runs eighths and sixteenths).
      hatAverage += (raw.kick - hatAverage) * Math.min(1, dt / 0.6)
      if (hatTopOn) {
        const top = 10 * Math.log10(power(HAT_TOP_BAND) + 1e-12)
        if (topHistory.length === HAT_TOP_FRAMES && top - Math.min(...topHistory) > HAT_TOP_RISE && clock - lastHat > HAT_TOP_REFRACTORY) { levels.hat = true; onsetTimes.push(clock); lastHat = clock }
        topHistory.push(top)
        if (topHistory.length > HAT_TOP_FRAMES) topHistory.shift()
      } else if (raw.kick > 0.04 && raw.kick > hatAverage * (1.25 / Math.max(0.3, Math.sqrt(sensitivity))) && clock - lastHat > 0.11) {
        const fire = () => { levels.hat = true; onsetTimes.push(clock) }
        if (!shapeOn.hat || !envs.kick.length) { fire(); lastHat = clock } else {
          const hit = hitIn(envs.kick)
          if (hit.rise >= HAT_RISE) { lastHat = clock; waits.wait(envs.kick, hit, 30, (e, h) => tailOf(e, h, 15, 30) < HAT_TAIL, fire) }
        }
      }
      // The snare (see SNARE_BODY).
      if (snareOn) {
        const now = [SNARE_BODY, SNARE_RATTLE, SNARE_TOP, SNARE_LOW].map(r => 10 * Math.log10(power(r) + 1e-12))
        if (snareHistory.length === SNARE_FRAMES) {
          const up = now.map((v, j) => v - Math.min(...snareHistory.map(h => h[j])))
          if (up[0] > SNARE_BODY_RISE && up[1] > SNARE_RATTLE_RISE && up[2] > SNARE_TOP_RISE && up[3] < up[0] && clock - lastSnare > SNARE_REFRACTORY) { levels.snare = true; lastSnare = clock }
        }
        snareHistory.push(now)
        if (snareHistory.length > SNARE_FRAMES) snareHistory.shift()
      }
      // The beat, in power (see BEAT_POWER_RISE): the rise over the last few frames against the
      // range's own average, so a held note counts for nothing and only a hit's attack does (by
      // energy against its average a bass line hid half the test's kicks), and against the mids'.
      bassAverage += (raw.beat - bassAverage) * Math.min(1, dt / BEAT_AVERAGE)
      const bassPower = power(ranges.beat)
      const midsPower = power(BEAT_MIDS)
      const bassRise = Math.max(0, bassPower - Math.min(...bassHistory)) / Math.max(1e-9, bassPowerAverage)
      const midsRise = Math.max(0, midsPower - Math.min(...midsHistory)) / Math.max(1e-9, midsPowerAverage)
      bassHistory.shift(); bassHistory.push(bassPower)
      midsHistory.shift(); midsHistory.push(midsPower)
      bassPowerAverage += (bassPower - bassPowerAverage) * Math.min(1, dt / BEAT_AVERAGE)
      midsPowerAverage += (midsPower - midsPowerAverage) * Math.min(1, dt / BEAT_AVERAGE)
      raw.rise = bassRise
      raw.midsRise = midsRise
      // Near the recent kicks too, within 12 dB (a sixteenth of their power), so in a breakdown
      // the leak of hats and pads into the bass does not count.
      beatPeak = Math.max(bassPower, beatPeak - (beatPeak - bassPower) * Math.min(1, dt / BEAT_PEAK_MEMORY))
      // The cut (see CUT_DB): the bass and the sub together, against the kicks' held peak.
      const lowPower = power([20, ranges.beat[1]])
      let low = 0
      let lowCounted = 0
      for (const [t, under] of lowHistory) if (clock - t >= CUT_SKIP) { lowCounted++; if (under) low++ }
      raw.cut = lowCounted ? low / lowCounted : 0
      const cutBefore = lowCounted > 0 && clock - lowHistory[0][0] >= CUT_TIME + CUT_SKIP - 0.05 && low >= CUT_SHARE * lowCounted
      lowHistory.push([clock, lowPower < beatPeak * Math.pow(10, -CUT_DB / 10)])
      while (lowHistory.length && clock - lowHistory[0][0] > CUT_TIME + CUT_SKIP) lowHistory.shift()
      // The attack: given with the frame (a tool's scan reads it from the song), or read from the input.
      let shape = frame ? frame.shape || (frame.bins && frame.bins.shape) : null
      if (!shape && attackOn && !frame && timeAnalyser) { bassHp.frequency.value = ranges.beat[0]; bassLp.frequency.value = ranges.beat[1]; timeAnalyser.getFloatTimeDomainData(timeData); shape = shapeOf(timeData, context.sampleRate) }
      if (shape) { raw.attackRise = shape.rise; raw.attackMs = shape.attack; if (shape.rise >= ATTACK_RISE && shape.attack >= ATTACK_MS[0] && shape.attack <= ATTACK_MS[1]) lastAttackAt = clock }
      const attackOk = !attackOn || clock - lastAttackAt <= ATTACK_FRAMES / ANALYSIS_RATE + 1e-6
      // The pump (see PUMP_PEG) and the bass line's onsets (see BASS_BAND), from the bytes of the frames before.
      let pumped = false
      let bassOnset = false
      if ((pumpOn || splitOn) && byteHistory.length === BEAT_RISE_FRAMES) {
        const riseOf = ([lo, hi]) => {
          const a = Math.min(bins.length - 1, Math.max(1, Math.floor(lo / binHz)))
          const b = Math.max(a, Math.min(bins.length - 1, Math.ceil(hi / binHz)))
          let x = 0
          for (let k = a; k <= b; k++) { let m = 255; for (const h of byteHistory) if (h[k] < m) m = h[k]; if (bins[k] > m) x += bins[k] - m }
          return x / (b - a + 1) * 80 / 255
        }
        if (pumpOn) {
          const f = riseOf(ranges.beat)
          const [f2, f1] = pumpFlux
          pumped = levels.pegged && f1 > PUMP_FLUX && f1 >= f2 && f1 >= f && f1 > pumpMidsFlux && clock - lastBeat > BEAT_REFRACTORY
          pumpFlux.shift(); pumpFlux.push(f)
          pumpMidsFlux = riseOf(BEAT_MIDS)
        }
        if (splitOn) {
          const a = Math.max(0, Math.floor(BASS_BAND[0] / binHz)), b = Math.min(bins.length - 1, Math.ceil(BASS_BAND[1] / binHz))
          const back = byteHistory[byteHistory.length - BASS_LAG]
          let x = 0
          for (let k = a; k <= b; k++) if (bins[k] > back[k]) x += bins[k] - back[k]
          bassFlux.push(x)
          if (bassFlux.length > ANALYSIS_RATE) bassFlux.shift()
          let mean = 0
          for (const v of bassFlux) mean += v
          mean /= bassFlux.length
          let sd = 0
          for (const v of bassFlux) sd += (v - mean) * (v - mean)
          sd = Math.sqrt(sd / bassFlux.length)
          const n = bassFlux.length, v = bassFlux[n - 2]
          bassOnset = n >= 3 && v > bassFlux[n - 3] && v >= bassFlux[n - 1] && v > mean + BASS_K * sd && v > BASS_FLOOR && clock - lastBassOnset > BASS_REFRACTORY
        }
      }
      if (pumpOn) levels.pegged = 10 * Math.log10(Math.max(1e-12, bassPowerAverage) / Math.max(1e-12, beatPeak)) > PUMP_PEG // for the next frame's pump
      if (pumpOn || splitOn) { const copy = byteHistory.length === BEAT_RISE_FRAMES ? byteHistory.shift() : new Uint8Array(bins.length); copy.set(bins); byteHistory.push(copy) }
      const heardBeat = at => {
        levels.beat = true
        beatCount++
        beatTimes.push(at)
        if (beatTimes.length > 9) beatTimes.shift()
        if (beatTimes.length >= 4) levels.bpm = Math.round(60 * (beatTimes.length - 1) / (beatTimes[beatTimes.length - 1] - beatTimes[0]))
        onsetTimes.push(at)
        hear(at)
      }
      // The low end's pitch (see SPLIT_BAND), and a beat waiting on its drop judged once SPLIT_FRAMES have passed.
      let pitch = 0
      if (splitOn) {
        const a = Math.max(1, Math.round(SPLIT_BAND[0] / binHz)), b = Math.min(bins.length - 1, Math.round(SPLIT_BAND[1] / binHz))
        let w = 0, q = 0
        for (let k = a; k <= b; k++) { const p = Math.pow(10, (bins[k] - 255) * 8 / 255); w += p * Math.log2(k * binHz); q += p }
        pitch = q > 0 ? w / q : 0
        if (splitPending) {
          const p = splitPending
          p.low = Math.min(p.low, pitch)
          p.frames++
          // A kick is heard the frame its drop passes SPLIT_DROP, most a frame after the hit; a bass note only after SPLIT_FRAMES.
          if (!p.heard && p.top - p.low > SPLIT_DROP) { heardBeat(p.at); p.heard = true }
          if (p.frames >= SPLIT_FRAMES) {
            const drop = p.top - p.low
            splitDrops.push(drop)
            if (splitDrops.length > SPLIT_MEMORY) splitDrops.shift()
            raw.drop = drop
            if (!p.heard) { if (drop > SPLIT_DROP) heardBeat(p.at); else levels.bassNote = true }
            splitPending = null
          }
        }
        if (bassOnset) { lastBassOnset = clock; bassPending.push({ at: clock - dt, frames: 0 }) }
        for (const o of bassPending) o.frames++
        for (const o of bassPending) if (o.frames >= SPLIT_FRAMES && Math.abs(o.at - lastCandidate) > BASS_NEAR && !(splitPending && Math.abs(o.at - splitPending.at) <= BASS_NEAR)) levels.bassNote = true
        bassPending = bassPending.filter(o => o.frames < SPLIT_FRAMES)
      }
      const beatRising = raw.beat > BEAT_FLOOR && bassPower > beatPeak / 16 && bassRise > BEAT_POWER_RISE / Math.max(0.3, Math.sqrt(sensitivity)) && bassRise > midsRise * BEAT_BASS_LEAD && clock - lastBeat > BEAT_REFRACTORY && attackOk
      if (beatRising || pumped) {
        const at = beatRising ? clock : clock - dt // a pump beat is heard at its peak, a frame back
        lastBeat = clock
        if (splitOn) {
          lastCandidate = at
          // Where this song's kicks do not sweep the beat is heard at once, as before, its drop only measured.
          const swept = splitDrops.length >= 8 && splitDrops.filter(d => d > SPLIT_SWEPT).length >= SPLIT_SHARE * splitDrops.length
          // The drop is measured from the candidate frame itself (see SPLIT_DROP's comment): a kick that has
          // already fallen that far from the frame before is heard now, the rest wait on the frames to come.
          const top = Math.max(pitch, pitchHistory.length ? pitchHistory[pitchHistory.length - 1] : 0)
          const heard = !swept || top - pitch > SPLIT_DROP
          splitPending = { at, top, low: pitch, frames: 0, heard }
          if (heard) heardBeat(at)
        } else heardBeat(at)
      }
      if (splitOn) { pitchHistory.push(pitch); if (pitchHistory.length > 2) pitchHistory.shift() }
      const kickGoneFor = levels.sinceBeat // seconds without a beat before this frame
      levels.sinceBeat = levels.beat ? 0 : levels.sinceBeat + dt
      // The boom (see BOOM_RISE), in the analyser's decibels: a byte is 80/255 dB.
      const subDb = -90 + band(BOOM_RANGE) * 80
      const lowDb = 10 * Math.log10(power([20, 150]) + 1e-12)
      const rising = subHistory.slice(-BEAT_RISE_FRAMES)
      let before = 0
      let counted = 0
      for (const [t, v] of subHistory) if (clock - t >= BOOM_GAP) { before += v; counted++ }
      boomPeak = Math.max(subDb, boomPeak - BOOM_PEAK_FALL * dt)
      raw.boomRise = rising.length ? subDb - Math.min(...rising.map(r => r[1])) : 0
      raw.boomOver = counted ? subDb - before / counted : 0
      if (rising.length === BEAT_RISE_FRAMES && counted && raw.boomRise > BOOM_RISE && raw.boomOver > BOOM_OVER && subDb > boomPeak - BOOM_PEAK && clock - lastBoom > BOOM_REFRACTORY && (!shapeOn.boom || swellOf(subHistory, subDb) >= BOOM_SWELL / 1000)) {
        boomArmed = { at: clock, max: lowDb }
        lastBoom = clock
      }
      // It fires at the note's peak, not its attack (Robert: "Those long big bwong sounds have like a
      // peak and slow fade, they should release at that peak"): on C-C the low end (20 to 150 Hz,
      // the sub and the note's body) peaks 0 to 0.55 s after the attack (0:55.07 at 0:55.33,
      // 1:02.22 at 1:02.35, 1:19.07 at 1:19.62). Armed at the attack, it fires the first frame the
      // low end is BOOM_FALL dB under its highest since, or BOOM_WAIT after the attack.
      if (boomArmed) {
        boomArmed.max = Math.max(boomArmed.max, lowDb)
        if (lowDb < boomArmed.max - BOOM_FALL || clock - boomArmed.at >= BOOM_WAIT) { levels.boom = true; boomArmed = null }
      }
      levels.boomPending = !!boomArmed
      // The clap (see CLAP_BAND).
      levels.clap = false
      {
        const clapDb = 10 * Math.log10(power(CLAP_BAND) + 1e-12)
        const bassDb = 10 * Math.log10(power([20, 150]) + 1e-12)
        const recent = clapHistory.slice(-BEAT_RISE_FRAMES)
        if (recent.length === BEAT_RISE_FRAMES && clapHistory.length > BEAT_RISE_FRAMES) {
          const lowest = Math.min(...recent.map(h => h[1]))
          const mean = clapHistory.reduce((a, h) => a + h[1], 0) / clapHistory.length
          const bassRise = bassDb - Math.min(...recent.map(h => h[2]))
          if (clapDb - lowest > CLAP_RISE) lastBandJump = clock
          const quietBeats = musicBeats.filter(t => clock - t <= CLAP_QUIET).length
          if (clapDb - lowest > CLAP_RISE && clapDb - mean > CLAP_OVER && bassRise < clapDb - lowest - CLAP_BASS && levels.calm && quietBeats < CLAP_BEATS && levels.powerDb < CLAP_ROOM && clock - lastClap > CLAP_REFRACTORY) {
            if (!shapeOn.clap || !envs.kick.length) { levels.clap = true; lastClap = clock } else {
              const hit = hitIn(envs.kick)
              if (hit.attack <= CLAP_ATTACK && hit.rise >= CLAP_SPIKE) { lastClap = clock; waits.wait(envs.kick, hit, 40, (e, h) => tailOf(e, h, 15, 40) < CLAP_TAIL, () => { levels.clap = true }) }
            }
          }
        }
        clapHistory.push([clock, clapDb, bassDb])
        while (clapHistory.length && clock - clapHistory[0][0] > CLAP_BEFORE) clapHistory.shift()
      }
      waits.judge() // the hats and claps whose tails are heard now
      subHistory.push([clock, subDb])
      while (subHistory.length && clock - subHistory[0][0] > BOOM_BEFORE) subHistory.shift()
      const total = power([40, 12000])
      if (!surgeSlow) surgeFast = surgeSlow = total
      surgeFast += (total - surgeFast) * Math.min(1, dt / SURGE_FAST)
      surgeSlow += (total - surgeSlow) * Math.min(1, dt / SURGE_SLOW)
      levels.surge = surgeFast / Math.max(1e-9, surgeSlow)
      raw.total = total
      if (!sectionPower) sectionPower = total
      sectionPower += (total - sectionPower) * Math.min(1, dt / SECTION_SMOOTH)
      const db = 10 * Math.log10(Math.max(1e-12, sectionPower))
      const fastDb = 10 * Math.log10(Math.max(1e-12, surgeFast))
      peakDb = Math.max(db, peakDb - REFERENCE_FALL * dt)
      if (db - quiet > LEVEL_SILENT) levelPeak = Math.max(db - quiet, levelPeak - LEVEL_FORGET * dt) // as the source played it, before the lift; a pause forgets nothing
      if (clock - levelSaved > 10) saveLevel()
      // Lifted to the files' level (see LEVEL_LOUD): the analyser's decibel window moved down by as
      // much, so the bytes read as the file's would. Adding to the bytes instead lost what had sunk
      // under the window's floor (C-C so lifted to its own level still read a false drop at 0:36).
      const wantQuiet = !levelled || frame ? 0 : Math.max(0, Math.min(LEVEL_MOST, LEVEL_LOUD - levelPeak))
      if (analyser && Math.abs(wantQuiet - levels.quiet) >= 0.1) {
        levels.quiet = wantQuiet
        analyser.minDecibels = MIN_DB - wantQuiet
        analyser.maxDecibels = MAX_DB - wantQuiet
      }
      const floorTop = REFERENCE_DB - 10 * Math.log10(Math.max(0.2, sensitivity))
      if (db > floorTop + floorDrop - FLOOR_NEAR) { farFromFloor = 0; floorDrop = Math.min(0, floorDrop + FLOOR_FALL * dt) } else farFromFloor += dt
      if (farFromFloor > FLOOR_PATIENCE) floorDrop = Math.max(FLOOR_LOWEST - floorTop, floorDrop - FLOOR_FALL * dt)
      const reference = Math.max(peakDb, floorTop + floorDrop)
      let byteSum = 0
      for (let k = 1; k < bins.length; k++) byteSum += bins[k]
      breadth += (byteSum / ((bins.length - 1) * 255) - breadth) * Math.min(1, dt)
      breadthPeak = Math.max(breadth, breadthPeak * (1 - BREADTH_FALL * dt))
      const now = db - reference + BREADTH_WEIGHT * 10 * Math.log10(Math.max(1e-3, breadth) / Math.max(0.05, breadthPeak))
      score = score === null ? now : score + (now - score) * Math.min(1, dt / SCORE_SMOOTH)
      levels.powerDb = db
      levels.reference = reference
      levels.score = score
      levels.drop = false
      levels.dropKind = '' // which rule called a drop: 'tempo', 'cut' (the bass back after a cut, or the kick back) or 'surge'
      // The wobble (see WOBBLE_BAND).
      {
        const a = Math.max(1, Math.floor(WOBBLE_BAND[0] / binHz))
        const b = Math.min(bins.length - 1, Math.ceil(WOBBLE_BAND[1] / binHz))
        let weighted = 0
        let sum = 0
        for (let k = a; k <= b; k++) { const p = Math.pow(10, (bins[k] - 255) * 8 / 255); weighted += p * k; sum += p }
        const sounding = sum > 0 && 10 * Math.log10(sum / (b - a + 1)) > reference - WOBBLE_DB
        wobbleLevels.push(10 * Math.log10(sum / (b - a + 1) + 1e-12))
        if (wobbleLevels.length > WOBBLE_WINDOW * ANALYSIS_RATE) wobbleLevels.shift()
        brightHistory.push([clock, sounding ? Math.log2(weighted / sum * binHz) : null])
        while (brightHistory.length && clock - brightHistory[0][0] > WOBBLE_WINDOW) brightHistory.shift()
        const v = brightHistory.map(h => h[1]).filter(x => x !== null)
        let spread = 0
        if (v.length > brightHistory.length * 0.8 && clock - brightHistory[0][0] > WOBBLE_WINDOW * 0.9) {
          const mean = v.reduce((x, y) => x + y, 0) / v.length
          spread = Math.sqrt(v.reduce((x, y) => x + (y - mean) * (y - mean), 0) / v.length)
        }
        raw.wobble = spread
        levels.wobble = Math.max(0, Math.min(1, (spread - WOBBLE_LO) / (WOBBLE_HI - WOBBLE_LO)))
        levels.wobbleNote = false
        // The stab (see STAB_BANDS).
        levels.stab = false
        const bandsNow = STAB_BANDS.map(r => 10 * Math.log10(power(r) + 1e-12))
        if (levels.beat && levels.calm && clock - startedAt > SETTLE && bandHistory.length) {
          const old = bandHistory.filter(h => clock - h[0] >= STAB_GAP)
          if (old.length) stabPending = { at: clock, before: bandsNow.map((_, j) => old.reduce((a, h) => a + h[1][j], 0) / old.length), peak: bandsNow.slice() }
        } else if (stabPending) stabPending.peak = stabPending.peak.map((v, j) => Math.max(v, bandsNow[j]))
        if (stabPending && clock - stabPending.at >= STAB_AFTER) {
          const rise = stabPending.peak.map((v, j) => v - stabPending.before[j])
          if (rise[0] >= STAB_BASS && Math.min(...rise.slice(1)) >= STAB_REST && (!shapeOn.stab || !envs.mids.length || hitIn(envs.mids, 130).attack <= STAB_ATTACK)) levels.stab = true
          stabPending = null
        }
        bandHistory.push([clock, bandsNow])
        while (bandHistory.length && clock - bandHistory[0][0] > STAB_BEFORE) bandHistory.shift()
        const now = brightHistory[brightHistory.length - 1][1]
        if (levels.wobble > 0) wobbleSeen = clock
        else if (clock - wobbleSeen > WOBBLE_RUN_END) levels.wobbleRun = 0
        if (spread > 0 && now !== null) {
          const mean = v.reduce((x, y) => x + y, 0) / v.length
          if (now < mean) wobbleArmed = true
          else if (wobbleArmed && now > mean + spread / 4 && levels.wobble > 0 && (!shapeOn.wobbleNote || periodicOf(wobbleLevels, 7, 30) >= WOBBLE_PERIODIC)) { wobbleArmed = false; levels.wobbleNote = true; levels.wobbleRun++ }
        }
      }
      if (!scoreHistory.length || clock - scoreHistory[scoreHistory.length - 1][0] >= 0.1) scoreHistory.push([clock, score])
      while (scoreHistory.length && clock - scoreHistory[0][0] > CUT_BEFORE) scoreHistory.shift()
      if (levels.beat && clock - lastBandJump > CLAP_SNAP_BEAT) { musicBeats.push(clock); while (musicBeats.length && clock - musicBeats[0] > CLAP_QUIET) musicBeats.shift() }
      if (levels.beat) { recentBeats.push(clock); while (recentBeats.length && clock - recentBeats[0] > TEMPO_TO + 2) recentBeats.shift() }
      const tempoSwitched = () => {
        if (levels.calm || recentBeats.length < TEMPO_NEW + 2) return false
        const gaps = []
        for (let j = recentBeats.length - TEMPO_NEW; j < recentBeats.length; j++) gaps.push(recentBeats[j] - recentBeats[j - 1])
        const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length
        if (gaps.some(g => Math.abs(g - mean) > TEMPO_AGREE * mean)) return false
        const before = []
        for (let j = 1; j < recentBeats.length; j++) { const age = clock - recentBeats[j]; if (age >= TEMPO_FROM && age <= TEMPO_TO) before.push(recentBeats[j] - recentBeats[j - 1]) }
        if (before.length < 5) return false
        const median = before.slice().sort((a, b) => a - b)[Math.floor(before.length / 2)]
        if (before.filter(g => Math.abs(g - median) <= 0.15 * median).length < TEMPO_STEADY * before.length) return false
        const r = mean / median
        return Math.min(Math.abs(r - 1), Math.abs(r / 0.5 - 1), Math.abs(r / 2 - 1)) > TEMPO_OFF
      }
      const dippedBefore = () => scoreHistory.some(([t, v]) => clock - t > CUT_TIME + CUT_SKIP && v < CUT_BEFORE_SCORE)
      if (clock - startedAt > SETTLE) {
        if (levels.beat && clock - lastSwitch > TEMPO_TO && tempoSwitched()) { levels.drop = true; levels.calm = false; droppedAt = clock; lastSwitch = clock; levels.dropKind = 'tempo' }
        else if (levels.beat && ((cutBefore && dippedBefore()) || kickGoneFor >= KICK_GONE) && 10 * Math.log10(Math.max(1e-12, total)) > reference - CUT_LEVEL) { levels.drop = true; levels.calm = false; droppedAt = clock; levels.dropKind = 'cut' }
        else if (levels.calm && levels.surge > DROP_SURGE && fastDb > reference - DROP_DB) { levels.drop = true; levels.calm = false; droppedAt = clock; levels.dropKind = 'surge' }
        else if (levels.calm && score > -BUSY_DB) levels.calm = false
        else if (!levels.calm && score < -CALM_DB && clock - droppedAt > DROP_HOLD) levels.calm = true
      }
      // The song's parts around a drop: a snare roll, an impact, a riser, half time, a key change (sections.js).
      levels.sections = sections.update(clock, power, bins, binHz, levels.beat, total, { on: shapeOn, envs })
      // The activity, for the knobs it scales: 0 at 12 dB under the reference to 1 at it.
      levels.activity = Math.max(0, Math.min(1, (db - reference + 12) / 12))
      tickClock()
      activity(dt)
      return levels
    },
    get beats () { return beatCount },
    get levelPeak () { return levelPeak }, // the loudest this source has played (see LEVEL_LOUD)
    get time () { return clock }, // seconds this module has been listening, all told
    get fileStream () { return source === 'file' ? fileStream : null },
    set onFileEnd (f) { onFileEnd = f },
    set onSourceEnd (f) { onSourceEnd = f },
    get filePosition () { return replay ? replay.clock() : source === 'file' && context ? context.currentTime - fileStartedAt : -1 }, // seconds into a playing file
    // The beat clock: locked or not, whether the kick is being heard (not in a breakdown), the
    // period, seconds to the next predicted beat (number index + 1), the beat the current
    // section began on, and whether a predicted beat fell in this frame.
    get clock () { return { locked: beatClock.locked, hearing: beatClock.locked && beatClock.missed < CLOCK_HEARING, period: beatClock.period, until: beatClock.next - clock, index: beatClock.index, sectionAt: beatClock.sectionAt, tick: beatClock.tick } },
    // The analyser's last frame of bins (0 to 255) and Hz a bin, for the spectrum view.
    spectrum () { return bins && enabled ? { bins, binHz } : null },
    // The audio inputs this browser can choose between; their names are only given once a
    // microphone permission has been granted, so the list is asked for again after listening.
    async inputs () {
      try { return (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput').map(d => ({ id: d.deviceId, label: d.label || 'Input' })) } catch (e) { return [] }
    },
    get device () { return device },
    get attack () { return attackOn }, // the attack in the beat, off as tuned (see ATTACK_RISE)
    set attack (v) { attackOn = shapeOn.beat = !!v },
    // Each trigger's shape (SHAPE_TRIGGERS), as { beat, hat, ... }: true or false, a trigger left out off; true or false for all.
    // The four fitted options, on; each setter clears its own state, so a tool can turn one off mid-song to measure.
    get pump () { return pumpOn }, // the pump, a kick in a sidechained drop (PUMP_PEG)
    set pump (v) { pumpOn = !!v; levels.pegged = false; pumpFlux[0] = pumpFlux[1] = 0 },
    get hatTop () { return hatTopOn }, // the hat from the top of the spectrum (HAT_TOP_BAND)
    set hatTop (v) { hatTopOn = !!v; topHistory.length = 0 },
    get snare () { return snareOn }, // the snare, a backbeat's hit (SNARE_BODY); levels.snare
    set snare (v) { snareOn = !!v; snareHistory.length = 0 },
    get split () { return splitOn }, // the beat split into kicks and bass notes (SPLIT_DROP)
    set split (v) { splitOn = !!v; splitPending = null; bassPending = []; splitDrops.length = 0; bassFlux.length = 0; pitchHistory.length = 0 },
    get shapes () { return { ...shapeOn } },
    set shapes (v) { for (const k of SHAPE_TRIGGERS) shapeOn[k] = v === true || !!(v && v[k]); attackOn = shapeOn.beat },
    get stream () { return stream }, // the mic or tab stream being heard, for a tool to record (its tap along)
    set device (id) { device = id || '' },
    get bassAverage () { return bassAverage }
  }
}
