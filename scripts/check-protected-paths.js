'use strict';

const { spawnSync } = require('child_process');
const https = require('https');

const ZERO_SHA = /^0+$/;
const MAX_GIT_OUTPUT = 10 * 1024 * 1024;

function runGit(args) {
  let result;
  try {
    result = spawnSync('git', args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: MAX_GIT_OUTPUT,
    });
  } catch (error) {
    return { ok: false, error: `git ${args[0]} could not start: ${error.message}` };
  }

  if (result.error) {
    return { ok: false, error: `git ${args[0]} could not start: ${result.error.message}` };
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || 'no command output').trim();
    return { ok: false, error: `git ${args[0]} failed with exit ${result.status}: ${detail}` };
  }
  return { ok: true, output: result.stdout };
}

function isProtectedPath(filePath) {
  return filePath.startsWith('.env')
    || filePath === 'ecosystem.config.js'
    || filePath.startsWith('.claude/')
    || filePath.startsWith('ogz-meta/Alignment/')
    || filePath === 'config/trading.config.json';
}

function verifyCommit(sha, label) {
  const result = runGit(['cat-file', '-e', `${sha}^{commit}`]);
  if (!result.ok) {
    return { ok: false, error: `Cannot resolve ${label} commit ${sha}: ${result.error}` };
  }
  return { ok: true };
}

function commitsInRange(baseSha, headSha, newBranchBase) {
  if (ZERO_SHA.test(headSha)) {
    return { ok: true, commits: [] };
  }

  const headCheck = verifyCommit(headSha, 'head');
  if (!headCheck.ok) return headCheck;

  let effectiveBase = baseSha;
  if (ZERO_SHA.test(baseSha)) {
    if (!newBranchBase) {
      return { ok: false, error: 'New-branch push requires the repository default-branch ref' };
    }
    const newBranchBaseCheck = verifyCommit(newBranchBase, 'default-branch');
    if (!newBranchBaseCheck.ok) return newBranchBaseCheck;
    const mergeBase = runGit(['merge-base', headSha, newBranchBase]);
    if (!mergeBase.ok) return mergeBase;
    effectiveBase = mergeBase.output.trim();
  }

  const baseCheck = verifyCommit(effectiveBase, 'base');
  if (!baseCheck.ok) return baseCheck;
  const result = runGit(['rev-list', '--reverse', `${effectiveBase}..${headSha}`]);
  if (!result.ok) return result;
  const commits = result.output.split(/\r?\n/).filter(Boolean);
  return { ok: true, commits };
}

function protectedPathsForCommit(sha) {
  const result = runGit([
    'diff-tree',
    '--root',
    '--first-parent',
    '--diff-merges=first-parent',
    '--no-commit-id',
    '--name-only',
    '-r',
    '-z',
    sha,
  ]);
  if (!result.ok) return result;

  const paths = result.output.split('\0').filter(Boolean).filter(isProtectedPath);
  return { ok: true, paths };
}

function commitDetails(sha) {
  const result = runGit(['show', '-s', '--format=%an <%ae>%n%s', sha]);
  if (!result.ok) return result;

  const [author, ...subjectLines] = result.output.trimEnd().split(/\r?\n/);
  return {
    ok: true,
    details: {
      author,
      subject: subjectLines.join(' '),
    },
  };
}

function notificationBody(sha, details, paths) {
  return [
    'OGZPrime protected path touched',
    `Author: ${details.author}`,
    `SHA: ${sha}`,
    `Subject: ${details.subject}`,
    'Files:',
    ...paths.map((filePath) => `- ${filePath}`),
  ].join('\n');
}

function sendNotification(body) {
  const topic = String(process.env.NTFY_TOPIC || '').trim();
  if (!topic) {
    console.error('ALARM DELIVERY ABSENCE: NTFY_TOPIC is absent; notification delivery is unavailable and unproven. Detection remains non-blocking.');
    return Promise.resolve({ ok: true, delivered: false, absence: 'ntfy_topic_absent' });
  }

  return new Promise((resolve) => {
    let request;
    try {
      request = https.request({
        hostname: 'ntfy.sh',
        port: 443,
        path: `/${encodeURIComponent(topic)}`,
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Length': Buffer.byteLength(body),
          Priority: 'max',
          Title: 'OGZPrime protected path alarm',
        },
      }, (response) => {
        response.resume();
        response.on('end', () => {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            console.log('Sent max-priority protected-path notification.');
            resolve({ ok: true, delivered: true });
          } else {
            resolve({ ok: false, error: `ntfy notification failed with HTTP ${response.statusCode}` });
          }
        });
      });
    } catch (error) {
      resolve({ ok: false, error: `ntfy notification could not start: ${error.message}` });
      return;
    }

    request.setTimeout(10000, () => {
      request.destroy(new Error('ntfy notification timed out after 10000ms'));
    });
    request.on('error', (error) => {
      resolve({ ok: false, error: `ntfy notification failed: ${error.message}` });
    });
    request.end(body);
  });
}

async function reportMalfunction(message) {
  console.error(`PROTECTED PATH ALARM MALFUNCTION: ${message}`);
  process.exitCode = 1;
}

async function main() {
  const [baseSha, headSha, newBranchBase] = process.argv.slice(2);
  if (!baseSha || !headSha) {
    await reportMalfunction('expected base and head commit SHAs');
    return;
  }

  const range = commitsInRange(baseSha, headSha, newBranchBase);
  if (!range.ok) {
    await reportMalfunction(range.error);
    return;
  }

  let touchingCommits = 0;
  let deliveredNotifications = 0;
  let unavailableNotifications = 0;

  for (const sha of range.commits) {
    const protectedPaths = protectedPathsForCommit(sha);
    if (!protectedPaths.ok) {
      await reportMalfunction(`could not inspect ${sha}: ${protectedPaths.error}`);
      return;
    }
    if (protectedPaths.paths.length === 0) continue;

    const details = commitDetails(sha);
    if (!details.ok) {
      await reportMalfunction(`could not read ${sha}: ${details.error}`);
      return;
    }

    touchingCommits += 1;
    const notification = await sendNotification(notificationBody(
      sha,
      details.details,
      protectedPaths.paths,
    ));
    if (!notification.ok) {
      await reportMalfunction(`${sha}: ${notification.error}`);
      return;
    }
    if (notification.delivered) deliveredNotifications += 1;
    else unavailableNotifications += 1;
  }

  console.log(
    `Protected path detection complete: commits=${range.commits.length} touching=${touchingCommits} delivered=${deliveredNotifications} unavailable=${unavailableNotifications}.`,
  );
}

main().catch(async (error) => {
  await reportMalfunction(`unexpected internal error: ${error.message}`);
});
