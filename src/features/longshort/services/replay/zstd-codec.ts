/**
 * zstd codec — decompression wrapper for replay fixtures per §11.10.2 + ADR-005.
 *
 * Sub-step 6.5b scope: streaming decompression of `.jsonl.zst` files into UTF-8 strings.
 * No compression side (capture-time encoding is 6.5c territory; we only read).
 *
 * Uses the JSR-published `@yu7400ki/zstd-wasm` package (pure-WASM zstd, no native plugin,
 * runtime-compat: deno/bun/workerd). If the upstream package URL changes, update this
 * single chokepoint — engine code imports decompress() from here only.
 *
 * Replaces the previously-pinned `https://deno.land/x/zstd@v0.20.2/mod.ts` URL, which
 * was unresolvable on the deno.land/x registry (only versions 0.1.0 + 0.5.0 exist there,
 * and both rely on a native plugin no longer compatible with modern Deno). The JSR
 * package exposes the same `decompress(Uint8Array) -> Uint8Array` shape but is async
 * (WASM initialization). Per CI-FIX-01 (ACT-121).
 *
 * Per DEC-034 clause (3): errors propagate; no phantom-success swallowing.
 */

import { decompress as zstdDecompress } from 'jsr:@yu7400ki/zstd-wasm@0.1.0';

/**
 * Decompress a zstd-compressed byte sequence into UTF-8 string.
 *
 * @param compressed - raw bytes read from a `.jsonl.zst` file
 * @returns UTF-8 string containing newline-delimited JSON (JSONL)
 * @throws on invalid zstd stream — caller decides disposition (typically STOP per §22.8.4)
 */
export async function decompressZstdToString(compressed: Uint8Array): Promise<string> {
  const decompressed = await zstdDecompress(compressed);
  return new TextDecoder('utf-8').decode(decompressed);
}

/**
 * Convenience: decompress a file at the given path.
 *
 * Requires `--allow-read` Deno permission.
 */
export async function decompressZstdFile(path: string): Promise<string> {
  const bytes = await Deno.readFile(path);
  return await decompressZstdToString(bytes);
}