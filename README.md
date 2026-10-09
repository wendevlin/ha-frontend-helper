# haf

Home Assistant **f**rontend dev helper. It checks out PRs (optionally into their own git worktree), and it switches which frontend your local core serves **without restarting core**.

## Install

Requires Node.js 22+, `git` and the GitHub CLI (`gh`).

```sh
npm install -g ha-frontend-helper   # provides the `haf` command
haf init                   # one-time setup, then restart core once
haf prc --set-defaults     # recommended: stop answering the same questions every time
haf warp                   # optional: add haf workflows to Warp
eval "$(haf completions zsh)"   # optional: add to ~/.zshrc
```

> [!TIP]
> `haf prc` asks up to four questions per checkout: install dependencies, open VS Code, switch core and start `haf dev`. Run **`haf prc --set-defaults`** once and choose *Ask*, *Always* or *Never* for each. For example, always install and open VS Code but never start the dev build, and `haf prc 12345 --tree` runs straight through. You can still override a single run with flags like `--no-install`.

## Commands

| Command | What it does |
| --- | --- |
| `haf prc 12345` | `gh pr checkout` in the main checkout (a PR URL works too) |
| `haf prc 12345 --tree [name]` | Check out into `<trees>/pr-12345-<branch>` (or `<name>`) as a worktree |
| `haf prc --set-defaults` | Choose Ask / Always / Never for each `prc` question |
| `haf use [tree]` | Interactive pick of the frontend core serves; refresh the browser and it's live |
| `haf dev [tree]` | `script/develop` in the tree plus live mirroring of each rebuild |
| `haf sync [--watch]` | Re-mirror the active tree (e.g. after `script/build_frontend`) |
| `haf ls` / `haf status` | Show trees, build state, PRs and the core setup |
| `haf rm [tree]` | Remove a worktree (and optionally its branch) |
| `cd "$(haf path 12345)"` | Jump into a tree |
| `haf code [tree]` | Open a tree in a new VS Code window |

`prc` also takes `--install` / `--no-install` (run `script/setup`), `--use` / `--no-use`, `--code` / `--no-code` and `--dev` / `--no-dev` (start `haf dev` when the checkout has no build). Each of these overrides your [`--set-defaults`](#install) for that run. When run from VS Code's integrated terminal, `prc --tree` asks whether to open the new worktree in a new VS Code window. Trees can be referred to by directory name, branch or PR number.

## How switching works without restarts

Core is pointed once at a stable directory:

```yaml
frontend:
  development_repo: ~/.local/share/haf/frontend
```

With `development_repo` set, core serves `frontend_latest/`, `static/` and the others through plain aiohttp static resources. Those resolve their directory path once at startup and then read files on every request, and `index.html` is re-read on every request too. A symlink switch therefore needs a restart, but replacing the *contents* of a fixed directory does not.

`haf use` rebuilds `hass_frontend/` in that directory as **hardlinks** to the chosen tree's build, then swaps it in atomically. This is instant and costs no extra disk. `haf dev` and `haf sync --watch` keep re-linking while `script/develop` rebuilds. If you switch to another tree, an older `haf dev` stops mirroring.

The mirror dir must be on the same filesystem as your trees for hardlinks. `haf init` picks a location that is, and otherwise haf falls back to copying.

## Config

`~/.config/haf/config.json` holds `frontendRepo`, `treesDir`, `mirrorDir`, `coreConfigDir` and `active`. Re-run `haf init` to change them.

## Development

Development uses [Bun](https://bun.sh); the published package runs on plain Node.

```sh
bun install
bun src/index.ts <command>   # run from source
bun run build                # bundle to dist/haf.js (what npm ships)
bun run install-bin          # or: standalone binary in ~/.local/bin/haf
bun test
bun run typecheck
bun run lint                 # biome: lint + format check
bun run format               # biome: apply fixes and formatting
```

CI runs lint, typecheck, tests and a Node smoke test on Linux and macOS for every push to `main` and every PR.

### Releasing

1. Bump `version` in `package.json` and push.
2. Create a GitHub release with the tag `v<version>`, e.g. `v0.2.0`. A prerelease is published under npm's `next` tag.
3. The release workflow checks that the tag matches `package.json`, runs all checks and publishes to npm with provenance via [trusted publishing](https://docs.npmjs.com/trusted-publishers).

## License

MIT
