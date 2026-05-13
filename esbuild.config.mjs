import esbuild from 'esbuild';
import path from 'path';
import process from 'process';
import builtins from 'builtin-modules';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  promises as fsPromises,
  readFileSync,
  rmSync,
} from 'fs';
import rendererSafeUnrefHelpers from './scripts/rendererSafeUnref.js';

const {
  findUnsafeTimerUnrefSites,
  patchRendererUnsafeUnrefSites,
} = rendererSafeUnrefHelpers;

// Load .env.local if it exists
if (existsSync('.env.local')) {
  const envContent = readFileSync('.env.local', 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^=]+)=["']?(.+?)["']?$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
}

const prod = process.argv[2] === 'production';

const patchCodexSdkImportMeta = {
  name: 'patch-codex-sdk-import-meta',
  setup(build) {
    build.onLoad(
      { filter: /[\\/]node_modules[\\/]@openai[\\/]codex-sdk[\\/]dist[\\/]index\.js$/ },
      async (args) => {
        const contents = await fsPromises.readFile(args.path, 'utf8');
        return {
          contents: contents.replace('createRequire(import.meta.url)', 'createRequire(__filename)'),
          loader: 'js',
        };
      },
    );
  },
};

// Claude Agent SDK 0.2.113+ ships ESM `.mjs` modules. When esbuild
// bundles them into our CJS `main.js`, it auto-generates a CJS-interop
// shim that calls `createRequire(import.meta.url)` and
// `fileURLToPath(import.meta.url)`. `import.meta.url` is rewritten to a
// local `import_meta.url` reference whose underlying object is never
// populated in the CJS runtime, so the call throws at plugin load
// (`Plugin failure: claudian TypeError: The argument 'filename' must
// be a file URL object ...`). The source `.mjs` files themselves
// contain no such call, so an `onLoad` substitution doesn't help; we
// patch the bundled output instead.
//
// We can't simply rewrite `import_meta.url` to `__filename` because
// `fileURLToPath` requires a file URL string, not a path. Instead we
// inject a one-time computation of the bundle's file URL via
// `pathToFileURL(__filename).href` and route every `import_meta.url`
// reference through it.
const patchBundleImportMeta = {
  name: 'patch-bundle-import-meta',
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length > 0 || !existsSync('main.js')) return;
      const bundlePath = path.join(process.cwd(), 'main.js');
      const original = await fsPromises.readFile(bundlePath, 'utf8');
      if (!original.includes('import_meta.url')) return;
      const replaced = original.replace(
        /import_meta\.url/g,
        "require('url').pathToFileURL(__filename).href",
      );
      if (replaced !== original) {
        await fsPromises.writeFile(bundlePath, replaced, 'utf8');
      }
    });
  },
};

const patchRendererUnsafeUnref = {
  name: 'patch-renderer-unsafe-unref',
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length > 0 || !existsSync('main.js')) return;

      const bundlePath = path.join(process.cwd(), 'main.js');
      const originalContents = await fsPromises.readFile(bundlePath, 'utf8');
      const patchedBundle = patchRendererUnsafeUnrefSites(originalContents);

      if (patchedBundle.contents !== originalContents) {
        await fsPromises.writeFile(bundlePath, patchedBundle.contents, 'utf8');
      }

      const unsafeMatches = findUnsafeTimerUnrefSites(patchedBundle.contents);
      if (unsafeMatches.length > 0) {
        const details = unsafeMatches
          .slice(0, 5)
          .map((match) => `line ${match.line}: ${match.snippet}`)
          .join('\n');

        throw new Error(
          `Renderer-unsafe timer .unref() calls remain in main.js:\n${details}`,
        );
      }
    });
  },
};

// Obsidian plugin folder path (set via OBSIDIAN_VAULT env var or .env.local)
const OBSIDIAN_VAULT = process.env.OBSIDIAN_VAULT;
const OBSIDIAN_PLUGIN_PATH = OBSIDIAN_VAULT && existsSync(OBSIDIAN_VAULT)
  ? path.join(OBSIDIAN_VAULT, '.obsidian', 'plugins', 'claudian')
  : null;

// Plugin to copy built files to Obsidian plugin folder
const copyToObsidian = {
  name: 'copy-to-obsidian',
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length > 0) return;
      rmSync(path.join(process.cwd(), '.codex-vendor'), { recursive: true, force: true });

      if (!OBSIDIAN_PLUGIN_PATH) return;

      if (!existsSync(OBSIDIAN_PLUGIN_PATH)) {
        mkdirSync(OBSIDIAN_PLUGIN_PATH, { recursive: true });
      }

      const files = ['main.js', 'manifest.json', 'styles.css'];
      for (const file of files) {
        if (existsSync(file)) {
          copyFileSync(file, path.join(OBSIDIAN_PLUGIN_PATH, file));
          console.log(`Copied ${file} to Obsidian plugin folder`);
        }
      }

      const pluginVendorRoot = path.join(OBSIDIAN_PLUGIN_PATH, '.codex-vendor');
      rmSync(pluginVendorRoot, { recursive: true, force: true });
    });
  }
};

const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  plugins: [patchCodexSdkImportMeta, patchBundleImportMeta, patchRendererUnsafeUnref, copyToObsidian],
  external: [
    'obsidian',
    'electron',
    '@codemirror/autocomplete',
    '@codemirror/collab',
    '@codemirror/commands',
    '@codemirror/language',
    '@codemirror/lint',
    '@codemirror/search',
    '@codemirror/state',
    '@codemirror/view',
    '@lezer/common',
    '@lezer/highlight',
    '@lezer/lr',
    ...builtins,
    ...builtins.map(m => `node:${m}`),
  ],
  format: 'cjs',
  target: 'es2018',
  logLevel: 'info',
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  outfile: 'main.js',
  // Embed audio assets as base64 so the plugin stays a single main.js.
  // We assemble the data URL with an explicit MIME at the call site because
  // esbuild's `dataurl` loader emits the non-standard `audio/wave` MIME for
  // WAV files, which Chromium/Electron silently refuses to play.
  loader: {
    '.wav': 'base64',
  },
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
