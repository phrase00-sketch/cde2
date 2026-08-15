# Security policy

## Supported version

Security fixes target the latest public version of `index.html`.

## Reporting

Please do not publish credentials, private deck files, or unreleased media in an issue. Report security concerns through GitHub's private vulnerability reporting feature when it is available for this repository.

## Local-processing boundary

CDE2 has no project-operated backend and does not intentionally upload imported files. It does load pinned browser libraries and fonts from public CDNs. Imported decks may also reference remote scripts, fonts, or media. Review untrusted decks before opening them and use a separate browser profile for high-risk files.
