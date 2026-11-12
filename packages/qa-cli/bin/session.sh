# Source this file to make qa available in the current Bash session.
qa_session_cli="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)/qa.sh"
qa() { bash "$qa_session_cli" "$@"; }
