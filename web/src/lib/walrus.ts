export const WALRUS_AGGREGATOR =
  process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR ??
  'https://aggregator.walrus-testnet.walrus.space';

export const WALRUS_PUBLISHER =
  process.env.NEXT_PUBLIC_WALRUS_PUBLISHER ??
  'https://publisher.walrus-testnet.walrus.space';

/** Upload raw bytes to the Walrus publisher. Returns the blob_id (content
 *  address) so callers can refer to it on-chain. */
export async function putBlob(bytes: Uint8Array, epochs = 2): Promise<string> {
  const res = await fetch(`${WALRUS_PUBLISHER}/v1/blobs?epochs=${epochs}`, {
    method: 'PUT',
    body: bytes as unknown as BodyInit,
  });
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
  const blobId = newlyCreated?.blobObject?.blobId ?? alreadyCertified?.blobId;
  if (!blobId) {
    throw new Error(`walrus put: no blobId in ${JSON.stringify(json)}`);
  }
  return blobId;
}

const FALLBACK_AGGREGATORS = [
  'https://wal-aggregator-testnet.staketab.org',
  'https://walrus-testnet-aggregator.nirvanalabs.io',
  'https://walrus-testnet.blockscope.net',
];

/** Read raw bytes from the public Walrus aggregator, trying fallbacks on 404. */
export async function getBlob(blobId: string): Promise<Uint8Array> {
  const aggregators = [WALRUS_AGGREGATOR, ...FALLBACK_AGGREGATORS];
  let lastErr: Error = new Error('no aggregators');
  for (const agg of aggregators) {
    const res = await fetch(`${agg}/v1/blobs/${blobId}`);
    if (res.ok) {
      const buf = await res.arrayBuffer();
      return new Uint8Array(buf);
    }
    lastErr = new Error(`walrus get ${res.status} from ${agg}`);
  }
  throw lastErr;
}
