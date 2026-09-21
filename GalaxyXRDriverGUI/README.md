# Galaxy XR Companion frontend and Tauri backend

See **`../README-GALAXY-XR-COMPANION.md`** for current replacement, full portable-build and release instructions. The frontend is TypeScript + Lit + Fluent Web Components; it no longer uses Angular or Angular Material. The supplied current Rust backend is under `src-tauri`.

From this directory:

```powershell
npm ci
npm start           # Tauri development application
npm run build      # Tauri application, not just frontend files
```

`dev:ui` runs the frontend server and `build:ui` typechecks/builds the localized frontend. These do not produce a complete portable GUI + driver package; use the root portable-build script for that. Native commands require Tauri, so a plain browser does not reproduce native functionality.

`src-lit` contains application/domain/services/components; `src/locale` retains translation catalogs; `public` contains static assets; `src-tauri` contains Rust, native permissions, application configuration and icons. The locale converter keeps en-US, ja and zh-Hant entry points. New untranslated strings fall back to their English source text. Do not use the retired Angular `ng extract-i18n` workflow.

For the new mode/navigation regression suite, run `node ../tools/Test-CompanionModes.cjs` after installing the pinned dependencies.

## Icon credits

Galaxy XR icons were made by **Vilkka**. Based on original Quest Pro iconpack made by **Lux / Hekky**. See the repository `CREDITS.md`.
