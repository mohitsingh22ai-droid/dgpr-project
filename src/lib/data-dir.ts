import fs from "fs";
import path from "path";

/**
 * Resolves the on-disk location of an interim JSON store file.
 *
 * The stores live in a git-ignored directory (default `.data/`) so that running
 * the app or the test suites never modifies tracked files. Tests point
 * `W2P_DATA_DIR` at their own directory (`.data-test`, `.data-e2e`) to stay
 * isolated from local development data.
 *
 * NOTE: interim persistence only. Phase 1 replaces these stores with Supabase.
 *
 * Stores import this module by relative path (not "@/lib/...") so Playwright specs
 * that load a store dynamically can still resolve it.
 */
export function dataFile(fileName: string): string {
  const dir = process.env.W2P_DATA_DIR
    ? path.resolve(process.env.W2P_DATA_DIR)
    : path.join(process.cwd(), ".data");

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return path.join(dir, fileName);
}
