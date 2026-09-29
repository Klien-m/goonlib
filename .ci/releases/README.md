# Releases

Pushing a `v*` tag builds GoonLib on all three platforms, opens a draft release
holding what they produced, and leaves it for someone to write notes against
and publish. Nothing is signed yet, so Windows and macOS wear a warning and
macOS cannot install its own updates; that is `docs/cross-platform-plan.md`,
and it waits on a certificate rather than on this directory.

## Why `.cnb.yml` is not written by hand

It is generated, because half of it cannot be. The native pieces - better-sqlite3
rebuilt against Electron's ABI, sharp, and the bundled ffmpeg and ffprobe -
cannot be cross-built from one machine with any confidence, so each platform
builds its own on a runner of its own, exactly as `.github/workflows/release.yml`
does. That much is ordinary CNB. The awkward part is what follows.

Three jobs on three runners cannot fill in one release between them: a job sees
its own machine. So each platform copies its own artifacts onto the draft, under
a name prefixed `stashed-`, and the last build to finish runs a collector that
pulls every stash down, puts one copy of each installer and manifest on the
release, and deletes the stashes. A release is filled in at once or not at all,
because a draft holding half a version that still lists three platforms is how
an updater is told to look for a file that is not there.

That is enough moving parts that writing it by hand would have been three copies
of one YAML, drifting apart a Node version at a time. So the builds live in
files, and the file that runs is generated from them.

```
.ci/releases/
  releases.*.json      one file per pipeline: the build, and the notes on it
  make-cnb-yml.sh      writes ../../.cnb.yml and compiles the tool it names
.cnb/tools/release.js  reads the JSON, writes the YAML, does the release
```

`releases.macos.json` declares a runner because it is the only build that has to
run on a Mac, and this repository has none. It borrows one from the root
organization, which is a node somebody connects by hand and whose labels are
theirs to choose; set `GOONLIB_MACOS_TAGS` to those labels once it is there.
Unset, the mac build asks for an Intel CNB node, which is wrong in a way that
builds rather than a way that blocks.

## Changing it

1. Edit a file under `.ci/releases/`, or add one. The file name decides the
   order it appears in `.cnb.yml`, so `releases.linux.json` sorts before
   `releases.macos.json`.
2. Push. The `release-config` pipeline in `.cnb.yml` reruns
   `make-cnb-yml.sh` on any push touching this directory and rewrites `.cnb.yml`
   from it. A tag then runs what this directory says.
3. Or by hand, from the repository root:

```
bash .ci/releases/make-cnb-yml.sh
```

`node .cnb/tools/release.js list` says what each file declares without opening
it. The tool takes no dependencies: it emits its own YAML and talks to the
OpenAPI with `curl`, because the pipeline that runs it installs nothing, and a
module that has to be there is a module that can be missing.

## What the release job does

`.cnb/tools/release.js` has four commands, and only the first runs before a
release exists.

- `yml BRANCH [MAC_TAGS]` writes `.cnb.yml`. The branch name is an argument
  because it belongs to the repository rather than to what gets built.
- `release` opens the draft the tag stands for, if it is not open already.
- `upload` takes whatever is in `release/` for this platform - the installer,
  `latest*.yml`, the blockmap - and puts it on the draft twice: under its own
  name, and under the `stashed-` name the publisher collects from.
- `collect` pulls the stashes down, uploads one copy of each file under its own
  name, and deletes the stashes.

`CNB_PIPELINE_NAME` says which platform is running; the names of the artifacts
are in the tool rather than in each pipeline, so three platforms cannot drift
apart. These commands were run against the real API while this was written, on a
throwaway `v0.0.0` tag, which was deleted afterwards.
