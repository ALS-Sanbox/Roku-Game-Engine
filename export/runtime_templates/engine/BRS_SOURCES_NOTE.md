# Runtime .brs files — single source of truth

All `.brs` files in this directory are canonically maintained in `src/source/engine/`.
They were previously duplicated verbatim here (24 identical files, ~270 KB total).

**At export/packaging time**, copy the needed `.brs` files from `src/source/engine/`
into the export bundle. Do not commit mirrored copies here.

## ui/ui_nineslice.brs — diverged versions
`source/engine/ui/ui_nineslice.brs` and `export/runtime_templates/engine/ui/ui_nineslice.brs`
differ in size. The export template version is retained as-is.
Reconcile these before next release.
