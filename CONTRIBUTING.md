# Contributing to localports

Thanks for taking the time to contribute!

## Getting started

```sh
git clone https://github.com/moh-hit/localports
cd localports
npm install
npm run dev
```

`npm run dev` runs the app directly from source via `tsx`, so changes are reflected immediately on the next run.

## Workflow

1. Fork the repo and create a branch from `main`.
2. Make your changes.
3. Make sure the project builds: `npm run build`
4. Open a pull request — describe what you changed and why.

Direct pushes to `main` are not allowed. All changes go through a PR.

## Reporting bugs

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md) and include:

- Your OS and terminal emulator
- Node.js version (`node -v`)
- What you expected vs. what happened
- Any error output

## Suggesting features

Open a [feature request](.github/ISSUE_TEMPLATE/feature_request.md). Keep in mind localports is intentionally minimal — proposals that stay focused on the localhost dev workflow are most likely to land.

## Code style

- TypeScript throughout
- No comments unless the *why* is non-obvious
- Prefer editing existing files over adding new ones
- Keep components small and focused

## License

By contributing you agree that your changes will be licensed under the [MIT License](LICENSE).
