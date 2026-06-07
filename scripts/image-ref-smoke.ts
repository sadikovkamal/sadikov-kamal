// Unit smoke for the portable image-ref helpers (src/lib/storage/image-ref.ts).
//
// Locks the invariants the whole "images survive a storage/host change"
// feature rests on:
//   • resolve(store(key))  → absolute URL under the current base
//   • relativize(resolve)  → byte-identical round-trip back to `r2:key`
//   • empty base           → no-op (never emits a malformed `/key` URL)
//   • foreign URLs         → left untouched by relativize
//
// Pure string logic, no I/O — runs in the PLAIN group (no react-server).
//
// Run: npx tsx scripts/image-ref-smoke.ts

import {
  toImageRef,
  imageRefToStorageKey,
  resolveImageRefs,
  relativizeImageRefs,
  bodyReferencesStorageKey,
} from "../src/lib/storage/image-ref";

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++;
    console.log(`pass: ${name}`);
  } else {
    fail++;
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const base = "https://pub-abc123.r2.dev";
const key = "problems/imported/1700000000000/aB3xQ.png";
const stored = `Savol matni.\n\n![diagramma](${toImageRef(key)})\n\nDavomi.`;

// toImageRef / imageRefToStorageKey are inverses.
check("toImageRef prepends scheme", toImageRef(key) === `r2:${key}`);
check(
  "imageRefToStorageKey strips scheme",
  imageRefToStorageKey(toImageRef(key)) === key
);
check(
  "imageRefToStorageKey returns null for non-ref",
  imageRefToStorageKey("https://x/y.png") === null
);

// resolve → absolute under base.
const shown = resolveImageRefs(stored, base);
check(
  "resolve produces absolute URL",
  shown.includes(`![diagramma](${base}/${key})`),
  shown
);
check("resolve leaves no r2: scheme", !shown.includes("r2:"), shown);

// relativize is the exact inverse → round-trip stable.
const back = relativizeImageRefs(shown, base);
check("resolve→relativize round-trips", back === stored, back);

// Empty base is a no-op in BOTH directions.
check("resolve no-op on empty base", resolveImageRefs(stored, "") === stored);
check("relativize no-op on empty base", relativizeImageRefs(shown, "") === shown);

// Trailing slash on base is tolerated.
check(
  "trailing-slash base resolves the same",
  resolveImageRefs(stored, base + "/") === shown
);

// Foreign (non-base) absolute URLs are untouched by relativize.
const foreign = "![x](https://cdn.other.com/a.png)";
check(
  "relativize leaves foreign URLs alone",
  relativizeImageRefs(foreign, base) === foreign
);

// bodyReferencesStorageKey detects both forms.
check("references key (r2 form)", bodyReferencesStorageKey(stored, key, base));
check("references key (absolute form)", bodyReferencesStorageKey(shown, key, base));
check(
  "does not reference an unrelated key",
  !bodyReferencesStorageKey(stored, "problems/other/zzz.png", base)
);

console.log(`\n${pass} passed, ${fail} failed`);
console.log(fail === 0 ? "image-ref smoke: PASSED" : "image-ref smoke: FAILED");
process.exit(fail === 0 ? 0 : 1);
