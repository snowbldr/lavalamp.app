// Claude Code hooks for the talk record. Two modes:
//   stop   (Stop hook)         nag when lamp code changed but docs/decisions.md did not,
//                              and point out commits since the last checkpoint tag
//   start  (SessionStart hook) hand the session the last checkpoint and the last log entry
// Prints hook JSON on stdout. Never fails the hook: every path exits 0.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const mode = process.argv[2] || 'stop'
const git = (...args) => { try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return '' } }
const out = value => { process.stdout.write(JSON.stringify(value) + '\n'); process.exit(0) }

let input = {}
try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}') } catch {}

try {
  const lastTag = git('describe', '--tags', '--match', 'checkpoint-*', '--abbrev=0')

  if (mode === 'start') {
    let entry = ''
    try {
      const log = fs.readFileSync(path.join(root, 'docs/decisions.md'), 'utf8')
      const at = log.lastIndexOf('\n## ')
      entry = (at >= 0 ? log.slice(at + 1) : log).split('\n').slice(0, 40).join('\n')
    } catch {}
    out({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: `This project is also the material for a talk about directing AI as the engineer. Keep docs/decisions.md current and tag checkpoints; see CLAUDE.md. Last checkpoint tag: ${lastTag || 'none'}. Most recent decision log entry:\n${entry}` } })
  }

  const codeChanged = git('status', '--porcelain', '--', 'src', 'index.html', 'experiments')
  // docs/ is its own repository (private, github.com/snowbldr/lavalamp-docs), ignored by this one.
  // The log counts as updated if it is dirty there or its last commit is newer than the lamp's.
  let logChanged = git('-C', 'docs', 'status', '--porcelain', '--', 'decisions.md')
  if (!logChanged && Number(git('-C', 'docs', 'log', '-1', '--format=%ct') || 0) > Number(git('log', '-1', '--format=%ct') || 0)) logChanged = 'newer'
  const docsUnpushed = (git('-C', 'docs', 'status', '--porcelain') || Number(git('-C', 'docs', 'rev-list', '--count', 'origin/master..HEAD') || 0) > 0)
    ? 'The docs repository has uncommitted or unpushed changes: commit in docs/ and push to lavalamp-docs (Robert: "push to lavalamp-docs any time the context is updated"). Never push the lamp repository itself unless asked.'
    : ''
  const block = codeChanged && !logChanged
    ? 'The lamp code has uncommitted changes but docs/decisions.md has no new entry. Before stopping, record what was seen, what was proposed, what Robert decided and why, and drop a screenshot in docs/checkpoints if the look changed. If nothing worth recording happened, add a one line entry saying so.'
    : ''
  let note = ''
  if (lastTag) {
    const n = Number(git('rev-list', '--count', `${lastTag}..HEAD`, '--', 'src', 'index.html') || 0)
    if (n > 0) note = `${n} commit(s) since ${lastTag} touch the lamp. If it looks or moves differently now, tag a checkpoint (checkpoint-NN-slug, annotated) and save a before/after screenshot in docs/checkpoints.`
  }
  if (block && input.stop_hook_active !== true) out({ decision: 'block', reason: block + (note ? ' Also: ' + note : '') + (docsUnpushed ? ' Also: ' + docsUnpushed : '') })
  const message = [block, note, docsUnpushed].filter(Boolean).join(' ')
  if (message) out({ systemMessage: message })
} catch {}
process.exit(0)
