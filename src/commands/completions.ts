import { defineCommand } from "citty";
import { HafError } from "../config";

const COMMANDS = ["init", "prc", "use", "dev", "sync", "ls", "rm", "path", "code", "status", "warp", "completions"];
const TREE_COMMANDS = ["use", "dev", "rm", "path", "code"];

const zsh = `#compdef haf
_haf() {
  local -a commands
  commands=(
    'init:Set up haf and the development_repo path for core'
    'prc:Check out a pull request, optionally into its own worktree'
    'use:Switch the frontend served by core'
    'dev:Run script/develop and keep core in sync'
    'sync:Re-mirror the active tree'
    'ls:List the main checkout and all worktrees'
    'rm:Remove a worktree'
    'path:Print a tree path'
    'code:Open a tree in a new VS Code window'
    'status:Show the active frontend and core setup'
    'warp:Install Warp workflows'
    'completions:Print shell completions'
  )
  if (( CURRENT == 2 )); then
    _describe 'command' commands
    return
  fi
  case $words[2] in
    ${TREE_COMMANDS.join("|")})
      local -a trees
      trees=(\${(f)"$(haf ls --names 2>/dev/null)"})
      _describe 'tree' trees ;;
    prc)
      _arguments '(-t --tree)'{-t,--tree}'[check out into a worktree]::name:' '--install[run script/setup]' '--no-install[skip script/setup]' '--use[switch core to it]' '--code[open in a new VS Code window]' '--no-code[do not open VS Code]' '--dev[start haf dev if unbuilt]' '--no-dev[do not start haf dev]' '--set-defaults[choose default answers]' ;;
    sync)
      _arguments '(-w --watch)'{-w,--watch}'[keep syncing]' ;;
    completions)
      _values 'shell' zsh bash fish ;;
  esac
}
compdef _haf haf
`;

const bash = `_haf() {
  local cur=\${COMP_WORDS[COMP_CWORD]}
  if [[ $COMP_CWORD -eq 1 ]]; then
    COMPREPLY=($(compgen -W "${COMMANDS.join(" ")}" -- "$cur"))
    return
  fi
  case \${COMP_WORDS[1]} in
    ${TREE_COMMANDS.join("|")}) COMPREPLY=($(compgen -W "$(haf ls --names 2>/dev/null)" -- "$cur")) ;;
    prc) COMPREPLY=($(compgen -W "--tree --install --no-install --use --code --no-code --dev --no-dev --set-defaults" -- "$cur")) ;;
    sync) COMPREPLY=($(compgen -W "--watch" -- "$cur")) ;;
    completions) COMPREPLY=($(compgen -W "zsh bash fish" -- "$cur")) ;;
  esac
}
complete -F _haf haf
`;

const fish = `complete -c haf -f
complete -c haf -n __fish_use_subcommand -a "${COMMANDS.join(" ")}"
complete -c haf -n "__fish_seen_subcommand_from ${TREE_COMMANDS.join(" ")}" -a "(haf ls --names 2>/dev/null)"
complete -c haf -n "__fish_seen_subcommand_from prc" -s t -l tree -d "Check out into a worktree"
complete -c haf -n "__fish_seen_subcommand_from prc" -l install -d "Run script/setup"
complete -c haf -n "__fish_seen_subcommand_from prc" -l no-install -d "Skip script/setup"
complete -c haf -n "__fish_seen_subcommand_from prc" -l use -d "Switch core to it"
complete -c haf -n "__fish_seen_subcommand_from prc" -l code -d "Open in a new VS Code window"
complete -c haf -n "__fish_seen_subcommand_from prc" -l no-code -d "Don't open VS Code"
complete -c haf -n "__fish_seen_subcommand_from prc" -l dev -d "Start haf dev if unbuilt"
complete -c haf -n "__fish_seen_subcommand_from prc" -l no-dev -d "Don't start haf dev"
complete -c haf -n "__fish_seen_subcommand_from prc" -l set-defaults -d "Choose default answers"
complete -c haf -n "__fish_seen_subcommand_from sync" -s w -l watch -d "Keep syncing"
complete -c haf -n "__fish_seen_subcommand_from completions" -a "zsh bash fish"
`;

const scripts: Record<string, string> = { zsh, bash, fish };

export default defineCommand({
  meta: { name: "completions", description: 'Print shell completions, e.g. eval "$(haf completions zsh)"' },
  args: {
    shell: { type: "positional", required: false, description: "zsh, bash or fish" },
  },
  run({ args }) {
    const shell = args.shell ?? process.env.SHELL?.split("/").pop() ?? "zsh";
    const script = scripts[shell];
    if (!script) throw new HafError(`Unsupported shell "${shell}". Use zsh, bash or fish.`);
    process.stdout.write(script);
  },
});
