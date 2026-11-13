#!/usr/bin/env bash
# Install the user-level QA command without replacing an existing command.
set -euo pipefail
source_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)
install_root="$HOME/.local/share/qa-ai-playwright"
bin_dir="$HOME/.local/bin"
command_path="$bin_dir/qa"
marker='# QA-AI-PLAYWRIGHT MANAGED COMMAND'
profile="$HOME/.profile"
bash_profile="$HOME/.bash_profile"
bash_login="$HOME/.bash_login"
zprofile="$HOME/.zprofile"
bashrc="$HOME/.bashrc"
zshrc="$HOME/.zshrc"
path_line='export PATH="$HOME/.local/bin:$PATH" # QA-AI-PLAYWRIGHT'
hash_file() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d ' ' -f 1; else shasum -a 256 "$1" | cut -d ' ' -f 1; fi; }

reinstall=0
if [[ ${1:-} == --reinstall ]]; then reinstall=1; fi
if [[ ${1:-} == --uninstall ]]; then
  if [[ -e "$command_path" || -L "$command_path" ]]; then
    [[ -f "$command_path" && ! -L "$command_path" ]] && cmp -s "$command_path" <(printf '%s\n' '#!/usr/bin/env bash' "$marker" 'exec bash "$HOME/.local/share/qa-ai-playwright/packages/qa-cli/bin/qa.sh" "$@"') || { echo 'Command was modified; installation preserved' >&2; exit 1; }
  fi
  for target in "$profile" "$bash_profile" "$bash_login" "$zprofile" "$bashrc" "$zshrc"; do
    if [[ -f "$install_root/.path-$(basename "$target")" ]]; then
      if [[ -L "$target" || ( -e "$target" && ! -f "$target" ) ]]; then
        echo "Profile became unsupported; installation preserved: $target" >&2
        exit 1
      fi
    fi
  done
  env_root=${QA_ROOT:-"$HOME/.qa-ai-playwright"}
  if [[ -e "$env_root/.qa-managed" && ! -f "$install_root/.environment-cleaned" ]]; then
    [[ -f "$install_root/.qa-managed" && -f "$install_root/.files" && ! -L "$install_root" ]] || { echo 'Installation ownership cannot be verified' >&2; exit 1; }
    while IFS=$'\t' read -r hash relative; do
      [[ "$relative" == packages/* && "$relative" != *'..'* && -f "$install_root/$relative" && ! -L "$install_root/$relative" && "$(hash_file "$install_root/$relative")" == "$hash" ]] || { echo 'Installed files changed; environment cleanup cancelled' >&2; exit 1; }
      parent=$(dirname "$install_root/$relative")
      while [[ "$parent" == "$install_root"* ]]; do
        [[ ! -L "$parent" ]] || { echo 'Linked installation path; environment cleanup cancelled' >&2; exit 1; }
        [[ "$parent" == "$install_root" ]] && break
        parent=$(dirname "$parent")
      done
    done < "$install_root/.files"
    bash "$install_root/packages/qa-cli/bin/qa.sh" env uninstall || { echo 'Environment cleanup failed; installation preserved' >&2; exit 1; }
    touch "$install_root/.environment-cleaned"
  fi
  if [[ -f "$command_path" && ! -L "$command_path" ]] && cmp -s "$command_path" <(printf '%s\n' '#!/usr/bin/env bash' "$marker" 'exec bash "$HOME/.local/share/qa-ai-playwright/packages/qa-cli/bin/qa.sh" "$@"'); then rm "$command_path"; fi
  for target in "$profile" "$bash_profile" "$bash_login" "$zprofile" "$bashrc" "$zshrc"; do
    if [[ -f "$target" && ! -L "$target" && -f "$install_root/.path-$(basename "$target")" ]]; then
      created_profile="$install_root/.created-profile-$(basename "$target")"
      tmp=$(mktemp "${target}.XXXXXX")
      grep -Fxv "$path_line" "$target" > "$tmp" || true
      cat "$tmp" > "$target"
      rm "$tmp" "$install_root/.path-$(basename "$target")"
      if [[ -f "$created_profile" && ! -s "$target" ]]; then rm -f "$target"; fi
      rm -f "$created_profile"
    elif [[ ! -e "$target" && ! -L "$target" ]]; then
      rm -f "$install_root/.path-$(basename "$target")" "$install_root/.created-profile-$(basename "$target")"
    fi
  done
  if [[ -f "$install_root/.qa-managed" && -f "$install_root/.files" ]]; then
    remaining=0
    while IFS=$'\t' read -r hash relative; do
      [[ "$relative" == packages/* && "$relative" != *'..'* ]] || continue
      file="$install_root/$relative"
      parent=$(dirname "$file")
      safe=1
      while [[ "$parent" == "$install_root"* ]]; do
        if [[ -L "$parent" ]]; then safe=0; break; fi
        [[ "$parent" == "$install_root" ]] && break
        parent=$(dirname "$parent")
      done
      if [[ $safe == 1 && -f "$file" && ! -L "$file" && "$(hash_file "$file")" == "$hash" ]]; then rm "$file"; elif [[ -e "$file" || -L "$file" ]]; then remaining=1; fi
    done < "$install_root/.files"
    if [[ $remaining == 0 ]]; then rm -f "$install_root/.files" "$install_root/.qa-managed" "$install_root/.environment-cleaned"; fi
    while IFS= read -r -d '' directory; do
      rmdir "$directory" 2>/dev/null || true
    done < <(find "$install_root/packages" -depth -type d -print0 2>/dev/null)
    rmdir "$install_root" 2>/dev/null || true
  fi
  echo "Command removed. Modified or untracked files are preserved at $install_root."
  exit 0
fi
if [[ -f "$install_root/.qa-managed" && -f "$install_root/.files" ]]; then
  if [[ $reinstall == 0 ]]; then
    [[ ! -L "$install_root" && -f "$command_path" && ! -L "$command_path" ]] && cmp -s "$command_path" <(printf '%s\n' '#!/usr/bin/env bash' "$marker" 'exec bash "$HOME/.local/share/qa-ai-playwright/packages/qa-cli/bin/qa.sh" "$@"') || { echo 'Installation ownership cannot be verified' >&2; exit 1; }
    while IFS=$'\t' read -r hash relative; do
      [[ "$relative" == packages/* && "$relative" != *'..'* && -f "$install_root/$relative" && ! -L "$install_root/$relative" && "$(hash_file "$install_root/$relative")" == "$hash" ]] || { echo "Modified installed file: $relative" >&2; exit 1; }
    done < "$install_root/.files"
    while IFS= read -r -d '' file; do
      relative=${file#"$install_root/"}
      [[ ! -L "$file" ]] && cut -f2- "$install_root/.files" | grep -Fxq "$relative" || { echo "Untracked installed file: $relative" >&2; exit 1; }
    done < <(find "$install_root/packages" \( -type f -o -type l \) -print0)
  fi
  stage=$(mktemp -d "$install_root/.upgrade.XXXXXX")
  trap 'echo "Upgrade did not complete; recovery files are preserved at $stage" >&2' EXIT
  cp -R "$source_root/packages" "$stage/packages"
  find "$stage/packages" -type f -print0 | while IFS= read -r -d '' file; do printf '%s\t%s\n' "$(hash_file "$file")" "packages/${file#"$stage/packages/"}"; done > "$stage/files"
  mv "$install_root/packages" "$stage/previous"
  if ! mv "$stage/packages" "$install_root/packages"; then mv "$stage/previous" "$install_root/packages"; exit 1; fi
  if ! mv "$stage/files" "$install_root/.files"; then rm -rf "$install_root/packages"; mv "$stage/previous" "$install_root/packages"; exit 1; fi
  if [[ $reinstall == 1 ]]; then
    cat > "$command_path" <<'EOF'
#!/usr/bin/env bash
# QA-AI-PLAYWRIGHT MANAGED COMMAND
exec bash "$HOME/.local/share/qa-ai-playwright/packages/qa-cli/bin/qa.sh" "$@"
EOF
    chmod +x "$command_path"
  fi
  rm -rf "$stage"
  trap - EXIT
  echo 'Updated qa.'
  exit 0
fi
if command -v qa >/dev/null 2>&1; then echo 'A qa command already exists on PATH' >&2; exit 1; fi
for target in "$profile" "$bash_profile" "$bash_login" "$zprofile" "$bashrc" "$zshrc"; do
  if [[ -L "$target" ]]; then echo "Refusing to modify symlink $target" >&2; exit 1; fi
done
if [[ -e "$command_path" || -L "$command_path" ]]; then
  echo "Refusing to replace $command_path" >&2; exit 1
fi
preserved_install=0
if [[ -e "$install_root" || -L "$install_root" ]]; then
  [[ -d "$install_root" && ! -L "$install_root" ]] \
    || { echo "Refusing to replace linked or non-directory $install_root" >&2; exit 1; }
  for entry in "$install_root"/* "$install_root"/.[!.]* "$install_root"/..?*; do
    [[ -e "$entry" || -L "$entry" ]] || continue
    [[ "$(basename "$entry")" == node ]] && continue
    echo "Refusing to replace existing $install_root; review $entry first" >&2
    exit 1
  done
  if [[ -e "$install_root/node" || -L "$install_root/node" ]]; then
    [[ -d "$install_root/node" && ! -L "$install_root/node" ]] \
      || { echo "Refusing to reuse linked or non-directory $install_root/node" >&2; exit 1; }
  fi
  preserved_install=1
fi
install_marker='qa-ai-playwright-install-v1'
created_install=0
created_command=0
created_bin=0
cleanup_partial_install() {
  status=${1:-$?}
  cleanup_failed=0
  trap - ERR INT TERM
  set +e
  for target in "$profile" "$bash_profile" "$bash_login" "$zprofile" "$bashrc" "$zshrc"; do
    if [[ -f "$target" && ! -L "$target" && -f "$install_root/.path-$(basename "$target")" ]]; then
      tmp=$(mktemp "${target}.XXXXXX")
      grep -Fxv "$path_line" "$target" > "$tmp" || true
      cat "$tmp" > "$target" || cleanup_failed=1
      rm -f "$tmp" || cleanup_failed=1
      if [[ -f "$install_root/.created-profile-$(basename "$target")" && ! -s "$target" ]]; then rm -f "$target"; fi
    fi
  done
  if [[ $created_command == 1 && ( -e "$command_path" || -L "$command_path" ) && ! -d "$command_path" ]]; then
    rm -f "$command_path" || cleanup_failed=1
  fi
  if [[ $created_install == 1 ]]; then
    if [[ $preserved_install == 1 ]]; then
      rm -rf "$install_root/packages" || cleanup_failed=1
      rm -f "$install_root"/.files "$install_root"/.qa-managed "$install_root"/.path-* \
        "$install_root"/.created-profile-* "$install_root"/.environment-cleaned || cleanup_failed=1
    elif [[ ! -e "$install_root/.qa-managed" ]]; then
      rm -rf "$install_root" || cleanup_failed=1
    elif [[ -f "$install_root/.qa-managed" && "$(cat "$install_root/.qa-managed")" == "$install_marker" ]]; then
      rm -rf "$install_root" || cleanup_failed=1
    fi
  fi
  if [[ $created_bin == 1 && -d "$bin_dir" && ! -L "$bin_dir" ]]; then rmdir "$bin_dir" 2>/dev/null || true; fi
  if [[ $cleanup_failed == 0 ]]; then
    echo 'Installation failed; partial files were rolled back.' >&2
  else
    echo "Installation failed; inspect residual files under $install_root" >&2
  fi
  exit "$status"
}
trap cleanup_partial_install ERR
trap 'cleanup_partial_install 130' INT
trap 'cleanup_partial_install 143' TERM
if [[ ! -d "$bin_dir" ]]; then created_bin=1; fi
created_install=1
mkdir -p "$install_root" "$bin_dir"
printf '%s' "$install_marker" > "$install_root/.qa-managed"
if [[ "$source_root" != "$install_root" ]]; then
  mkdir -p "$install_root/packages"
  cp -R "$source_root/packages/." "$install_root/packages/"
fi
find "$install_root/packages" -type f -print0 | while IFS= read -r -d '' file; do
  printf '%s\t%s\n' "$(hash_file "$file")" "${file#"$install_root/"}"
done > "$install_root/.files"
created_command=1
cat > "$command_path" <<'EOF'
#!/usr/bin/env bash
# QA-AI-PLAYWRIGHT MANAGED COMMAND
exec bash "$HOME/.local/share/qa-ai-playwright/packages/qa-cli/bin/qa.sh" "$@"
EOF
chmod +x "$command_path"
for target in "$profile" "$bash_profile" "$bash_login" "$zprofile" "$bashrc" "$zshrc"; do
  if [[ ! -e "$target" ]]; then touch "$install_root/.created-profile-$(basename "$target")"; fi
  touch "$target"
  if ! grep -Fxq "$path_line" "$target"; then
    touch "$install_root/.path-$(basename "$target")"
    if [[ -s "$target" && -n "$(tail -c 1 "$target")" ]]; then printf '\n' >> "$target"; fi
    printf '%s\n' "$path_line" >> "$target"
  fi
done
trap - ERR INT TERM
echo 'Installed qa. Start a new login shell to update PATH.'
