// The lamp's local server, caching off.
//   node scripts/server/serve.mjs [port]            http on this machine only, default 8765
//   node scripts/server/serve.mjs --https [port]    https on the LAN, for phones, default 8443
// Phones need https: a browser only offers WebGPU, the motion sensors and the wake lock on a
// secure context, and http://<laptop ip> is not one (Robert: "ah damn, my pixel 9 pro got the cpu
// version"). A self signed certificate is made on first run, kept outside the repository
// (~/.lavalamp-https); the phone's browser warns once, then Advanced, Proceed.
// Run `npm install` in scripts/server once.
import spliffy, { moduleDirname } from '@srfnstack/spliffy'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { portTaken, refused, repoRoot } from './files.mjs'

const args = process.argv.slice(2)
const https = args.includes('--https')
const port = Number(args.find(a => /^\d+$/.test(a)) || (https ? 8443 : 8765))

if (await portTaken(port)) {
  console.error(`port ${port} is already served; stop that server first (lsof -nP -iTCP:${port})`)
  process.exit(1)
}

// Spliffy routes are files. One catch-all per top level folder and a route per top level file, made
// fresh at each start in a temporary folder: a catch-all at the root (www/+.rt.mjs) maps to //*
// in spliffy 1.7.0 and never matches. Files added inside a folder are served at once; a new top
// level folder needs a restart.
const routeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lavalamp-routes-'))
const handler = `import { fileHandler } from ${JSON.stringify(pathToFileURL(path.join(moduleDirname(import.meta.url), 'files.mjs')).href)}\nexport default { GET: fileHandler() }\n`
fs.writeFileSync(path.join(routeDir, 'index.rt.mjs'), handler)
for (const entry of fs.readdirSync(repoRoot, { withFileTypes: true })) {
  if (refused.includes(entry.name) || /[\$+]/.test(entry.name)) continue
  fs.writeFileSync(path.join(routeDir, entry.isDirectory() ? entry.name + '+.rt.mjs' : entry.name + '.rt.mjs'), handler)
}
process.on('exit', () => fs.rmSync(routeDir, { recursive: true, force: true }))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(0))
const config = { routeDir, logLevel: 'WARN' }
if (https) {
  const dir = path.join(os.homedir(), '.lavalamp-https')
  const cert = path.join(dir, 'cert.pem')
  const key = path.join(dir, 'key.pem')
  fs.mkdirSync(dir, { recursive: true })
  if (!fs.existsSync(cert)) {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '3650', '-subj', '/CN=lavalamp.local', '-keyout', key, '-out', cert], { stdio: 'ignore' })
  }
  // The LAN on https; http on the next port up only redirects to it (spliffy listens on one
  // host for both).
  Object.assign(config, { host: '0.0.0.0', httpsPort: port, httpsKeyFile: key, httpsCertFile: cert, port: port + 1, httpRedirect: true })
} else {
  Object.assign(config, { host: '127.0.0.1', port })
}
await spliffy(config)
let ip = '<laptop ip>'
try { ip = execFileSync('ipconfig', ['getifaddr', 'en0'], { encoding: 'utf8' }).trim() || ip } catch {}
console.log(https ? `lamp at https://${ip}:${port}/  (self signed: accept the warning once)` : `lamp at http://localhost:${port}/`)
