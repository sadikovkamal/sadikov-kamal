# Examples

Reference bundles used to test the bulk importer (Phase 8) and to
double-check the format spec (`docs/format-spec.md`).

## Layout

- `sample-batch/` — unzipped contents, version controlled so changes
  show up in diffs and we never lose the canonical fixture.
- `sample-batch.zip` — packaged for upload. Regenerate any time the
  unzipped folder changes.

## Regenerating the zip

ZIP entries should use forward-slash paths so the importer
(running on Linux on Vercel) can read them. Windows' built-in
`Compress-Archive` writes backslashes — use Python or 7-zip instead.

### Python (cross-platform)

```bash
cd docs/examples
rm -f sample-batch.zip
python -c "
import zipfile, os
src = 'sample-batch'
out = 'sample-batch.zip'
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, _, files in os.walk(src):
        for f in files:
            full = os.path.join(root, f)
            arc = os.path.relpath(full, src).replace(os.sep, '/')
            zf.write(full, arc)
"
```

### Linux/macOS

```bash
cd docs/examples/sample-batch
zip -r ../sample-batch.zip .
```

## What's inside the sample

`sample-batch.zip` contains:

```
manifest.yaml                # batch_name + classes default
problems.md                  # 3 problems (IMO, national, shortlist)
images/sample-fig1.png       # 1x1 transparent placeholder
images/sample-fig2.png       # 1x1 transparent placeholder
```

The three problems exercise distinct parser paths:

| Problem | What it covers |
|---|---|
| #1 (IMO 2024 P1) | Required fields only, no images, has `# Yechim` |
| #2 (National 2023 P2) | Tags, image reference (`images/sample-fig1.png`), display math |
| #3 (Shortlist 2022 C2) | Image reference, no `# Yechim` |

The sample images are 67-byte 1×1 transparent PNGs — placeholders so
the importer's image-presence validation has something to find. Real
batches will have meaningful images.

## Manual smoke test (after Phase 8 ships)

1. Log in to `/admin`
2. Navigate to `/admin/import`
3. Upload `sample-batch.zip`
4. Preview should show 3 problems, all valid
5. Confirm import → 3 rows added to the `problems` table, plus
   junctions for topics, classes, tags

## Adding a new sample

To exercise a specific edge case (e.g. duplicate detection, malformed
manifest, oversize image), copy `sample-batch/` to a new sibling
folder and tweak the contents. Keep the tree shallow:

```
docs/examples/
├── sample-batch/
├── sample-duplicate/        # same (source, year, problem_number) as sample-batch
└── sample-oversize/         # >5 MB image to trip the size guard
```

Regenerate each `<name>.zip` after changes.
