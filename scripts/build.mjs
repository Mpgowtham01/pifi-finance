// Builds the app for production.
//
// Hosts usually run "npm install && npm run build" from the repository
// root. That only installs the ROOT package — backend/ and frontend/ are
// separate projects, so express and vite would both be missing. This
// installs whatever is absent, then builds the frontend.
//
// "Absent" means ANY package listed in package.json, not just one: hosts
// keep node_modules between deploys, so a newly added package would
// otherwise never arrive (that is how "Cannot find package 'cloudinary'"
// happened on Render).
import { existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' })

// npm ci when there is a lockfile, npm install otherwise.
function install(dir, { dev }) {
  const lock = existsSync(path.join(dir, 'package-lock.json'))
  // --include=dev matters: a host sets NODE_ENV=production, which would
  // otherwise skip the dev dependencies that Vite lives in.
  const flags = dev ? ' --include=dev' : ' --omit=dev'
  run(`npm ${lock ? 'ci' : 'install'}${flags} --no-audit --no-fund`, dir)
}

const backend = path.join(root, 'backend')
const frontend = path.join(root, 'frontend')

// The packages package.json asks for that are not in node_modules.
function missing(dir, { dev }) {
  const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))
  const names = Object.keys({ ...pkg.dependencies, ...(dev ? pkg.devDependencies : {}) })
  return names.filter((n) => !existsSync(path.join(dir, 'node_modules', n, 'package.json')))
}

for (const [name, dir, dev] of [
  ['backend', backend, false],
  ['frontend', frontend, true],
]) {
  const absent = missing(dir, { dev })
  if (absent.length) {
    console.log(`\n→ installing ${name} dependencies (missing: ${absent.join(', ')})\n`)
    install(dir, { dev })
  }
}

console.log('\n→ building the frontend\n')
run('npm run build', frontend)
console.log('\nBuild finished.\n')
