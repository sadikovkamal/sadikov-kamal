// Smoke test for src/lib/storage/r2.ts.
//
// Without R2 env: module loads, getR2ConfigStatus reports missing keys,
//   uploadFile/deleteFile/fileExists throw helpful errors at call time
//   (not at import time).
// With R2 env: roundtrip a tiny PNG (upload → fileExists → fetch public
//   URL → deleteFile → fileExists false).
//
// Run (no env):   npx tsx scripts/r2-smoke.ts
// Run (with env): R2_ACCOUNT_ID=… npx tsx scripts/r2-smoke.ts

import "../src/db/load-env"; // bridges .env.local in case R2_* live there

import * as r2 from "../src/lib/storage/r2";

async function noEnvAssertions() {
  // Verify uploadFile throws a helpful error instead of crashing module load.
  let threw = false;
  try {
    await r2.uploadFile({
      file: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      mimeType: "image/png",
      originalFilename: "x.png",
      prefix: "test",
    });
  } catch (e) {
    threw = true;
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("R2 storage is not configured")) {
      throw new Error(`Unexpected error message: ${msg}`);
    }
    console.log(`pass: uploadFile threw config error: "${msg.slice(0, 80)}…"`);
  }
  if (!threw) throw new Error("uploadFile did not throw despite missing config");

  // ALLOWED_MIME_TYPES + MAX_SIZE_BYTES should still be exported (don't depend on env).
  if (!r2.ALLOWED_MIME_TYPES.has("image/png")) {
    throw new Error("ALLOWED_MIME_TYPES does not include image/png");
  }
  console.log(`pass: ALLOWED_MIME_TYPES exported (${r2.ALLOWED_MIME_TYPES.size} entries)`);
  if (r2.MAX_SIZE_BYTES !== 4 * 1024 * 1024) {
    throw new Error(`MAX_SIZE_BYTES wrong: ${r2.MAX_SIZE_BYTES}`);
  }
  console.log(`pass: MAX_SIZE_BYTES = ${r2.MAX_SIZE_BYTES}`);
  if (r2.MAX_IMPORT_BYTES !== 50 * 1024 * 1024) {
    throw new Error(`MAX_IMPORT_BYTES wrong: ${r2.MAX_IMPORT_BYTES}`);
  }
  console.log(`pass: MAX_IMPORT_BYTES = ${r2.MAX_IMPORT_BYTES}`);

  // Validation runs BEFORE config load, so non-image types/oversized files
  // are rejected with the right error message even without R2 env.
  let mimeRejected = false;
  try {
    await r2.uploadFile({
      file: new Uint8Array([0]),
      mimeType: "text/plain",
      originalFilename: "x.txt",
      prefix: "test",
    });
  } catch (e) {
    mimeRejected = true;
    const msg = e instanceof Error ? e.message : String(e);
    if (!/File type not allowed/.test(msg)) {
      throw new Error(`Wrong rejection message: ${msg}`);
    }
    console.log(`pass: text/plain rejected: "${msg}"`);
  }
  if (!mimeRejected) throw new Error("text/plain was not rejected");

  let sizeRejected = false;
  try {
    await r2.uploadFile({
      file: new Uint8Array(r2.MAX_SIZE_BYTES + 1),
      mimeType: "image/png",
      originalFilename: "huge.png",
      prefix: "test",
    });
  } catch (e) {
    sizeRejected = true;
    const msg = e instanceof Error ? e.message : String(e);
    if (!/File too large/.test(msg)) {
      throw new Error(`Wrong rejection message: ${msg}`);
    }
    console.log(`pass: oversize file rejected: "${msg.slice(0, 80)}"`);
  }
  if (!sizeRejected) throw new Error("oversize file was not rejected");
}

async function liveRoundtrip() {
  // 1x1 transparent PNG (smallest valid PNG).
  const TINY_PNG = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
    0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
    0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44,
    0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d,
    0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
    0x60, 0x82,
  ]);

  const upload = await r2.uploadFile({
    file: TINY_PNG,
    mimeType: "image/png",
    originalFilename: "smoke.png",
    prefix: "test/smoke",
  });
  console.log(`pass: uploaded ${upload.storageKey} (${upload.sizeBytes} bytes)`);
  console.log(`      public URL: ${upload.publicUrl}`);

  const exists = await r2.fileExists(upload.storageKey);
  if (!exists) throw new Error(`fileExists false right after upload`);
  console.log(`pass: fileExists=true after upload`);

  const fetched = await fetch(upload.publicUrl);
  if (!fetched.ok) {
    throw new Error(`fetch ${upload.publicUrl} -> ${fetched.status}`);
  }
  const bytes = new Uint8Array(await fetched.arrayBuffer());
  if (bytes.byteLength !== TINY_PNG.byteLength) {
    throw new Error(`byte length mismatch: uploaded ${TINY_PNG.byteLength}, fetched ${bytes.byteLength}`);
  }
  console.log(`pass: public URL returns ${bytes.byteLength} bytes`);

  await r2.deleteFile(upload.storageKey);
  console.log(`pass: deleteFile completed`);

  const stillExists = await r2.fileExists(upload.storageKey);
  if (stillExists) throw new Error(`fileExists still true after delete`);
  console.log(`pass: fileExists=false after delete`);

  // --- Presigned PUT + getObjectBytes roundtrip -------------------------
  // Mirrors the large-import path: presign a PUT, upload bytes directly to
  // R2 (server-side fetch here — no CORS involved), then read them back
  // with getObjectBytes. Content-Type must match what the URL was signed
  // with, or R2 rejects the signature.
  const importKey = `test/smoke/presigned-${Date.now()}.zip`;
  const putUrl = await r2.createPresignedUploadUrl({
    storageKey: importKey,
    contentType: "application/zip",
  });
  if (!/X-Amz-Signature=/.test(putUrl)) {
    throw new Error(`presigned URL missing signature: ${putUrl.slice(0, 80)}…`);
  }
  console.log(`pass: createPresignedUploadUrl returned a signed URL`);

  const putRes = await fetch(putUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/zip" },
    body: TINY_PNG,
  });
  if (!putRes.ok) {
    throw new Error(`presigned PUT -> ${putRes.status} ${putRes.statusText}`);
  }
  console.log(`pass: presigned PUT uploaded ${importKey}`);

  const round = await r2.getObjectBytes(importKey);
  if (round.byteLength !== TINY_PNG.byteLength) {
    throw new Error(
      `getObjectBytes byte mismatch: ${round.byteLength} vs ${TINY_PNG.byteLength}`
    );
  }
  console.log(`pass: getObjectBytes returned ${round.byteLength} bytes`);

  await r2.deleteFile(importKey);
  console.log(`pass: presigned roundtrip cleaned up`);
}

async function main() {
  const status = r2.getR2ConfigStatus();
  console.log(`R2 config status: ready=${status.ready}, missing=${JSON.stringify(status.missing)}`);

  if (!status.ready) {
    await noEnvAssertions();
    console.log(`\nR2 smoke (no-env phase): PASSED`);
    console.log(`Add R2_* env vars to .env.local and re-run for the live roundtrip.`);
    return;
  }

  await liveRoundtrip();
  console.log(`\nR2 smoke (live roundtrip): PASSED`);
}

main().catch((e) => {
  console.error("R2 smoke FAILED:", e);
  process.exit(1);
});
