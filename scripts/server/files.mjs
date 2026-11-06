// Files from the repository, read from disk on every request with caching off (Robert: "can you
// just set nocache headers on the local server to make sure it never caches?"). Read per request,
// not scanned at start, so a file added while the server runs is served at once.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2', '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.flac': 'audio/flac',
  '.mp4': 'video/mp4', '.webm': 'video/webm'
}

const noCache = { 'cache-control': 'no-store, must-revalidate', expires: '0' }

// A handler for GET that serves `root` (the repository by default), less the `refuse` folders.
// Never served: git's own files, packages, and the top level folders in .git/info/exclude (private
// checkouts kept inside this folder, which this public repository does not name).
const excluded = () => {
  try {
    return fs.readFileSync(path.join(repoRoot, '.git/info/exclude'), 'utf8').split('\n')
      .map(line => line.trim()).filter(line => line && !line.startsWith('#')).map(line => line.replace(/^\/|\/$/g, ''))
      .filter(name => name && !/[*?[\/]/.test(name))
  } catch { return [] }
}
export const refused = ['.git', 'node_modules', ...excluded()]
export const fileHandler = ({ root = repoRoot, refuse = refused } = {}) => ({ url }) => {
  let rel
  try { rel = decodeURIComponent(url.path) } catch { return { statusCode: 400, headers: noCache } }
  let file = path.resolve(root, '.' + rel)
  if (file !== root && !file.startsWith(root + path.sep)) return { statusCode: 404, headers: noCache }
  const top = path.relative(root, file).split(path.sep)[0]
  if (refuse.includes(top)) return { statusCode: 404, headers: noCache }
  let stat = fs.statSync(file, { throwIfNoEntry: false })
  if (stat && stat.isDirectory()) {
    if (!rel.endsWith('/')) return { statusCode: 301, headers: { ...noCache, location: rel + '/' } }
    file = path.join(file, 'index.html')
    stat = fs.statSync(file, { throwIfNoEntry: false })
  }
  if (!stat || !stat.isFile()) return { statusCode: 404, headers: { ...noCache, 'content-type': 'text/plain' }, body: 'not found' }
  return {
    headers: { ...noCache, 'content-type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'content-length': String(stat.size) },
    body: fs.createReadStream(file)
  }
}

// Whether anything answers on the port, on IPv4 or IPv6: macOS lets two servers hold one port side
// by side, localhost reaching one or the other (Robert: "python allows multiple listeners by
// default. stupid default"). Refused rather than shared.
import net from 'node:net'
export const portTaken = port => Promise.all(['127.0.0.1', '::1'].map(host => new Promise(resolve => {
  const socket = net.connect({ host, port })
  const done = answer => { socket.destroy(); resolve(answer) }
  socket.setTimeout(300, () => done(false))
  socket.once('connect', () => done(true))
  socket.once('error', () => done(false))
}))).then(answers => answers.some(Boolean))
