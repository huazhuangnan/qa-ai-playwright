#!/usr/bin/env bash
# System Bash bootstrap. The repository CLI itself is TypeScript.
set -euo pipefail

repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)
while IFS='=' read -r key value; do
  if [[ "$key" == QA_NODE_MAJOR ]]; then
    value=${value%$'\r'}
    export QA_NODE_MAJOR=${QA_NODE_MAJOR:-$value}
  fi
done <"$repo/src/runtime-versions.env"
case "$QA_NODE_MAJOR" in
  22|24|26) ;;
  *) echo 'Use a Playwright-supported Node LTS: 22/24/26' >&2; exit 2 ;;
esac

root=${QA_ROOT:-"$PWD/.qa-env"}
cli_args=()
while (($#)); do
  case "$1" in
    --root)
      shift
      (($#)) || { echo '--root requires a directory' >&2; exit 2; }
      root=$1
      ;;
    --root=*) root=${1#--root=} ;;
    run)
      cli_args+=("$@")
      break
      ;;
    *) cli_args+=("$1") ;;
  esac
  shift
done
set -- "${cli_args[@]}"

[[ -n "$root" ]] || { echo '--root requires a directory' >&2; exit 2; }
case "/$root/" in
  */../*) echo '--root must not contain parent traversal components' >&2; exit 2 ;;
esac
[[ ! -L "$root" ]] || { echo 'Environment root must not be a symlink' >&2; exit 1; }
[[ ! -f "$root" ]] || { echo 'Environment root must be a directory' >&2; exit 1; }

canonical() {
  local path=$1
  local tail=''
  while [[ ! -d "$path" ]]; do
    tail="/$(basename "$path")$tail"
    path=$(dirname "$path")
  done
  printf '%s%s' "$(cd "$path" && pwd -P)" "$tail"
}
root=$(canonical "$root")
current=$(pwd -P)
case "$root" in
  /|"$current"|"$repo")
    echo 'Use a dedicated child directory for --root' >&2
    exit 1
    ;;
esac
case "$repo/" in
  "$root/"*)
    echo 'Root may not contain the repository' >&2
    exit 1
    ;;
esac

export QA_ROOT="$root" QA_REPO="$repo"
node_dir="$root/runtime/node"
node="$node_dir/bin/node"
marker="$root/.qa-managed"
first=${1:-help}
if [[ "$first" == help || "$first" == --help || "$first" == -h ]]; then
  cat <<'EOF'
qa env init <python|typescript|both> [--full]
qa env check <python|typescript|both> [--full]
qa env uninstall
qa project init <project> --language <python|typescript> [--browser <name>]
  --language alias: --语言
qa project check <project> [--browser <name>]
qa project uninstall <project>
qa doctor
qa shell
qa mcp add <name>
qa mcp remove <name>
qa mcp list
qa run <command> [...]
EOF
  exit 0
fi
if [[ "$first" == env && ( ${2:-} == init || ${2:-} == check ) ]]; then
  case "${3:-}" in
    python|typescript|both) ;;
    *) echo "Usage: qa env $2 <python|typescript|both>" >&2; exit 2 ;;
  esac
fi

if [[ ! -x "$node" ]]; then
  if [[ "$first" == doctor || ( "$first" == env && ${2:-} == check ) || "$first" == project ]]; then
    echo "Environment not initialized: $root"
    exit 1
  fi
  if [[ "$first" == env && ${2:-} == uninstall ]]; then
    [[ -e "$root" ]] || { echo 'Nothing to uninstall'; exit 0; }
    [[ ! -L "$root" && -f "$marker" && "$(cat "$marker")" == qa-local-environment-v1 ]] \
      || { echo 'Refusing to remove an unmanaged or linked directory' >&2; exit 1; }
    rm -rf -- "$root"
    exit 0
  fi
  if [[ "$first" != env || ${2:-} != init ]]; then
    echo "Environment not initialized: $root. Run qa env init <python|typescript|both>" >&2
    exit 1
  fi
  if [[ -f "$marker" ]]; then
    [[ "$(cat "$marker")" == qa-local-environment-v1 ]] \
      || { echo 'Invalid environment marker' >&2; exit 1; }
  elif [[ -d "$root" && -n "$(ls -A "$root")" ]]; then
    echo 'Root already contains unmanaged files' >&2
    exit 1
  fi
  mkdir -p "$root/cache/downloads"
  printf '%s' qa-local-environment-v1 >"$marker"

  case "$(uname -m)" in
    x86_64|amd64) arch=x64 ;;
    arm64|aarch64) arch=arm64 ;;
    *) echo 'Unsupported architecture' >&2; exit 1 ;;
  esac
  case "$(uname -s)" in
    Darwin) platform=darwin ;;
    Linux) platform=linux ;;
    *) echo 'Use qa.ps1 on Windows' >&2; exit 1 ;;
  esac

  fetch() {
    if command -v curl >/dev/null 2>&1; then
      curl --fail --location --retry 3 --retry-delay 2 \
        --connect-timeout 30 --max-time 300 "$1" -o "$2"
    elif command -v wget >/dev/null 2>&1; then
      wget --tries=3 --timeout=30 -O "$2" "$1"
    else
      echo 'curl or wget is required for bootstrap' >&2
      exit 1
    fi
  }
  release_base="https://nodejs.org/dist/latest-v$QA_NODE_MAJOR.x"
  checksum="$root/cache/downloads/node-SHASUMS256.txt"
  fetch "$release_base/SHASUMS256.txt" "$checksum"
  # Each checksum line contains "<sha256>  <filename>"; match the filename suffix.
  name=$(awk -v suffix="-$platform-$arch.tar.gz" '
    {
      candidate = $2
      sub(/^\*/, "", candidate)
      if (substr(candidate, length(candidate) - length(suffix) + 1) == suffix) {
        print candidate
        exit
      }
    }
  ' "$checksum")
  [[ -n "$name" ]] || { echo "Node $QA_NODE_MAJOR release file was not found" >&2; exit 1; }
  [[ "$name" =~ ^node-v[0-9]+\.[0-9]+\.[0-9]+-$platform-$arch\.tar\.gz$ ]] \
    || { echo 'Unexpected Node archive name' >&2; exit 1; }
  expected=$(awk -v target="$name" '$2 == target || $2 == "*" target { print $1; exit }' "$checksum")
  [[ "$expected" =~ ^[a-fA-F0-9]{64}$ ]] || { echo 'Invalid Node checksum' >&2; exit 1; }
  archive="$root/cache/downloads/$name"
  if [[ ! -f "$archive" ]]; then
    fetch "$release_base/$name" "$archive"
  fi
  hash_file() {
    if command -v sha256sum >/dev/null 2>&1; then
      sha256sum "$1" | awk '{ print $1 }'
    else
      shasum -a 256 "$1" | awk '{ print $1 }'
    fi
  }
  actual=$(hash_file "$archive")
  if [[ "$expected" != "$actual" ]]; then
    rm -f -- "$archive"
    fetch "$release_base/$name" "$archive"
    actual=$(hash_file "$archive")
  fi
  [[ "$expected" == "$actual" ]] || { echo 'Node checksum mismatch' >&2; exit 1; }

  staging="$root/runtime/node-extract"
  case "$staging/" in
    "$root/"*) ;;
    *) echo 'Unsafe Node staging path' >&2; exit 1 ;;
  esac
  rm -rf -- "$staging"
  mkdir -p "$staging"
  tar -xzf "$archive" -C "$staging" --strip-components=1
  if [[ -e "$node_dir" ]]; then
    case "$node_dir/" in
      "$root/"*) rm -rf -- "$node_dir" ;;
      *) echo 'Unsafe Node installation path' >&2; exit 1 ;;
    esac
  fi
  mv "$staging" "$node_dir"
fi

[[ -x "$node" ]] || { echo 'Managed Node is missing; remove the environment and rerun env init' >&2; exit 1; }
version=$("$node" --version)
[[ "$version" == v"$QA_NODE_MAJOR".* ]] \
  || { echo "Managed Node $QA_NODE_MAJOR is unavailable: $version" >&2; exit 1; }
set +e
"$node" --experimental-strip-types "$repo/src/qa-cli.ts" "$@"
code=$?
set -e
if [[ "$code" == 20 ]]; then
  [[ ! -L "$root" && -f "$marker" && "$(cat "$marker")" == qa-local-environment-v1 ]] \
    || { echo 'Uninstall root validation failed' >&2; exit 1; }
  rm -rf -- "$root"
  echo "Uninstalled: $root"
  exit 0
fi
exit "$code"
