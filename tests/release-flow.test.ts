/**
 * The release flow: what .cnb.yml is generated from, and what the release
 * commands decide before they touch the network.
 *
 * The flow is one tool and one directory of small files, and the parts worth
 * testing are the parts that used to be three copies of a YAML: which
 * pipelines .cnb.yml holds, where a tag and a hand-run go, and which files a
 * platform is expected to produce.
 */

import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

const root = resolve(__dirname, '..')
const tool = join(root, '.cnb/tools/release.js')

const run = (args: string[], cwd = root, env: Record<string, string> = {}) =>
  execFileSync(process.execPath, [tool, ...args], {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  })

const yml = (branch = 'release', tags = 'cnb:arch:amd64') =>
  run(['yml', branch, tags])

describe('the generated .cnb.yml', () => {
  it('puts the builds under both a tag and a hand-run', async () => {
    const text = yml()
    // A tag belongs to the repository, a hand-run to the branch, and both want
    // the same builds.
    expect(text).toContain('release:\n')
    expect(text).toContain('  api_trigger_publish:')
    expect(text).toContain('$:\n  tag_push:')
  })

  it('names the branch it was asked for and nothing else', () => {
    expect(yml('v1')).toContain('v1:\n')
    expect(yml('v1')).not.toContain('release:\n')
  })

  it('leaves the publisher out of a hand-run, so one platform is one build', () => {
    const manual = yml().split('$:\n')[0]
    expect(manual).not.toContain('release-publish')
  })

  it('puts the mac build on the node it was told about, and no other', () => {
    const text = yml('release', 'mac,arm64')
    // Once per event it answers to, and on the mac build alone.
    expect(text.match(/runner:/g)).toHaveLength(3)
    const names = text.split('runner:')
    expect(names.slice(1).every((part) => part.includes('release-macos'))).toBe(
      true,
    )
    expect(text).toMatch(/runner:\n\s+tags:\n\s+- mac\n\s+- arm64/)
  })

  it('is one branch and the catch-all, and nothing else', () => {
    expect(yml().match(/^[^#\s]\S*:$/gm)).toEqual(['release:', '$:'])
  })
})

describe('what a platform uploads', () => {
  it('refuses a pipeline that is not a platform', () => {
    expect(() => run(['upload'], root, { CNB_PIPELINE_NAME: 'tests' })).toThrow(
      /not a platform/,
    )
  })

  it('says what is in the directory without opening the files', () => {
    const lines = run(['list']).trim().split('\n')
    expect(lines.some((l) => l.startsWith('releases.linux.json'))).toBe(true)
    expect(lines.some((l) => l.includes('release-publish'))).toBe(true)
  })
})

describe('reading a release file', () => {
  const scratch = mkdtemp(join(tmpdir(), 'goonlib-release-'))

  afterAll(async () => {
    await rm(await scratch, { recursive: true, force: true })
  })

  const withFile = async (name: string, contents: string) => {
    const dir = await scratch
    await mkdir(join(dir, '.ci/releases'), { recursive: true })
    await mkdir(join(dir, '.cnb/tools'), { recursive: true })
    await writeFile(join(dir, '.ci/releases', name), contents)
    return dir
  }

  it('refuses a pipeline key the platform does not know', async () => {
    const dir = await withFile(
      'releases.bad.json',
      JSON.stringify({ pipeline: { name: 'x', nonsense: true } }),
    )
    expect(() => run(['list'], dir)).toThrow(/is not a pipeline key/)
  })

  it('refuses a file with no pipeline name', async () => {
    const dir = await withFile(
      'releases.bad.json',
      JSON.stringify({ pipeline: { stages: [] } }),
    )
    expect(() => run(['list'], dir)).toThrow(/no pipeline.name/)
  })

  it('reports a broken file with its path', async () => {
    const dir = await withFile('releases.bad.json', '{')
    let said = ''
    try {
      run(['list'], dir)
    } catch (e) {
      said = String(e)
    }
    expect(said).toContain('releases.bad.json')
  })
})

describe('the maintenance pipeline', () => {
  it('is in .cnb.yml, and not the one it rewrites', async () => {
    const committed = await readFile(join(root, '.cnb.yml'), 'utf8')
    const generated = yml()
    // Whatever the checked-in file says, it is what the generator produces.
    expect(committed).toBe(generated)
  })
})
