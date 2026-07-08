import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

/**
 * Object storage abstraction. Production uses S3 (existing bucket, prefix-
 * scoped so we share it cleanly with other projects). Local disk is the
 * offline fallback. Swap implementations behind this interface without
 * touching product code.
 */
export interface Storage {
  /** Store bytes and return an opaque storage key. */
  put(data: Buffer, opts: { role: string; ext?: string }): Promise<string>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
}

function contentTypeForExt(ext: string): string {
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return "application/octet-stream";
}

class S3Storage implements Storage {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly prefix: string;

  constructor() {
    this.bucket = process.env.AWS_S3_BUCKET as string;
    this.prefix = process.env.S3_PREFIX ?? "";
    this.client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
      },
    });
  }

  async put(data: Buffer, { role, ext = "png" }: { role: string; ext?: string }): Promise<string> {
    const key = `${this.prefix}${role}/${randomUUID()}.${ext}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: contentTypeForExt(ext),
      }),
    );
    return key;
  }

  async get(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = await res.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }
}

class LocalStorage implements Storage {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    const full = path.resolve(this.root, key);
    const rootResolved = path.resolve(this.root);
    if (full !== rootResolved && !full.startsWith(rootResolved + path.sep)) {
      throw new Error("Invalid storage key.");
    }
    return full;
  }

  async put(data: Buffer, { role, ext = "png" }: { role: string; ext?: string }): Promise<string> {
    const key = `${role}/${randomUUID()}.${ext}`;
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
    return key;
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }
}

function makeStorage(): Storage {
  if (process.env.AWS_S3_BUCKET && process.env.AWS_ACCESS_KEY_ID) {
    return new S3Storage();
  }
  const root = process.env.STORAGE_DIR ?? path.join(process.cwd(), "storage");
  return new LocalStorage(root);
}

export const storage: Storage = makeStorage();
