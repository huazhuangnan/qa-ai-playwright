# CC Switch

## Source

- Repository: https://github.com/farion1231/cc-switch
- Official site: https://ccswitch.io/
- Release: https://github.com/farion1231/cc-switch/releases/tag/v4.0.28
- Version: 4.0.28
- Commit: 8656ebd91f3eba631837126e29df71e8353b7e43
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
| Windows | x64 | `CC-Switch-v4.0.28-Windows-Portable.zip` | zip | `c690bc6ef1bc0bce62db50d8d089abf50eaa0c98f18765016b920f3c14b0c770` |
| Windows | arm64 | `CC-Switch-v4.0.28-Windows-arm64-Portable.zip` | zip | `cce4ea4e311acb3cebce31c84c188f3b85b9c5413e2dee1c9d011db3487615f8` |
| macOS | universal | `CC-Switch-v4.0.28-macOS.zip` | zip | `4594f9c5b88e150b50bbc7a95d96406c7f471de472846e5289d97c86f6374619` |
| Linux | x86_64 | `CC-Switch-v4.0.28-Linux-x86_64.AppImage` | AppImage | `19640a4df129b35dd176763a5d64746a8f9c4d4625573350be11df036cea7433` |
| Linux | arm64 | `CC-Switch-v4.0.28-Linux-arm64.AppImage` | AppImage | `4ed5f7704052693b1cbc7095598551e2f94a6289a54950bd2bfc1aac4a5ac37c` |

## Requirements

- Windows 10 or later.
- macOS 12 or later.
- Linux with glibc 2.35 or later and WebKitGTK 4.1.

Linux distributions without WebKitGTK 4.1 remain unsupported by the upstream application.
The installer reports that condition instead of changing system packages.

## Update Procedure

1. Select a published release and verify its commit.
2. Obtain the five official asset hashes from release metadata.
3. Update `manifest.json`, this file, and the pinned version.
4. Update install, check, lock, and CI assertions together.
5. Verify every supported asset before release.
