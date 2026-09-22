import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const { values } = parseArgs({ options: {
  engine: { type: 'string', multiple: true },
  out: { type: 'string', default: 'output/qc' },
  help: { type: 'boolean', default: false },
} });
if (values.help) {
  console.log('npm run qc -- [--engine chromium|webkit] [--out output/qc]\nBuilds fresh output, runs static and browser checks, and saves evidence.\nDefaults to both engines. QC_PYTHON selects Python; QC_BROWSER overrides Chromium.');
  process.exit(0);
}
const engines = [...new Set(values.engine ?? ['chromium', 'webkit'])];
if (engines.some(engine => !['chromium', 'webkit'].includes(engine))) {
  throw new Error('Supported engines: chromium, webkit');
}
const out = path.resolve(root, values.out);
const python = process.env.QC_PYTHON || 'python3';
const runId = new Date().toISOString().replaceAll(':', '-');
const evidence = path.join(out, runId);
const report = { runId, status: 'running', engines, commands: [], evidence };
const commandDeadlineMs = 10 * 60 * 1000;
const terminationGraceMs = 5000;
const processGroups = process.platform !== 'win32';
let interruption;
const checkInterrupted = () => {
  if (interruption) throw new Error(`QC interrupted by ${interruption}`);
};
const digestFiles = async (base, names) => {
  const hash = createHash('sha256');
  for (const name of [...names].sort()) {
    checkInterrupted();
    const file = path.join(base, name);
    if (!(await stat(file)).isFile()) continue;
    hash.update(name).update('\0').update(await readFile(file)).update('\0');
  }
  checkInterrupted();
  return hash.digest('hex');
};
const artifactDigest = async () => {
  const dist = path.join(root, 'dist');
  return digestFiles(dist, await readdir(dist, { recursive: true }));
};
const inputDigest = async () => {
  const names = ['package.json', 'package-lock.json', 'astro.config.mjs', 'svelte.config.js', 'tsconfig.json', '.nvmrc'];
  for (const directory of ['src', 'public', 'tests', 'scripts', '.github/actions', '.github/workflows']) {
    checkInterrupted();
    for (const name of await readdir(path.join(root, directory), { recursive: true })) {
      if (name.split(path.sep).includes('__pycache__') || /\.py[co]$/i.test(name)) continue;
      names.push(path.join(directory, name));
    }
  }
  return digestFiles(root, names);
};
const mime = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2',
  '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain',
};
let activeCommand;
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const dist = path.join(root, 'dist');
    let target = path.resolve(dist, '.' + pathname);
    if (target !== dist && !target.startsWith(dist + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    if ((await stat(target)).isDirectory()) target = path.join(target, 'index.html');
    const body = await readFile(target);
    response.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
});
const command = async (executable, args) => {
  checkInterrupted();
  const entry = { command: [executable, ...args], startedAt: new Date().toISOString() };
  report.commands.push(entry);
  const child = spawn(executable, args, { cwd: root, stdio: 'inherit', detached: processGroups });
  let termination;
  let timedOut = false;
  const target = () => processGroups ? -child.pid : child.pid;
  const signalTree = signal => {
    if (!child.pid) return;
    try { process.kill(target(), signal); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  };
  const treeExists = () => {
    if (!child.pid) return false;
    try { process.kill(target(), 0); return true; }
    catch (error) { if (error.code === 'ESRCH') return false; throw error; }
  };
  const stop = (signal = 'SIGTERM') => {
    if (termination) return termination;
    termination = (async () => {
      // POSIX commands own a process group, including npm and browser descendants.
      // Windows falls back to the direct child; subtree cleanup is not guaranteed.
      entry.cleanupScope = processGroups ? 'process-group' : 'direct-child-only';
      signalTree(signal);
      const deadline = Date.now() + terminationGraceMs;
      while (treeExists() && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      if (treeExists()) {
        entry.forcedTermination = true;
        signalTree('SIGKILL');
      }
    })().catch(error => { entry.cleanupError = error.message; });
    return termination;
  };
  activeCommand = { stop };
  const deadline = setTimeout(() => {
    timedOut = true;
    entry.timedOut = true;
    void stop();
  }, commandDeadlineMs);
  const result = await new Promise(resolve => {
    child.once('error', error => { entry.error = error.message; resolve({ error }); });
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  clearTimeout(deadline);
  if (!result.error) {
    entry.exitCode = result.code;
    entry.signal = result.signal;
  }
  // Also reap leftover descendants when their parent command exits first.
  await stop();
  activeCommand = undefined;
  entry.finishedAt = new Date().toISOString();
  checkInterrupted();
  if (timedOut) throw new Error(`${executable} ${args.join(' ')} exceeded the ${commandDeadlineMs / 60000}-minute deadline`);
  if (entry.cleanupError) throw new Error(`Unable to clean up command processes: ${entry.cleanupError}`);
  if (result.error) throw result.error;
  if (result.code !== 0) throw new Error(`${executable} ${args.join(' ')} exited ${result.code ?? result.signal}`);
};
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    interruption ||= signal;
    report.interrupted = signal;
    report.status = 'failed';
    report.error = `QC interrupted by ${interruption}`;
    process.exitCode = 1;
    void activeCommand?.stop(signal);
    server.closeAllConnections();
    if (server.listening) server.close();
  });
}

await mkdir(evidence, { recursive: true });
try {
  checkInterrupted();
  report.inputSha256 = await inputDigest();
  await command(python, ['-c', 'import playwright.sync_api']);
  await command('npm', ['run', 'build']);
  await command('npm', ['test']);
  report.artifactSha256 = await artifactDigest();
  checkInterrupted();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  checkInterrupted();
  const base = `http://127.0.0.1:${server.address().port}`;
  report.base = base;
  // The preview serves only this run's fresh dist, not an existing dev server.
  for (const engine of engines) {
    for (const suite of ['mobile-qa', 'browser-qa', 'design-state-qa']) {
      const args = [`tests/${suite}.py`, '--base', base, '--engine', engine, '--out', path.join(evidence, engine, suite)];
      if (engine === 'chromium' && process.env.QC_BROWSER) args.push('--browser', process.env.QC_BROWSER);
      await command(python, args);
    }
  }
  if (await artifactDigest() !== report.artifactSha256) throw new Error('dist changed during QC; do not run a concurrent build.');
  if (await inputDigest() !== report.inputSha256) throw new Error('Source or QC inputs changed during QC; rebuild and verify the current inputs.');
  checkInterrupted();
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.message;
  console.error(error.message);
  console.error('See the failed command and saved browser reports. Dependency setup and focused checks are documented in README.md.');
  process.exitCode = 1;
} finally {
  await activeCommand?.stop();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  if (interruption) {
    report.status = 'failed';
    report.error = `QC interrupted by ${interruption}`;
    process.exitCode = 1;
  }
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(evidence, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(path.join(out, 'latest.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`QC ${report.status}: ${path.relative(root, evidence)}`);
}
