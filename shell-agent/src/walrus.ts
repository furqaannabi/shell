import { config } from "./config.js";

/** PUT a raw byte blob to the Walrus publisher. Returns the blob_id. */
export async function putBlob(
  bytes: Uint8Array,
  epochs = 2,
): Promise<string> {
  const res = await fetch(
    `${config.walrusPublisher}/v1/blobs?epochs=${epochs}`,
    {
      method: "PUT",
      body: bytes as unknown as BodyInit,
    },
  );
  if (!res.ok) {
    throw new Error(`walrus put ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as Record<string, unknown>;
  const newlyCreated = json.newlyCreated as
    | { blobObject?: { blobId?: string } }
    | undefined;
  const alreadyCertified = json.alreadyCertified as
    | { blobId?: string }
    | undefined;
  const blobId =
    newlyCreated?.blobObject?.blobId ?? alreadyCertified?.blobId;
  if (!blobId) {
    throw new Error(`walrus put: no blobId in ${JSON.stringify(json)}`);
  }
  return blobId;
}

/** GET raw bytes for a blob by content address. */
export async function getBlob(blobId: string): Promise<Uint8Array> {
  const res = await fetch(`${config.walrusAggregator}/v1/blobs/${blobId}`);
  if (!res.ok) {
    throw new Error(`walrus get ${res.status}: ${await res.text()}`);
  }
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}
