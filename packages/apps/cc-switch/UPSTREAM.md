# CC Switch

## Source

- Repository: https://github.com/farion1231/cc-switch
- Official site: https://ccswitch.io/
- Release: https://github.com/farion1231/cc-switch/releases/tag/v4.0.30
- Version: 4.0.30
- Commit: db6f08c593689ec345f7937311d3002a5f38d2a5
- License: MIT

## Installation Boundary

CC Switch is a shared system or user-scoped desktop dependency.
The CLI reuses an existing installation when available and installs it once in the shared tool directory when missing.
Portable files are stored in the shared tool directory and reused by QA environments.
The QA root never owns the portable application files.
The installer does not write registry keys or protected system application directories.

## Supported Files

| Platform | Architecture | Release asset | Format | SHA256 |
| --- | --- | --- | --- | --- |
| Windows | x64 | `CC-Switch-v4.0.30-Windows-Portable.zip` | zip | `78f44e0ce7993b057df81474455009a028531509d05c66f08799a038d00c96d3` |
| Windows | arm64 | `CC-Switch-v4.0.30-Windows-arm64-Portable.zip` | zip | `f1987aee217b2c5ee13f2339b6921274be4d2c3dacbe6c0acf5445e561b8584c` |
| macOS | universal | `CC-Switch-v4.0.30-macOS.zip` | zip | `2474a2c5158a481ba217d466fc28c06e795d19f5b791d6bca721c0f8db98df6c` |
| Linux | x86_64 | `CC-Switch-v4.0.30-Linux-x86_64.AppImage` | AppImage | `aa8b5dde02ee1b89a1508704963ff2316a58b15f4d532597d2d67aa710ff1890` |
| Linux | arm64 | `CC-Switch-v4.0.30-Linux-arm64.AppImage` | AppImage | `6d1215c3e23ec842782126523b8fc9eeef78ffd9bc5a12c2149c0f3303ea6e22` |

## Requirements

- Windows 10 or later.
- macOS 12 or later.
- Linux with glibc 2.35 or later and WebKitGTK 4.1.

Linux distributions without WebKitGTK 4.1 remain unsupported by the upstream application.
The installer reports that condition instead of changing system packages.

## Update Procedure

1. Run `pnpm upstream:sync` from the repository root.
2. Review the release, license, commit, and all five official asset hashes.
3. Verify installation, ownership records, and CI on each supported platform before release.
