// web-ext configuration (CommonJS, because package.json sets "type": "module").
// Keeps repo/dev-only files out of the packaged Firefox build.
// NOTE: pendo-install-quality.md is fetched at runtime (popup.js), so it is
// intentionally NOT ignored here even though it is a Markdown file.
module.exports = {
  sourceDir: 'extension',
  artifactsDir: 'dist',
  // Paths are relative to sourceDir (extension/).
  ignoreFiles: [
    'popup-actions.md',
    'vendor/README.md',
    '**/.DS_Store',
  ],
  build: {
    overwriteDest: true,
  },
};
