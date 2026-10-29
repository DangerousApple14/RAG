import "server-only";
import path from "path";

/**
 * Root directory for ALL mutable runtime data that is NOT the SQLite database:
 *   - app-secret.key  (AES-256-GCM key, see crypto.ts)
 *   - auth-secret.key (JWT signing secret, see auth.ts)
 *   - vectors/        (per-user encrypted vector indexes)
 *
 * The SQLite file itself is controlled separately by DATABASE_URL.
 *
 * Default: <project>/db (same as always for local dev / plain docker runs).
 * On Render: set DATA_DIR=/var/data (persistent disk) so keys and indexes
 * survive redeploys, and DATABASE_URL=file:/var/data/custom.db.
 */
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), "db");

export const VECTORS_DIR = path.join(DATA_DIR, "vectors");
