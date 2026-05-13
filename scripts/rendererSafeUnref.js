const UNSAFE_TIMER_UNREF_PATTERNS = [
  {
    // Variable names inside the SDK's process-transport close path
    // (`X`, `J`, …) are minifier output and change across SDK releases.
    // Use a back-referenced identifier class so the patch survives any
    // minifier renaming as long as the structural shape is unchanged.
    name: 'claude-sdk-process-transport-close',
    pattern: /if \(\$ && !\$\.killed && \$\.exitCode === null\) setTimeout\(\(([A-Za-z_$][A-Za-z0-9_$]*)\) => \{\s*if \(\1\.killed \|\| \1\.exitCode !== null\) return;\s*\1\.kill\("SIGTERM"\), setTimeout\(\(([A-Za-z_$][A-Za-z0-9_$]*)\) => \{\s*if \(\2\.exitCode === null\) \2\.kill\("SIGKILL"\);\s*\}, 5e3, \1\)\.unref\(\);\s*\}, ([A-Za-z_$][A-Za-z0-9_$]*), \$\)\.unref\(\), \$\.once\("exit", (\(\) => (?:\{[^{}]*\}|[^;{}]+))\);/g,
    replacement:
      'if ($ && !$.killed && $.exitCode === null) {' +
      '\n      const processKillTimer = setTimeout(($1) => {' +
      '\n        if ($1.killed || $1.exitCode !== null) return;' +
      '\n        $1.kill("SIGTERM");' +
      '\n        const forceKillTimer = setTimeout(($2) => {' +
      '\n          if ($2.exitCode === null) $2.kill("SIGKILL");' +
      '\n        }, 5e3, $1);' +
      '\n        forceKillTimer.unref?.();' +
      '\n      }, $3, $);' +
      '\n      processKillTimer.unref?.();' +
      '\n      $.once("exit", $4);' +
      '\n    }',
  },
  {
    name: 'mcp-sdk-stdio-close-wait',
    pattern: /new Promise\(\((resolve\d+)\) => setTimeout\(\1, 2e3\)\.unref\(\)\)/g,
    replacement:
      'new Promise(($1) => {' +
      '\n        const closeTimeout = setTimeout($1, 2e3);' +
      '\n        closeTimeout.unref?.();' +
      '\n      })',
  },
];

const TIMER_CALL_PREFIXES = ['setTimeout(', 'setInterval('];

function patchRendererUnsafeUnrefSites(contents) {
  let nextContents = contents;
  const appliedPatches = [];

  for (const patch of UNSAFE_TIMER_UNREF_PATTERNS) {
    const matchCount = [...nextContents.matchAll(patch.pattern)].length;
    if (matchCount === 0) {
      continue;
    }
    nextContents = nextContents.replace(patch.pattern, patch.replacement);
    appliedPatches.push({ name: patch.name, count: matchCount });
  }

  return {
    contents: nextContents,
    appliedPatches,
  };
}

function findUnsafeTimerUnrefSites(contents) {
  const matches = [];

  let searchIndex = 0;
  while (searchIndex < contents.length) {
    const timerStart = findNextTimerCall(contents, searchIndex);
    if (!timerStart) {
      break;
    }

    const callEnd = findMatchingParen(contents, timerStart.openParenIndex);
    if (callEnd === -1) {
      searchIndex = timerStart.startIndex + timerStart.prefix.length;
      continue;
    }

    const unrefMatch = contents.slice(callEnd + 1).match(/^\s*\.unref\(\)/);
    if (unrefMatch) {
      const startIndex = timerStart.startIndex;
      const endIndex = callEnd + 1 + unrefMatch[0].length;
      const line = contents.slice(0, startIndex).split('\n').length;
      matches.push({
        line,
        snippet: contents.slice(startIndex, endIndex),
      });
      searchIndex = endIndex;
      continue;
    }

    searchIndex = callEnd + 1;
  }

  return matches;
}

function findNextTimerCall(contents, startIndex) {
  let nextMatch = null;

  for (const prefix of TIMER_CALL_PREFIXES) {
    const index = contents.indexOf(prefix, startIndex);
    if (index === -1) {
      continue;
    }
    if (!nextMatch || index < nextMatch.startIndex) {
      nextMatch = {
        prefix,
        startIndex: index,
        openParenIndex: index + prefix.length - 1,
      };
    }
  }

  return nextMatch;
}

function findMatchingParen(contents, openParenIndex) {
  let depth = 1;
  let quote = null;

  for (let index = openParenIndex + 1; index < contents.length; index += 1) {
    const char = contents[index];

    if (quote) {
      if (char === '\\') {
        index += 1;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === '\'' || char === '`') {
      quote = char;
      continue;
    }

    if (char === '(') {
      depth += 1;
      continue;
    }

    if (char === ')') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

module.exports = {
  findUnsafeTimerUnrefSites,
  patchRendererUnsafeUnrefSites,
};
