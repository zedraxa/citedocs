import { describe, expect, it, vi } from "vitest";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { S3WopiStorage } from "../src/wopi/storage/s3Storage.js";
import { buildApp } from "../src/index.js";
import { InMemoryDocumentRepository } from "../src/repositories/inMemoryDocumentRepository.js";

function fixture(legacyName?: string) {
  let metadata: Record<string, string> = { filename: legacyName ?? "", "owner-id": "owner" };
  let body = Buffer.from("original");
  const writes: Record<string, string>[] = [];
  const send = vi.fn(async (command: PutObjectCommand | HeadObjectCommand | GetObjectCommand) => {
    if (command instanceof PutObjectCommand) {
      metadata = { ...command.input.Metadata };
      for (const value of Object.values(metadata)) {
        expect(value).toMatch(/^[\x20-\x7E]*$/);
      }
      writes.push(metadata);
      body = Buffer.from(command.input.Body as Buffer);
      return {};
    }
    return {
      Metadata: metadata,
      ContentLength: body.length,
      Body: { transformToByteArray: async () => new Uint8Array(body) },
    };
  });
  const storage = new S3WopiStorage({ client: { send } as unknown as S3Client });
  return { storage, writes };
}

const titles = ["Adsız Belge", "Çalışma Ödevi İğne Şüphe", "100% rapor", "literal%20name"];
describe("S3 user metadata encoding", () => {
  it.each(titles)("creates, saves and reads %s without non-ASCII metadata", async (title) => {
    const { storage, writes } = fixture();
    const owner = "Öğrenci İpek";
    expect((await storage.createFile("doc", title, owner, Buffer.from("first"))).baseFileName).toBe(title);
    expect((await storage.getFileInfo("doc")).baseFileName).toBe(title);
    expect((await storage.getFile("doc")).metadata.ownerId).toBe(owner);
    const saved = await storage.putFile("doc", Buffer.from("edited"));
    expect(saved.metadata.baseFileName).toBe(title);
    const read = await storage.getFile("doc");
    expect(read.metadata.baseFileName).toBe(title);
    expect(read.metadata.ownerId).toBe(owner);
    expect(read.buffer.toString()).toBe("edited");
    expect(writes).toHaveLength(2);
    for (const metadata of writes) {
      expect(metadata.filename).toBe(encodeURIComponent(title));
      expect(metadata["owner-id"]).toBe(encodeURIComponent(owner));
    }
  });

  it.each(["legacy.docx", "Adsız Belge", "100% rapor", "%E0%A4%A"])("reads legacy metadata %s", async (name) => {
    const { storage } = fixture(name);
    expect((await storage.getFileInfo("doc")).baseFileName).toBe(name);
    expect((await storage.getFile("doc")).metadata.baseFileName).toBe(name);
    await storage.putFile("doc", Buffer.from("updated"));
    expect((await storage.getFile("doc")).metadata.baseFileName).toBe(name);
  });

  it.each([undefined, ...titles])("POST /api/documents preserves title %s through S3", async (title) => {
    const { storage, writes } = fixture();
    const documentRepo = new InMemoryDocumentRepository();
    const app = await buildApp({ documentRepo, wopiStorage: storage });
    try {
      const response = await app.inject({
        method: "POST", url: "/api/documents", headers: { "x-user-id": "owner" },
        payload: title === undefined ? {} : { title },
      });
      expect(response.statusCode).toBe(201);
      const doc = response.json().document;
      const expectedTitle = title ?? "Adsız Belge";
      expect(doc.title).toBe(expectedTitle);
      const name = `${expectedTitle}.docx`;
      expect((await storage.getFileInfo(doc.id)).baseFileName).toBe(name);
      const original = await storage.getFile(doc.id);
      expect(original.metadata.baseFileName).toBe(name);
      await storage.putFile(doc.id, original.buffer);
      expect((await storage.getFile(doc.id)).metadata.baseFileName).toBe(name);
      expect(writes).toHaveLength(2);
      expect(writes.every((metadata) => metadata.filename === encodeURIComponent(name))).toBe(true);
    } finally {
      await app.close();
    }
  });
});
