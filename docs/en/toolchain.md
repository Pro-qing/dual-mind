# Scaffold provenance

[简体中文](../zh/toolchain.md) · [Documentation](./README.md)

The initial scaffold was generated on **2026-11-17** using:

| Tool                                           | Version              |
| ---------------------------------------------- | -------------------- |
| Node.js, installed with nvm                    | 24.22.3              |
| npm bundled with that Node installation        | 11.19.1              |
| Yeoman (`yo`)                                  | 7.0.1                |
| VS Code extension generator (`generator-code`) | 1.12.0               |
| Generator template                             | TypeScript + esbuild |

The generator ran in a temporary directory with dependency installation, editor opening, and Git initialization disabled. Its extension entry, manifest, build conventions, test runner, and editor configurations were adapted into the existing repository; the original Git history and bilingual README entry points were preserved.

```bash
nvm use 24
dualmind_template_dir=$(mktemp -d /tmp/dual-mind-template.XXXXXX)
npm exec --yes --package=yo@7.0.1 --package=generator-code@1.12.0 --   yo code "$dualmind_template_dir" --extensionType=ts   --extensionDisplayName=DualMind --extensionId=dual-mind   --pkgManager=npm --bundler=esbuild --gitInit=false   --skip-install --skipOpen --skip-cache --quick
```

This command records provenance; do not regenerate over the working repository. Normal development uses `npm ci`, not Yeoman.

The generator's newest VS Code requirement was lowered to `^1.100.0`, with `@types/vscode` fixed to `1.100.0` and a minimum-version integration test. TypeScript stays on the generator's compatible 6.0 line rather than selecting a major version outside the lint parser's supported range. The lockfile records the actual dependency versions. After design approval, React and React DOM 19.3.1 were added to the local workbench. The lockfile also pins its types, Testing Library, jsdom 26.1.0, and Playwright Core; the latter uses VS Code’s own Electron for UI verification.
