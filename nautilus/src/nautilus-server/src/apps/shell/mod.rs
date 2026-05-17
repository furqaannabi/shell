// Copyright (c), 2026
// SPDX-License-Identifier: Apache-2.0

// Shell Finance matching app for the Nautilus framework.
//
// Drop this directory into a clone of MystenLabs/nautilus at
// `src/nautilus-server/src/apps/shell/`. The HTTP server registers
// `/process_data` at startup and routes incoming JSON requests to the
// `process_data` function below.
//
// The matching logic + BCS layout in this file mirror
// `shell-enclave` (../../../enclave/src/match_payload.rs +
// ../../../enclave/src/matcher.rs) byte-for-byte. They are duplicated
// rather than path-dep'd because the Nautilus tree is cloned
// separately and a path-dep would hard-code an absolute checkout
// location. Tests against the upstream `enclave::test_serde` reference
// vector keep both copies honest.

use crate::common::IntentMessage;
use crate::common::ProcessDataRequest;
use crate::AppState;
use crate::EnclaveError;
use axum::extract::State;
use axum::Json;
use fastcrypto::encoding::{Encoding, Hex};
use fastcrypto::traits::{KeyPair, Signer, ToFromBytes};
use serde::{Deserialize, Serialize};
use serde_repr::{Deserialize_repr, Serialize_repr};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

/// Per-app intent scope. Move side reads this as `MATCH_INTENT = 0`
/// in `shell::attestation`.
#[derive(Serialize_repr, Deserialize_repr, Debug)]
#[repr(u8)]
pub enum IntentScope {
    ProcessData = 0,
}

// ── Wire shapes ────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct ShellRequest {
    pub orders: Vec<OrderInput>,
}

#[derive(Debug, Deserialize)]
pub struct OrderInput {
    /// 0x-prefixed 32-byte hex.
    pub order_id: String,
    /// 0x-prefixed 32-byte hex.
    pub trader: String,
    pub plaintext: PlaintextInput,
}

#[derive(Debug, Deserialize)]
pub struct PlaintextInput {
    pub side: String, // "buy" | "sell"
    pub size: u64,
    pub limit_price: u64,
    pub expiry_epoch: u64,
    pub max_slippage_bps: u32,
}

#[derive(Serialize)]
pub struct ShellResponse {
    pub enclave_pubkey: String,
    pub intent: u8,
    pub timestamp_ms: u64,
    pub matches: Vec<SignedMatch>,
}

#[derive(Serialize)]
pub struct SignedMatch {
    pub envelope: IntentMessage<MatchPayload>,
    pub signature: String,
}

/// BCS field order locked to `shell::attestation::MatchPayload`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchPayload {
    pub maker: [u8; 32],
    pub taker: [u8; 32],
    pub maker_order: [u8; 32],
    pub taker_order: [u8; 32],
    pub filled_size: u64,
    pub filled_price: u64,
    pub deepbook_tx_digest: Vec<u8>,
}

// ── Handler ────────────────────────────────────────────────────────

pub async fn process_data(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ProcessDataRequest<ShellRequest>>,
) -> Result<Json<ShellResponse>, EnclaveError> {
    let orders = decode_orders(&request.payload.orders)?;
    let payloads = match_orders(&orders);

    let timestamp_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| EnclaveError::GenericError(format!("clock skew: {e}")))?
        .as_millis() as u64;
    let intent = IntentScope::ProcessData as u8;

    let mut matches = Vec::with_capacity(payloads.len());
    for payload in payloads {
        let envelope = IntentMessage::new(payload, timestamp_ms, intent);
        let bytes = bcs::to_bytes(&envelope)
            .map_err(|e| EnclaveError::GenericError(format!("bcs: {e}")))?;
        let sig = state.eph_kp.sign(&bytes);
        matches.push(SignedMatch {
            envelope,
            signature: Hex::encode(sig.as_bytes()),
        });
    }

    Ok(Json(ShellResponse {
        enclave_pubkey: Hex::encode(state.eph_kp.public().as_bytes()),
        intent,
        timestamp_ms,
        matches,
    }))
}

// ── Internal types + matcher ───────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Side {
    Buy,
    Sell,
}

#[derive(Debug, Clone)]
struct DecryptedOrder {
    order_id: [u8; 32],
    trader: [u8; 32],
    side: Side,
    size: u64,
    limit_price: u64,
}

fn decode_orders(input: &[OrderInput]) -> Result<Vec<DecryptedOrder>, EnclaveError> {
    input
        .iter()
        .map(|o| {
            let side = match o.plaintext.side.as_str() {
                "buy" => Side::Buy,
                "sell" => Side::Sell,
                other => return Err(EnclaveError::GenericError(format!("bad side: {other}"))),
            };
            Ok(DecryptedOrder {
                order_id: parse_hex32(&o.order_id)?,
                trader: parse_hex32(&o.trader)?,
                side,
                size: o.plaintext.size,
                limit_price: o.plaintext.limit_price,
            })
        })
        .collect()
}

fn parse_hex32(s: &str) -> Result<[u8; 32], EnclaveError> {
    let stripped = s.strip_prefix("0x").unwrap_or(s);
    let bytes = Hex::decode(stripped)
        .map_err(|e| EnclaveError::GenericError(format!("hex: {e}")))?;
    bytes
        .try_into()
        .map_err(|v: Vec<u8>| EnclaveError::GenericError(format!("expected 32B, got {}", v.len())))
}

/// Price-time-priority matcher. Whole-fill only; mismatched sizes are
/// deferred. Maker = lower input index. Mirrors shell-enclave's
/// `match_orders`.
fn match_orders(orders: &[DecryptedOrder]) -> Vec<MatchPayload> {
    let mut bids: Vec<(usize, &DecryptedOrder)> = orders
        .iter()
        .enumerate()
        .filter(|(_, o)| matches!(o.side, Side::Buy))
        .collect();
    let mut asks: Vec<(usize, &DecryptedOrder)> = orders
        .iter()
        .enumerate()
        .filter(|(_, o)| matches!(o.side, Side::Sell))
        .collect();

    bids.sort_by(|a, b| b.1.limit_price.cmp(&a.1.limit_price).then(a.0.cmp(&b.0)));
    asks.sort_by(|a, b| a.1.limit_price.cmp(&b.1.limit_price).then(a.0.cmp(&b.0)));

    let mut fills = Vec::new();
    let (mut bi, mut ai) = (0usize, 0usize);

    while bi < bids.len() && ai < asks.len() {
        let (b_idx, bid) = bids[bi];
        let (a_idx, ask) = asks[ai];

        if bid.limit_price < ask.limit_price {
            break;
        }
        if bid.size != ask.size {
            if bid.size > ask.size {
                ai += 1;
            } else {
                bi += 1;
            }
            continue;
        }

        let (maker, taker) = if b_idx < a_idx { (bid, ask) } else { (ask, bid) };
        fills.push(MatchPayload {
            maker: maker.trader,
            taker: taker.trader,
            maker_order: maker.order_id,
            taker_order: taker.order_id,
            filled_size: bid.size,
            filled_price: maker.limit_price,
            deepbook_tx_digest: vec![],
        });

        bi += 1;
        ai += 1;
    }

    fills
}

#[cfg(test)]
mod test {
    use super::*;
    use fastcrypto::{ed25519::Ed25519KeyPair, traits::KeyPair};

    #[tokio::test]
    async fn process_data_returns_one_match_for_a_crossing_pair() {
        let state = Arc::new(AppState {
            eph_kp: Ed25519KeyPair::generate(&mut rand::thread_rng()),
            api_key: String::new(),
        });

        let req = ProcessDataRequest {
            payload: ShellRequest {
                orders: vec![
                    OrderInput {
                        order_id: "0x0000000000000000000000000000000000000000000000000000000000000001".to_string(),
                        trader: "0x00000000000000000000000000000000000000000000000000000000000000aa".to_string(),
                        plaintext: PlaintextInput {
                            side: "buy".to_string(),
                            size: 100,
                            limit_price: 12_500,
                            expiry_epoch: 1200,
                            max_slippage_bps: 50,
                        },
                    },
                    OrderInput {
                        order_id: "0x0000000000000000000000000000000000000000000000000000000000000002".to_string(),
                        trader: "0x00000000000000000000000000000000000000000000000000000000000000bb".to_string(),
                        plaintext: PlaintextInput {
                            side: "sell".to_string(),
                            size: 100,
                            limit_price: 12_400,
                            expiry_epoch: 1200,
                            max_slippage_bps: 50,
                        },
                    },
                ],
            },
        };

        let resp = process_data(State(state), Json(req)).await.unwrap();
        assert_eq!(resp.matches.len(), 1);
        let m = &resp.matches[0].envelope.data;
        assert_eq!(m.filled_size, 100);
        assert_eq!(m.filled_price, 12_500);
        assert_eq!(m.maker, [0xAAu8; 32]);
        assert_eq!(m.taker, [0xBBu8; 32]);
    }

    #[test]
    fn match_payload_bcs_layout_pins_to_move() {
        // Reference vector reproducible from a Move test_scenario that
        // BCS-encodes the same struct. Locks the wire format so a Move
        // refactor that reorders fields trips this check.
        let p = MatchPayload {
            maker: [0xAA; 32],
            taker: [0xBB; 32],
            maker_order: [0xCC; 32],
            taker_order: [0xDD; 32],
            filled_size: 1_000,
            filled_price: 12_500,
            deepbook_tx_digest: b"db".to_vec(),
        };
        let bytes = bcs::to_bytes(&p).unwrap();
        // 32B maker | 32B taker | 32B maker_order | 32B taker_order
        //   | 1000u64 LE | 12500u64 LE | uleb 2 | "db"
        let mut expected = Vec::new();
        expected.extend(std::iter::repeat(0xAA).take(32));
        expected.extend(std::iter::repeat(0xBB).take(32));
        expected.extend(std::iter::repeat(0xCC).take(32));
        expected.extend(std::iter::repeat(0xDD).take(32));
        expected.extend(1000u64.to_le_bytes());
        expected.extend(12_500u64.to_le_bytes());
        expected.push(2);
        expected.extend(b"db");
        assert_eq!(bytes, expected);
    }
}
