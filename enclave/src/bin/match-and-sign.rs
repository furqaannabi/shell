//! Spike binary: stdin JSON of decrypted orders, stdout JSON of signed matches.
//!
//! In production these inputs would arrive via Seal decryption inside the
//! Nitro enclave. For the offline spike, the trader's TS SDK hands the
//! plaintexts over a side channel (writes them to a pipe).
//!
//! Reads from stdin:
//!   { "orders": [{ "order_id": "0x..", "trader": "0x..",
//!                  "plaintext": { side, size, limit_price, expiry_epoch,
//!                                 max_slippage_bps } }, ...] }
//!
//! Writes to stdout:
//!   { "enclave_pubkey": "<hex>", "timestamp_ms": u64,
//!     "matches": [{ ...MatchPayload fields..., "signature": "<hex>" }] }

use std::io::{self, Read, Write};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use shell_enclave::{
    DecryptedOrder, EnclaveSigner, MATCH_INTENT, OrderPlaintext, Side, match_orders,
};

#[derive(Deserialize)]
struct Input {
    orders: Vec<OrderJson>,
}

#[derive(Deserialize)]
struct OrderJson {
    order_id: String,
    trader: String,
    plaintext: PlaintextJson,
}

#[derive(Deserialize)]
struct PlaintextJson {
    side: String,
    size: u64,
    limit_price: u64,
    expiry_epoch: u64,
    max_slippage_bps: u32,
}

#[derive(Serialize)]
struct Output {
    enclave_pubkey: String,
    intent: u8,
    timestamp_ms: u64,
    matches: Vec<MatchJson>,
}

#[derive(Serialize)]
struct MatchJson {
    maker: String,
    taker: String,
    maker_order: String,
    taker_order: String,
    filled_size: u64,
    filled_price: u64,
    deepbook_tx_digest: String,
    signature: String,
}

fn main() -> io::Result<()> {
    let mut buf = String::new();
    io::stdin().read_to_string(&mut buf)?;
    let input: Input = serde_json::from_str(&buf)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;

    let signer = EnclaveSigner::generate();
    let timestamp_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let decoded: Result<Vec<DecryptedOrder>, String> =
        input.orders.iter().map(decode_order).collect();
    let decoded = decoded.map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;

    let fills = match_orders(&decoded);

    let mut emitted = Vec::with_capacity(fills.len());
    for payload in fills {
        let signed = signer.sign_match(payload.clone(), timestamp_ms);
        emitted.push(MatchJson {
            maker: to_hex(&payload.maker),
            taker: to_hex(&payload.taker),
            maker_order: to_hex(&payload.maker_order),
            taker_order: to_hex(&payload.taker_order),
            filled_size: payload.filled_size,
            filled_price: payload.filled_price,
            deepbook_tx_digest: hex::encode(&payload.deepbook_tx_digest),
            signature: hex::encode(signed.signature),
        });
    }

    let out = Output {
        enclave_pubkey: hex::encode(signer.public_key_bytes()),
        intent: MATCH_INTENT,
        timestamp_ms,
        matches: emitted,
    };
    serde_json::to_writer_pretty(io::stdout().lock(), &out)?;
    writeln!(io::stdout())?;
    Ok(())
}

fn decode_order(o: &OrderJson) -> Result<DecryptedOrder, String> {
    Ok(DecryptedOrder {
        order_id: parse_hex32(&o.order_id)?,
        trader: parse_hex32(&o.trader)?,
        plaintext: OrderPlaintext {
            side: match o.plaintext.side.as_str() {
                "buy" => Side::Buy,
                "sell" => Side::Sell,
                other => return Err(format!("unknown side: {other}")),
            },
            size: o.plaintext.size,
            limit_price: o.plaintext.limit_price,
            expiry_epoch: o.plaintext.expiry_epoch,
            max_slippage_bps: o.plaintext.max_slippage_bps,
        },
    })
}

fn parse_hex32(s: &str) -> Result<[u8; 32], String> {
    let stripped = s.strip_prefix("0x").unwrap_or(s);
    let bytes = hex::decode(stripped).map_err(|e| format!("hex decode: {e}"))?;
    bytes
        .try_into()
        .map_err(|v: Vec<u8>| format!("expected 32 bytes, got {}", v.len()))
}

fn to_hex(bytes: &[u8; 32]) -> String {
    format!("0x{}", hex::encode(bytes))
}
