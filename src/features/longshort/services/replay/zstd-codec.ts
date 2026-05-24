/**
 * zstd codec — decompression wrapper for replay fixtures per §11.10.2 + ADR-005.
 *
 * Sub-step 6.5b scope: streaming decompression of `.jsonl.zst` files into UTF-8 strings.
 * No compression side (capture-time encoding is 6.5c territory; we only read).
 *
 * Uses the well-maintained zstd module for Deno. If the upstream module URL changes,
 * update this single chokepoint — engine code imports decompress() from here only.
 *
 * Per DEC-034 clause (3): errors propagate; no phantom-success swallowing.
 */

import { decompress as zstdDecompress } from 'https://deno.land/x/zstd@v0.20.2/mod.ts';

/**
 * Decompress a zstd-compressed byte sequence into UTF-8 string.
 *
 * @param compressed - raw bytes read from a `.jsonl.zst` file
 * @returns UTF-8 string containing newline-delimited JSON (JSONL)
 * @throws on invalid zstd stream — caller decides disposition (typically STOP per §22.8.4)
 */
export function decompressZstdToString(compressed: Uint8Array): string {
  const decompressed = zstdDecompress(compressed);
  return new TextDecoder('utf-8').decode(decompressed);
}

/**
 * Convenience: decompress a file at the given path.
 *
 * Requires `--allow-read` Deno permission.
 */
export async function decompressZstdFile(path: string): Promise<string> {
  const bytes = await Deno.readFile(path);
  return decompressZstdToString(bytes);
}