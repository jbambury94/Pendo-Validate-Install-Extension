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
| Copy button — Identity card | `copy-kv` | `#identityCopyVisitorId`, `#identityCopyAccountId`, `#identityCopyApiKey` | `title` set in `popup.js` |
| Copy button — Metadata card | `copy-kv` | `#metadataCopyVisitor`, `#metadataCopyAccount` | `title` set in `popup.js` |
| Copy button — Page snapshot | `copy-kv` | `#pageSnapshotCopyPendoPresent`, `#pageSnapshotCopyValidateInstall`, `#pageSnapshotCopyAgentVersion`, `#pageSnapshotCopyApiKeyFound`, `#pageSnapshotCopyDetectedKey`, `#pageSnapshotCopySnippetOnPage`, `#pageSnapshotCopyPendoLauncher`, `#pageSnapshotCopyLauncherValidated`, `#pageSnapshotCopyValidatedIn`, `#pageSnapshotCopyResourceHits` | `title` set in `popup.js` |
| Copy button — Page facts | `copy-kv` | `#pageFactsCopySnippet`, `#pageFactsCopyValidatedIn`, `#pageFactsCopyLinesCaptured` | `title` set in `popup.js` |
| Copy advice card action | `copy-advice` | `#copyAdvice` | `aria-label="Copy advice"` |
| Toggle log-level filter chip | `toggle-log-filter` | `#logFilterErr` / `#logFilterWarn` / `#logFilterInfo` | text "Err / Warn / Info" + `aria-pressed` |
| Copy logs | `copy-logs` | `#copyLogs` | `aria-label="Copy all logs"` |
| Validate Pendo Install | `validate` | `#run` | text "Validate Pendo Install" |
| Enable Pendo Debugger | `launch-debugger` | `#launchDebugger` | text "Debugger" + `title` |
| Open export menu | `open-export-menu` | `#exportMenuBtn` | text "Export" + `aria-haspopup`, `aria-expanded` |
| Export — Markdown report | `export-markdown` | `#exportMd` | text "Markdown report" |
| Export — Copy summary | `export-copy-summary` | `#exportCopy` | text "Copy summary" |
| Resize panel (corner handle) | `resize-panel` | `#resizeHandle` | `role="separator"` + `aria-label="Resize panel"` |
| Theme preference select | `theme-select` | `#themeSelect` | `<label for="themeSelect">Theme</label>` |
| AI provider select | `ai-provider-select` | `#aiProviderSelect` | `<label for="aiProviderSelect">Provider</label>` |
| AI API key input | `ai-api-key-input` | `#aiApiKeyInput` | `<label for="aiApiKeyInput">API key</label>` |
| Show / hide API key | `toggle-key-visibility` | `#aiKeyToggleVisibility` | `aria-label="Show API key"` / `"Hide API key"` |
| Save AI settings | `save-ai-settings` | `#aiSettingsSave` | text "Save AI settings" |
