// The release flow is built from this repository, not written here.
//
// electron-builder reads electron-builder.yml and GitHub Actions reads
// .github/workflows; neither can be reused as-is, so both the builds and the
// data they imply live in .ci/releases/*.json, and .cnb.yml only says when
// they run. A new platform is a new file there, and one place says the Node
// version. This tool reads them: `yml` writes .cnb.yml from them, and
// `release`/`upload`/`collect` do the release over the OpenAPI, because no
// single job on the tag can see the other two machines.
const fs = require('fs');
const path = require('path');

const RELEASES = '.ci/releases';
const API = process.env.CNB_API_ENDPOINT || 'https://api.cnb.cool';
const SLUG = process.env.CNB_REPO_SLUG;
const TAG = process.env.CNB_BRANCH;
const TOKEN = process.env.CNB_TOKEN;

// The repository root. The flow runs the tool from inside it, a developer from
// wherever they happen to be; both layouts are these two.
const findRoot = () => {
  const cwd = process.cwd();
  if (path.basename(cwd) === 'tools') return path.resolve(cwd, '..', '..');
  if (path.basename(cwd) === '.cnb') return path.resolve(cwd, '..');
  return cwd;
};
const ROOT = findRoot();

const HEAD = [
  '# Written by .ci/releases/make-cnb-yml.sh: edit .ci/releases, not this file.',
  '#',
  '# Pushing a v* tag builds every platform and puts what it produced on the',
  '# release. Running one of these pipelines by hand builds that one platform',
  '# and publishes nothing, which is how a change here gets tried.',
].join('\n');

// The keys a pipeline object may hold. Anything else in a release file is data
// about the release rather than part of the pipeline.
const PIPELINE = [
  'name',
  'runner',
  'image',
  'docker',
  'services',
  'env',
  'stages',
  'failStages',
  'endStages',
  'ifModify',
];

const die = (message) => {
  process.stderr.write(`release: ${message}\n`);
  process.exit(1);
};

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    die(`${path.relative(ROOT, file)}: ${e.message}`);
  }
};

// The files that describe a release, in the order they were given names.
const releaseFiles = () =>
  fs
    .readdirSync(path.join(ROOT, RELEASES))
    .filter((n) => n.startsWith('releases.') && n.endsWith('.json'))
    .sort()
    .map((n) => path.join(ROOT, RELEASES, n));

const readRelease = (file) => {
  const release = readJson(file);
  if (!release.pipeline || !release.pipeline.name)
    die(`${path.relative(ROOT, file)}: no pipeline.name`);
  for (const key of Object.keys(release.pipeline))
    if (!PIPELINE.includes(key))
      die(`${path.relative(ROOT, file)}: pipeline.${key} is not a pipeline key`);
  return release;
};

const releases = () => releaseFiles().map(readRelease);
const named = (name) => {
  const release = releases().find((r) => r.pipeline.name === name);
  return release || die(`no release named ${name}`);
};

// What a platform produced, and the manifests the updater reads beside it.
// Named here rather than passed in, so three platforms cannot drift apart.
const ARTIFACTS = {
  macos: ['*.dmg', 'latest*.yml', '*.blockmap'],
  windows: ['*.exe', 'latest*.yml', '*.blockmap'],
  linux: ['*.AppImage', 'latest*.yml', '*.blockmap'],
};

// Which platform is asking, from the pipeline name the flow runs under. What
// it should find is here rather than in each pipeline, so three platforms
// cannot drift apart over a blockmap.
const platform = () => {
  const name = process.env.CNB_PIPELINE_NAME;
  if (!name) die('CNB_PIPELINE_NAME is not set');
  const key = name.replace(/^release-/, '');
  if (!ARTIFACTS[key]) die(`${name} is not a platform`);
  return key;
};

// What a platform's build leaves behind, and the platform the publisher waits
// on: the last of the three, whichever that is. Both are named in the files
// under .ci/releases rather than here; these are the fallbacks.
//
// The publisher holds each platform's artifacts between its build and the
// release. The release itself is not filled in until every platform is done,
// because a draft holding half a version is worse than no version.
//
// A prefix rather than a directory: asset names may not contain a slash, and
// the file name has to survive the round trip through the download redirect.
const STASH = 'stashed-';

const call = (method, pathname, body) => {
  const args = [
    '--silent',
    '--show-error',
    '--location',
    '--request',
    method,
    '--header',
    `Authorization: Bearer ${TOKEN}`,
    '--header',
    // The API answers 406 to anything else, and to a request that sends only
    // Content-Type without Accept.
    'Accept: application/vnd.cnb.api+json',
    '--header',
    'Content-Type: application/json',
    '--write-out',
    '\n%{http_code}',
  ];
  if (body !== undefined) args.push('--data-binary', JSON.stringify(body));
  args.push(`${API}${pathname}`);
  const out = exec('curl', args);
  const split = out.lastIndexOf('\n');
  const code = Number(out.slice(split + 1));
  const text = out.slice(0, split);
  if (code === 404) return null;
  if (code >= 400)
    die(`${method} ${pathname} -> ${code}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
};

const exec = (command, args) => {
  const { execFileSync } = require('child_process');
  return execFileSync(command, args, { encoding: 'utf8', maxBuffer: 1 << 30 });
};

const repo = () => {
  if (!SLUG) die('CNB_REPO_SLUG is not set');
  return `/${SLUG}`;
};

// The release a tag stands for, created as a draft the first time it is asked
// for: the notes are written before anyone sees it, and nothing reaches an
// installed copy until someone publishes it by hand.
const draft = () => {
  if (!TAG) die('CNB_BRANCH is not set');
  const found = call('GET', `${repo()}/-/releases/tags/${TAG}`);
  if (found) return found;
  const release = call('POST', `${repo()}/-/releases`, {
    tag_name: TAG,
    target_commitish: process.env.CNB_COMMIT,
    name: `GoonLib ${TAG.replace(/^v/, '')}`,
    draft: true,
    // Every GoonLib release is a pre-release while the app is in beta, and the
    // updater accepts those and walks past anything else. A draft published
    // without the mark is invisible to every installed copy.
    prerelease: true,
    make_latest: 'false',
  });
  return release;
};

// One file, by its pre-signed URL: get the address, PUT the bytes, confirm.
// The size is not optional, and a mismatch is a truncated file on the release.
const upload = (release, name, file) => {
  const url = call('POST', `${repo()}/-/releases/${release.id}/asset-upload-url`, {
    asset_name: name,
    overwrite: true,
    size: fs.statSync(file).size,
  });
  exec('curl', [
    '--silent',
    '--show-error',
    '--fail',
    '--request',
    'PUT',
    '--upload-file',
    file,
    url.upload_url,
  ]);
  const verify = new URL(url.verify_url);
  call(
    'POST',
    `${repo()}/-/releases/${release.id}/asset-upload-confirmation${verify.pathname.split('/asset-upload-confirmation')[1]}`,
  );
};

const artifacts = (dir, patterns) => {
  if (!fs.existsSync(dir)) return [];
  const found = fs.readdirSync(dir);
  return found.filter(
    (name) =>
      !name.startsWith('.') && patterns.some((p) => glob(p, name)),
  );
};

// Enough glob for `*.dmg` and `latest*.yml`, which is all the names above are.
const glob = (pattern, name) => {
  const escaped = pattern.replace(/[.+^${}()|[\]\\?]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\*/g, '.*')}$`).test(name);
};

const commands = {
  // What is in this repository, for reading without opening the files.
  list() {
    for (const file of releaseFiles()) {
      const { summary, pipeline } = readRelease(file);
      process.stdout.write(
        [path.basename(file), pipeline.name, summary].filter(Boolean).join(' — ') +
          '\n',
      );
    }
  },

  // The .cnb.yml itself. The branch name is the command line's to pick: it
  // depends on the repository, and on nothing about what gets built.
  yml() {
    const branch = process.argv[3] || die('yml needs a branch name');
    const tags = process.argv[4];
    // The maintenance pipeline owns this file and is appended after it: in it,
    // it would be rewritten on every push, including its own.
    const all = releases().filter((r) => r.pipeline.name !== 'release-config');
    const runners = all.filter((r) => r.runner);
    if (!runners.length) die('no release declares a runner');
    // One runner for the whole file, because the mac build is the only one
    // that needs a node of its own and it is not this repository's. Its labels
    // are the root organization's to choose, hence the variable.
    const runner = { ...runners[0].runner };
    for (const r of runners)
      if (JSON.stringify(r.runner) !== JSON.stringify(runner))
        die('only one runner is allowed');
    // `mac` rather than `cnb:arch:amd64`, which is what an unset variable
    // falls back to: the labels of a connected Mac are the organization's.
    if (tags) runner.tags = tags.split(',');

    // The build pipelines answer to both a tag and a hand-run; only the tag
    // differs, and the event is what tells a run which one it is. The hand-run
    // lives on the branch because it builds that branch, and the tag under `$`
    // because a tag belongs to the repository rather than to a branch.
    // A build is a pipeline plus where it runs; only the mac one says where,
    // and three of the four pipelines have nothing to say about it.
    const asTask = (r) =>
      r.runner ? { runner, ...r.pipeline } : r.pipeline;
    const build = all
      .filter((r) => !/^release-publish$/.test(r.pipeline.name))
      .map(asTask);
    // The maintenance pipeline is written here rather than left to the
    // maintenance pipeline, for the obvious reason; it runs on a push to the
    // branch because what it edits is this file rather than a version.
    const maintenance = named('release-config');
    process.stdout.write(
      `${HEAD}\n${yaml({
        [branch]: {
          push: [maintenance.pipeline],
          api_trigger_publish: build,
          api_trigger_publish_manual: build,
        },
        $: {
          tag_push: all.map(asTask),
        },
      })}`,
    );
  },

  // Opens the release the tag stands for, if it is not open already.
  release() {
    const release = draft();
    process.stdout.write(
      `release: ${release.tag_name} ${release.draft ? 'draft' : 'published'}\n`,
    );
  },

  // Copies one platform's artifacts onto the release, under the tag's name and
  // a second time under the stash the publisher collects from.
  upload() {
    const which = platform();
    const release = draft();
    const files = artifacts(path.join(ROOT, 'release'), ARTIFACTS[which]);
    if (!files.length) die(`nothing to upload for ${which}`);
    for (const name of files) {
      upload(release, name, path.join(ROOT, 'release', name));
      upload(release, `${STASH}${name}`, path.join(ROOT, 'release', name));
      process.stdout.write(`uploaded ${name}\n`);
    }
  },

  // Fetches what every platform left, and puts one copy of each installer and
  // manifest on the release. The stashes go afterwards: the release is
  // complete or it is not, and a half-filled one that still lists three
  // platforms is how an updater is told to look for a file that is not there.
  collect() {
    const release = draft();
    const stashed = (release.assets || []).filter((a) =>
      a.name.startsWith(STASH),
    );
    if (!stashed.length) die(`nothing stashed for ${TAG}`);
    for (const asset of stashed) {
      const name = asset.name.slice(STASH.length);
      const file = path.join(ROOT, 'release', name);
      exec('curl', [
        '--silent',
        '--show-error',
        '--fail',
        '--location',
        '--header',
        `Authorization: Bearer ${TOKEN}`,
        '--header',
        'Accept: application/vnd.cnb.api+json',
        '--output',
        file,
        `${API}${repo()}/-/releases/download/${TAG}/${encodeURIComponent(asset.name)}`,
      ]);
      process.stdout.write(`fetched ${name}\n`);
    }
    for (const asset of stashed) {
      const name = asset.name.slice(STASH.length);
      upload(release, name, path.join(ROOT, 'release', name));
      call(
        'DELETE',
        `${repo()}/-/releases/${release.id}/assets/${asset.id}`,
      );
    }
    process.stdout.write(`release ${TAG} holds ${stashed.length} files\n`);
  },
};

// Written rather than imported: the pipeline is generated and never edited, so
// the emitter has one shape to produce, and a dependency is one more thing that
// can be missing from the machine that runs it.
const yaml = (value, indent = 0) => {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value))
    return value
      .map((item) => {
        const body = yaml(item, indent + 2);
        return `${pad}-${body.slice(indent + 1)}`;
      })
      .join('');
  if (value && typeof value === 'object')
    return Object.entries(value)
      .map(([key, v]) => {
        if (typeof v === 'object' && v !== null)
          return `${pad}${key}:\n${yaml(v, indent + 2)}`;
        return `${pad}${key}: ${scalar(v).replaceAll('{PAD}', ' '.repeat(indent + 2))}\n`;
      })
      .join('');
  return `${pad}${scalar(value)}\n`;
};

// Block scalars come back already indented for the level they sit at, which is
// why the caller pads them again rather than the emitter.
const scalar = (value) => {
  const v = value;
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const text = String(v);
  if (text.includes('\n'))
    return `|-\n{PAD}${text.replace(/\n$/, '').replace(/\n/g, '\n{PAD}')}`;
  if (BARE.test(text) && !RESERVED.test(text)) return text;
  return `'${text.replace(/'/g, "''")}'`;
};

const BARE = /^[A-Za-z0-9_][A-Za-z0-9_.*-]*(?:\/[A-Za-z0-9_.*-]+)*$/;
const RESERVED = /^(true|false|null|~|yes|no|on|off)$/i;

const run = commands[process.argv[2]];
if (!run) die(`unknown command ${process.argv[2] || '(none)'}`);
run();
