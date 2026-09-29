#!/usr/bin/env bash
# Writes .cnb.yml out of .ci/releases, and compiles the tool it names into the
# three platforms that read it.
#
# Run by the maintenance pipeline in .cnb.yml on any push that touches this
# directory, so what runs is what this directory says. Whatever it writes is
# what the branch's own flows then run against - the timeout is what turns a
# broken generator into a failed build rather than a silent one.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

# The mac build has to run on a Mac, and this repository has no Mac of its own,
# so it asks the root organization's connected nodes for one. Their labels are
# the organization's to choose, hence a variable; unset, the build asks for an
# Intel node, which is at least wrong in a way that builds.
macos_tags="${GOONLIB_MACOS_TAGS:-cnb:arch:amd64}"

# The tool's targets, one per platform the release is built for. It is run
# beside the pipeline that needs it, on the machine that is building.
targets="node22-linux-x64,node22-macos-arm64,node22-macos-x64,node22-win-x64"

echo "macos nodes: $macos_tags"

node .cnb/tools/release.js yml release "$macos_tags" > .cnb.yml
node .cnb/tools/release.js list

# A dependency, because the pipeline that runs the tool does not install
# anything: a yml that calls a tool which is not there fails at the point it
# is needed, which is after a twenty-minute build.
npm install --no-save --prefix .cnb/pkg @yao-pkg/pkg@6

PATH="$PWD/.cnb/pkg/node_modules/.bin:$PATH" \
  pkg --targets "$targets" --compress GZip --output .cnb/release \
  .cnb/tools/release.js

chmod +x .cnb/release-linux-x64 .cnb/release-macos-arm64 .cnb/release-macos-x64

wait_status() {
  local code
  code="$(curl --silent --show-error --location --output /dev/null \
    --write-out '%{http_code}' "${CNB_WEB_ENDPOINT:-https://cnb.cool}")"
  echo "the platform answers $code"
}

wait_status
