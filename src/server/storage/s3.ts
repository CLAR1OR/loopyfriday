/**
 * S3 / MinIO storage driver — STUB.
 *
 * The local-disk driver in ./index.ts is the supported backend today. This
 * sketches the same surface for an object-store backend so the rest of the app
 * never needs to change when it's implemented. To finish it:
 *
 *   1. `npm i @aws-sdk/client-s3 @aws-sdk/lib-storage`
 *   2. Construct an S3Client from S3_ENDPOINT/S3_REGION/credentials
 *      (set `forcePathStyle: true` for MinIO).
 *   3. Implement each method against the bucket (see the TODOs below). Range
 *      reads map to GetObject with a `Range` header.
 *   4. The tus upload still needs a local spool dir (or @tus/s3-store) — the
 *      object store only holds the processed originals/streams/peaks/scores.
 */
import type { Readable } from "node:stream";
import type { Storage } from "./index";

export interface S3Config {
  bucket: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export class S3Storage implements Storage {
  constructor(private readonly config: S3Config) {
    console.warn(
      "[storage] STORAGE_DRIVER=s3 selected, but the S3 driver is a stub. " +
        "Falling back will fail at first use. Bucket:",
      config.bucket,
    );
  }

  private notImplemented(method: string): never {
    throw new Error(
      `S3Storage.${method} is not implemented yet (STORAGE_DRIVER=s3 is a stub).`,
    );
  }

  resolve(key: string): string {
    // For S3 there is no local path; callers that need a filesystem path
    // (e.g. ffmpeg in the worker) must download to a temp file first.
    return `s3://${this.config.bucket}/${key}`;
  }

  writeBuffer(): Promise<void> {
    // TODO: PutObjectCommand
    return this.notImplemented("writeBuffer");
  }

  moveInto(): Promise<void> {
    // TODO: upload from the local spool path, then unlink
    return this.notImplemented("moveInto");
  }

  size(): Promise<number> {
    // TODO: HeadObjectCommand -> ContentLength
    return this.notImplemented("size");
  }

  exists(): Promise<boolean> {
    // TODO: HeadObjectCommand (404 -> false)
    return this.notImplemented("exists");
  }

  createReadStream(): Readable {
    // TODO: GetObjectCommand (+ Range header for { start, end }) -> Body stream
    return this.notImplemented("createReadStream");
  }

  remove(): Promise<void> {
    // TODO: DeleteObjectCommand
    return this.notImplemented("remove");
  }
}
