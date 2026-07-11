# Guitar Tablature Generator

A browser-based workspace for writing guitar tablature and standard notation, recording tapped rhythms, and importing or exporting music files.

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

## Validate a production build

```bash
npm run lint
npm run build
```

## Deployment

Every push to `main` runs the GitHub Actions workflow in `.github/workflows/deploy-pages.yml`. The workflow builds the app and deploys the `dist` directory to GitHub Pages.
