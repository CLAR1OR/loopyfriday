/**
 * File storage abstraction. Currently a local-disk implementation rooted at
 * DATA_DIR; an S3/MinIO driver can implement the same surface later.
 *
 * Keys are POSIX-style relative paths, e.g. `uploads/<id>`, `streams/<id>.m4a`,
 * `peaks/<id>.json`, `scores/<id>.pdf`.
 */
import { createReadStream, type ReadStream } from "node:fs";
import { copyFile, mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/server/env";

export interface Storage {
  resolve(key: string): string;
  writeBuffer(key: string, data: Buffer | Uint8Array): Promise<void>;
  moveInto(key: string, srcAbsolutePath: string): Promise<void>;
  size(key: string): Promise<number>;
  exists(key: string): Promise<boolean>;
  createReadStream(
    key: string,
    opts?: { start?: number; end?: number },
  ): ReadStream;
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

export const storage: Storage = new LocalStorage(env.DATA_DIR);

/** Convenience for the tus file-store upload directory. */
export const UPLOAD_SUBDIR = "uploads";
export const uploadDirAbsolute = path.resolve(env.DATA_DIR, UPLOAD_SUBDIR);
