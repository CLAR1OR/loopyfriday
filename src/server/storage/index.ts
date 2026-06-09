/**
 * File storage abstraction. The local-disk driver (rooted at DATA_DIR) is the
 * supported backend; an S3/MinIO driver implementing the same surface can be
 * selected with STORAGE_DRIVER=s3 (currently a stub — see ./s3.ts).
 *
 * Keys are POSIX-style relative paths, e.g. `uploads/<id>`, `streams/<id>.m4a`,
 * `peaks/<id>.json`, `scores/<id>.pdf`.
 */
import { createReadStream } from "node:fs";
import { copyFile, mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { env } from "@/server/env";
import { S3Storage } from "./s3";

export interface Storage {
  resolve(key: string): string;
  writeBuffer(key: string, data: Buffer | Uint8Array): Promise<void>;
  moveInto(key: string, srcAbsolutePath: string): Promise<void>;
  size(key: string): Promise<number>;
  exists(key: string): Promise<boolean>;
  createReadStream(key: string, opts?: { start?: number; end?: number }): Readable;
  remove(key: string): Promise<void>;
}

class LocalStorage implements Storage {
  constructor(private readonly root: string) {}

  resolve(key: string): string {
    const full = path.resolve(this.root, key);
    const rootResolved = path.resolve(this.root);
    if (full !== rootResolved && !full.startsWith(rootResolved + path.sep)) {
      throw new Error(`Refusing path traversal for key: ${key}`);
    }
    return full;
  }

  private async ensureDirFor(key: string) {
    await mkdir(path.dirname(this.resolve(key)), { recursive: true });
  }

  async writeBuffer(key: string, data: Buffer | Uint8Array) {
    await this.ensureDirFor(key);
    await writeFile(this.resolve(key), data);
  }

  async moveInto(key: string, srcAbsolutePath: string) {
    await this.ensureDirFor(key);
    const dest = this.resolve(key);
    try {
      await rename(srcAbsolutePath, dest);
    } catch {
      // rename fails across devices; fall back to copy.
      await copyFile(srcAbsolutePath, dest);
      await rm(srcAbsolutePath, { force: true });
    }
  }

  async size(key: string) {
    return (await stat(this.resolve(key))).size;
  }

  async exists(key: string) {
    try {
      await stat(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  createReadStream(key: string, opts?: { start?: number; end?: number }) {
    return createReadStream(this.resolve(key), opts);
  }

  async remove(key: string) {
    await rm(this.resolve(key), { force: true });
  }
}

function createStorage(): Storage {
  if (env.STORAGE_DRIVER === "s3") {
    return new S3Storage({
      bucket: env.S3_BUCKET ?? "",
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    });
  }
  return new LocalStorage(env.DATA_DIR);
}

export const storage: Storage = createStorage();

/** Convenience for the tus file-store upload directory (local driver). */
export const UPLOAD_SUBDIR = "uploads";
export const uploadDirAbsolute = path.resolve(env.DATA_DIR, UPLOAD_SUBDIR);
