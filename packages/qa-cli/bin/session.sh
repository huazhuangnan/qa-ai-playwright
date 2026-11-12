# Source this file to make qa available in the current Bash or zsh session.
if [ -n "${ZSH_VERSION:-}" ]; then
  qa_session_source="${(%):-%x}"
else
  qa_session_source="${BASH_SOURCE[0]}"
fi
qa_session_cli="$(cd -- "$(dirname "$qa_session_source")" && pwd -P)/qa.sh"
unset qa_session_source
qa() { bash "$qa_session_cli" "$@"; }
