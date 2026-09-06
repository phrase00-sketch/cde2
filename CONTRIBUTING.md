# Contributing

Thank you for helping improve CDE2.

## Good first reports

- A ZIP or HTML deck that CDE2 cannot open
- A reproducible preview/export mismatch
- A browser/version combination that behaves differently
- A minimal sample that demonstrates a text, asset, audio, or timing bug

Do not attach private production files or copyrighted media that you cannot redistribute. Reduce the report to a minimal synthetic example whenever possible.

## Before opening a pull request

1. Edit the modules in `src/`, then run `npm run build` to regenerate `index.html`. Users must still be able to open the distributed HTML without building it.
2. Do not add account credentials, analytics, tracking, or an upload backend.
3. Pin new CDN dependencies to an explicit version.
4. Run `npm ci`, `npm test`, and `npm run test:browser`. Add a synthetic round-trip case when changing project import, state, or export.
5. Describe the input format and the user-visible behavior you tested.

Small, focused changes are easiest to review.
