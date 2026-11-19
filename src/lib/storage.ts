import { db } from "@/lib/supabase/server";

/**
 * Private Supabase Storage buckets. Files are never public: customers and staff
 * get short-lived signed URLs after an authorisation check.
 *
 *   artwork     customer uploads (PDF/SVG/AI/PNG)
 *   proofs      rendered proof previews
 *   production  print-ready files, unlocked only after approval + payment
 */
export type Bucket = "artwork" | "proofs" | "production";

/** Marks a stored reference ("storage:<bucket>/<path>") in database columns. */
export const STORAGE_PREFIX = "storage:";

const BUCKET_LIMITS: Record<Bucket, number> = {
  artwork: 50 * 1024 * 1024,
  proofs: 20 * 1024 * 1024,
  production: 50 * 1024 * 1024, // Supabase free-tier per-file limit
};

const ensured = new Set<Bucket>();

/** Creates the bucket on first use (idempotent). */
export async function ensureBucket(bucket: Bucket): Promise<void> {
  if (ensured.has(bucket)) return;
  const { data } = await db().storage.getBucket(bucket);
  if (!data) {
    const { error } = await db().storage.createBucket(bucket, { public: false, fileSizeLimit: BUCKET_LIMITS[bucket] });
    if (error && !/already exists/i.test(error.message)) {
      throw new Error(`Create storage bucket ${bucket}: ${error.message}`);
    }
  }
  ensured.add(bucket);
}

export async function uploadFile(bucket: Bucket, path: string, body: Uint8Array | Buffer, contentType: string): Promise<void> {
  await ensureBucket(bucket);
  const { error } = await db().storage.from(bucket).upload(path, body, { contentType, upsert: true });
  if (error) throw new Error(`Upload ${bucket}/${path}: ${error.message}`);
}

export async function downloadFile(bucket: Bucket, path: string): Promise<Buffer> {
  const { data, error } = await db().storage.from(bucket).download(path);
  if (error || !data) throw new Error(`Download ${bucket}/${path}: ${error?.message ?? "not found"}`);
  return Buffer.from(await data.arrayBuffer());
}

export async function deleteFile(bucket: Bucket, path: string): Promise<void> {
  await db().storage.from(bucket).remove([path]);
}

/** Short-lived download link (default 5 minutes). */
export async function signedDownloadUrl(bucket: Bucket, path: string, expiresInSeconds = 300, downloadName?: string): Promise<string> {
  const { data, error } = await db()
    .storage.from(bucket)
    .createSignedUrl(path, expiresInSeconds, downloadName ? { download: downloadName } : undefined);
  if (error || !data) throw new Error(`Sign ${bucket}/${path}: ${error?.message}`);
  return data.signedUrl;
}

/** One-time signed URL the browser uploads to directly (bypasses the 4.5 MB API body limit). */
export async function signedUploadUrl(bucket: Bucket, path: string): Promise<{ signedUrl: string; token: string; path: string }> {
  await ensureBucket(bucket);
  const { data, error } = await db().storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) throw new Error(`Sign upload ${bucket}/${path}: ${error?.message}`);
  return { signedUrl: data.signedUrl, token: data.token, path: data.path };
}

/**
 * Turns a stored reference into a short-lived URL the browser can load; other
 * values (data: URLs, legacy absolute URLs) are returned unchanged.
 */
export async function resolveStoredUrl(value: string | null | undefined, expiresInSeconds = 600): Promise<string> {
  if (!value || !value.startsWith(STORAGE_PREFIX)) return value ?? "";
  const ref = value.slice(STORAGE_PREFIX.length);
  const slash = ref.indexOf("/");
  const bucket = ref.slice(0, slash) as Bucket;
  try {
    return await signedDownloadUrl(bucket, ref.slice(slash + 1), expiresInSeconds);
  } catch {
    return "";
  }
}
