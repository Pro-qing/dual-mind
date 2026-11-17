# UI concept — pending review

[简体中文](../zh/design.md) · [Documentation](./README.md)

![DualMind dark-theme concept](../design/dual-mind-workbench.png)

[Open the editable SVG](../design/dual-mind-workbench.svg). Canvas: **1440 × 900**, dark VS Code-style palette. All text and shapes are native SVG. The proposal uses English control labels with this bilingual explanation; it has no external image/font dependency or interactive behavior.

## Reading the proposal

1. **Header:** project name, “Design proposal” label, and overall session state.
2. **Task area:** a sample coding request, selected editor context, and room for human input.
3. **Session controls:** start, pause, stop, and a maximum-rounds setting. The pictured session is in a fictional review state; start and result application are disabled.
4. **Worker column:** model label, current role/status, and illustrative implementation output.
5. **Reviewer column:** independent model label, review feedback, and an illustrative change request.
6. **Result area:** round progress, review outcome, diff preview, and a user-controlled apply action. The drawing represents a pending result; no code has been changed.

At a future Webview width below 900 CSS pixels, columns should stack with Worker above Reviewer; controls may wrap, and input/output content must remain readable. Real theme colors should come from VS Code CSS variables during implementation.

## Review criteria

- Are the task input, two roles, and current round easy to find?
- Are pause, stop, and human feedback reachable without obscuring output?
- Is Reviewer approval visibly separate from the user's apply action?
- Is there enough space for code output and review notes?
- Are the proposed narrow-window behavior and dark-theme contrast acceptable?

**Approval gate:** the repository owner must explicitly approve this design or a revision before React UI implementation begins. Current status: **pending**. Comments on the SVG can identify the section and intended change; no approval is inferred from the scaffold being accepted.

## Updating the preview

The SVG is the editable source. The adjacent PNG is a rendered preview for the README, since VSIX packaging restricts embedded SVG images there. After changing the SVG, regenerate the PNG and inspect both at full size. In a Python environment with CairoSVG 2.7.1 installed, run from the repository root:

```bash
python3 -m cairosvg docs/design/dual-mind-workbench.svg \
  -o docs/design/dual-mind-workbench.png
npm run docs:check
```

CairoSVG is optional design tooling, not a dependency of the extension or its standard build.
