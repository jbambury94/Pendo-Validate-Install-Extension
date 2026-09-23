# Popup buttons and links — `data-action` reference

| Element | `data-action` | id | Accessible name |
|---------|----------------|----|------------------|
| Close panel | `close-panel` | `#closeBtn` | `aria-label="Close panel"` |
| Status tab | `tab-status` | `#tabStatusBtn` (panel `#tabStatusPanel`, count `#statusTabCount`) | text "Status" + `role="tab"`, `aria-selected`, `aria-controls="tabStatusPanel"` |
| Logs tab | `tab-logs` | `#tabLogsBtn` (panel `#tabLogsPanel`, count `#logsTabCount`) | text "Logs" + `role="tab"`, `aria-selected`, `aria-controls="tabLogsPanel"` |
| Settings tab | `tab-settings` | `#tabSettingsBtn` (panel `#tabSettingsPanel`) | text "Settings" + `role="tab"`, `aria-selected`, `aria-controls="tabSettingsPanel"` |
| Toggle Errors check group | `toggle-check-group` | `#checkGroupHeadErr` | visible group title |
| Toggle Warnings check group | `toggle-check-group` | `#checkGroupHeadWarn` | visible group title |
| Toggle Passing check group | `toggle-check-group` | `#checkGroupHeadOk` | visible group title |
| Copy button — Install details | `copy-kv` | `#installDetailsCopyPendoPresent`, `#installDetailsCopyValidateInstall`, `#installDetailsCopyAgentVersion`, `#installDetailsCopySnippet`, `#installDetailsCopyPendoLauncher`, `#installDetailsCopyLauncherValidated`, `#installDetailsCopyValidatedIn`, `#installDetailsCopyVisitorId`, `#installDetailsCopyAccountId`, `#installDetailsCopyParentAccountId`, `#installDetailsCopyApiKey`, `#installDetailsCopyVisitorMeta`, `#installDetailsCopyAccountMeta`, `#installDetailsCopyParentMeta`, `#installDetailsCopyResourceHits`, `#installDetailsCopyLinesCaptured` | `title` set in `popup.js` |
| Copy advice card action | `copy-advice` | `#copyAdvice` | `aria-label="Copy advice"` |
| Toggle log-level filter chip | `toggle-log-filter` | `#logFilterErr` / `#logFilterWarn` / `#logFilterInfo` | text "Err / Warn / Info" + `aria-pressed` |
| Copy visible logs | `copy-logs` | `#copyLogs` | text "Copy visible" + `title` |
| Download visible logs | `download-logs` | `#downloadLogs` | text "Download" + `title` |
| Download Pendo network HAR | `download-har` | `#downloadHar` | text "HAR" + `title` (reload confirm on Chrome/Edge). Hidden unless the `harDownload` feature gate is open |
| View check in Logs | `view-check-in-logs` | (dynamic per check row) | text "View in Logs" |
| Validate Pendo Install | `validate` | `#run` | text "Validate Pendo Install" |
| Enable Pendo Debugger | `launch-debugger` | `#launchDebugger` | text "Debugger" + `title` |
| Share summary | `share-summary` | `#shareSummary` | text "Share" + `title` (reflects identity pref when enabled) |
| Include identity in Share | `share-include-identity` | `#shareIncludeIdentity` | checkbox in Settings → Sharing |
| Download Markdown report | `download-markdown-report` | `#downloadMarkdownReport` | text "Download Markdown report" + `title` |
| Resize panel (invisible corner) | `resize-panel` | `#resizeHandle` | `role="separator"` + `aria-label="Resize panel"`; no visible grip |
| Theme preference select | `theme-select` | `#themeSelect` | `<label for="themeSelect">Theme</label>` |
| AI provider select | `ai-provider-select` | `#aiProviderSelect` | `<label for="aiProviderSelect">Provider</label>` |
| AI API key input | `ai-api-key-input` | `#aiApiKeyInput` | `<label for="aiApiKeyInput">API key</label>` |
| Show / hide API key | `toggle-key-visibility` | `#aiKeyToggleVisibility` | `aria-label="Show API key"` / `"Hide API key"` |
| Save AI settings | `save-ai-settings` | `#aiSettingsSave` | text "Save AI settings" |

All four AI rows live inside `#aiAdviceCard`, which is hidden — and left unwired — unless the `aiAdvice` feature gate is open. Gates have no UI of their own; they are switched from the panel console via `__pendoValidateFeatures`, so they add no `data-action` entries. See the [README](../README.md#preview-features).
