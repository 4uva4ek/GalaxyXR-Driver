# App Settings after uninstall — 2026-09-16

Uninstall removes `gui-settings.json` along with the driver's configuration. The App Settings navigation link remained visible, but its page body disappeared when the settings service returned no values.

AppSettingService now supplies in-memory defaults whenever its saved settings are unavailable. Color Scheme and Advanced Mode remain usable; Image Enhancements remains disabled without driver settings. File-read errors still remain available for diagnostics, and driver readiness validation is unchanged.

Uninstall continues to suspend filesystem writes. App changes made afterward apply for the current session without recreating deleted driver files. Preferences reset to defaults when the removed configuration is reloaded. A subsequent app-setting edit after reinstall can persist normally.

The Galaxy XR navigation tab is now named **Image Settings**. Its route and settings remain unchanged.

Validation: 19 production-service fixtures (including uninstall, app controls, and no config recreation) and 8 headless Angular page tests passed. Review found no blocking issues. No live SteamVR installation or headset session performed. This change affects only the GUI; the unchanged native source is rebuilt for the complete bundle because the previous package is no longer present locally.

Cleanup: no obsolete source files introduced. Existing generated compiler/cache outputs remain retained under the prior automatic approval review rejection documented in `UiReinstallCleanup-2026-09-16.json`; no deletion retry performed. The previous test ZIP was already absent and the new ZIP is the user deliverable. Regenerate with `tools/Build-Portable.ps1`.
