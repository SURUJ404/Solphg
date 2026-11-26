// Fake `anchor` executable used by the build-service tests. Invoked as:
//   node fake-anchor.mjs build
// Behaviour is controlled by FAKE_ANCHOR_MODE:
//   ok | fail | sleep | hang | symlink-probe
// Every invocation appends a line to FAKE_ANCHOR_COUNTER (if set). In
// symlink-probe mode it instead records the job toolchain layout as JSON.
import { appendFileSync, mkdirSync, readdirSync, readlinkSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const cwd = process.cwd();
let mode = process.env.FAKE_ANCHOR_MODE || 'ok';

if (mode === 'symlink-probe') {
  // Record the toolchain layout, then continue with a normal build so the
  // caller still receives valid artifacts.
  try {
    const sdk = process.env.SBF_SDK_PATH;
    writeFileSync(
      process.env.FAKE_ANCHOR_COUNTER,
      `${JSON.stringify({
        cache: readlinkSync(join(process.env.HOME, '.cache', 'solana')),
        sdk,
        sdkLink: sdk ? readlinkSync(join(sdk, 'dependencies', 'platform-tools')) : null,
        rustupHome: process.env.RUSTUP_HOME || null,
        sdkDeps: sdk ? readdirSync(join(sdk, 'dependencies')).sort() : [],
        cargoRegistryIsDir: statSync(join(process.env.CARGO_HOME, 'registry')).isDirectory(),
      })}\n`,
    );
  } catch (err) {
    writeFileSync(process.env.FAKE_ANCHOR_COUNTER, `${JSON.stringify({ error: err.message })}\n`);
  }
  mode = 'ok';
}

if (process.env.FAKE_ANCHOR_COUNTER) {
  appendFileSync(process.env.FAKE_ANCHOR_COUNTER, `${process.pid}\n`);
}

if (mode === 'hang') {
  setInterval(() => {}, 1000);
} else {
  const delay = mode === 'sleep' ? 300 : 0;
  setTimeout(() => {
    if (mode === 'fail') {
      process.stderr.write('error[E0425]: cannot find value `missing` in this scope\n  --> src/lib.rs:7:5\n');
      process.exit(2);
    }
    const programsDir = join(cwd, 'programs');
    const program = readdirSync(programsDir)[0];
    const outDir = join(cwd, 'target', 'deploy');
    const idlDir = join(cwd, 'target', 'idl');
    mkdirSync(outDir, { recursive: true });
    mkdirSync(idlDir, { recursive: true });
    const digest = createHash('sha256').update(`${program}:${mode}`).digest('hex');
    writeFileSync(join(outDir, `${program}.so`), Buffer.from(`FAKE-SBF-${digest}`));
    writeFileSync(
      join(idlDir, `${program}.json`),
      JSON.stringify({ version: '0.1.0', name: program, instructions: [], accounts: [] }),
    );
    process.stdout.write(`fake anchor built ${program}\n`);
    process.exit(0);
  }, delay);
}
