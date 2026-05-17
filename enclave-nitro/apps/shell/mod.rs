// Copyright (c), 2026
// SPDX-License-Identifier: Apache-2.0

// Shell Finance matching app for the Nautilus framework.
//
// Drop this directory into a clone of MystenLabs/nautilus at
// `src/nautilus-server/src/apps/shell/`. The HTTP server registers
// `/process_data` at startup and routes incoming JSON requests to the
// `process_data` function below.
//
// Autonomous mode: on boot, `start_poller` spawns a background task that
// watches Sui for `OrderSubmitted` events, Seal-decrypts each order inside
// the TEE, matches them, and submits settlement PTBs — no frontend trigger.

use crate::common::IntentMessage;
use crate::common::ProcessDataRequest;
use crate::AppState;
use crate::EnclaveError;
use axum::extract::State;
use axum::Json;
use fastcrypto::encoding::{Base64, Encoding, Hex};
use fastcrypto::hash::{HashFunction, Sha256};
use fastcrypto::traits::{KeyPair, Signer, ToFromBytes};
use serde::{Deserialize, Serialize};
use serde_repr::{Deserialize_repr, Serialize_repr};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;
use tokio::time::sleep;

// ── On-chain constants ──────────────────────────────────────────────
const SHELL_PACKAGE_ID: &str =
    "0x5a47e78620e79a131bb8115a8f9e41f0bba0e387ec4c0ed93514853bd9987fbd";
const ENCLAVE_CONFIG_ID: &str =
    "0x741c7a6cf78930ca2dea0d3188749be18585d286e5c28bfdef007aff3468f41f";
const ENCLAVE_ID: &str =
    "0x1b18a55393efa9378c11e4eac0ad94c3ec3759f85be6c92f71a7a3b074b871e1";
const SUI_FULLNODE: &str = "https://fullnode.testnet.sui.io";
const SEAL_AGGREGATOR: &str = "https://seal-aggregator-testnet.mystenlabs.com";
const ORDER_SUBMITTED_EVENT: &str =
    "0x5a47e78620e79a131bb8115a8f9e41f0bba0e387ec4c0ed93514853bd9987fbd::pool::OrderSubmitted";
const POLL_INTERVAL_SECS: u64 = 5;

// ── Intent scope ────────────────────────────────────────────────────
#[derive(Serialize_repr, Deserialize_repr, Debug)]
#[repr(u8)]
pub enum IntentScope {
    ProcessData = 0,
}

// ── Wire shapes: /process_data (now accepts order IDs only) ─────────

/// Hybrid request — accepts EITHER full plaintexts (side-channel mode, used by
/// the existing TS spike scripts) OR bare order IDs (autonomous mode, looks
/// each up in the in-enclave decrypted order book). Side-channel mode bypasses
/// Seal-in-Nitro decrypt entirely so the demo path keeps working while Phase
/// 2 of the autonomous decrypt is still under construction.
#[derive(Debug, Deserialize)]
pub struct ShellRequest {
    #[serde(default)]
    pub orders: Vec<OrderInput>,
    #[serde(default)]
    pub order_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct OrderInput {
    pub order_id: String,
    pub trader: String,
    pub plaintext: PlaintextInput,
}

#[derive(Debug, Deserialize)]
pub struct PlaintextInput {
    pub side: String,
    pub size: u64,
    pub limit_price: u64,
    #[serde(default)]
    pub expiry_epoch: u64,
    #[serde(default)]
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

// ── Internal order book types ───────────────────────────────────────

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
    expiry_epoch: u64,
    /// Move type of collateral coin (e.g. "0x2::sui::SUI")
    collateral_type: String,
}

pub type OrderBook = Arc<RwLock<HashMap<[u8; 32], DecryptedOrder>>>;

// ── Extended AppState fields ────────────────────────────────────────
// Nautilus defines AppState. We extend it via a newtype wrapper
// accessible through the order_book + http fields we add to the
// application context through the shared Arc.

pub struct ShellState {
    pub order_book: OrderBook,
    pub http: reqwest::Client,
}

impl ShellState {
    pub fn new() -> Self {
        Self {
            order_book: Arc::new(RwLock::new(HashMap::new())),
            http: reqwest::Client::new(),
        }
    }
}

impl Default for ShellState {
    fn default() -> Self {
        Self::new()
    }
}

// ── Handler: /process_data ──────────────────────────────────────────

pub async fn process_data(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ProcessDataRequest<ShellRequest>>,
) -> Result<Json<ShellResponse>, EnclaveError> {
    // ── Side-channel mode: caller ships plaintexts ──────────────────────
    if !request.payload.orders.is_empty() {
        let orders = decode_side_channel_orders(&request.payload.orders)?;
        let payloads = match_orders(&orders);
        let response = sign_envelopes(&state, payloads).await?;
        return Ok(Json(response));
    }

    // ── Autonomous mode: look up order_ids in the in-enclave book ──────
    let book = state.shell.order_book.read().await;
    let orders: Vec<DecryptedOrder> = request
        .payload
        .order_ids
        .iter()
        .filter_map(|s| parse_hex32(s).ok())
        .filter_map(|id| book.get(&id).cloned())
        .collect();
    drop(book);

    let payloads = match_orders(&orders);
    let response = sign_and_settle(&state, payloads).await?;
    Ok(Json(response))
}

fn decode_side_channel_orders(input: &[OrderInput]) -> Result<Vec<DecryptedOrder>, EnclaveError> {
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
                expiry_epoch: o.plaintext.expiry_epoch,
                // Caller orchestrates settle in side-channel mode; collateral
                // type is recovered from the on-chain OrderCommitment<T> tag
                // by the spike script itself, not by us.
                collateral_type: "0x2::sui::SUI".to_string(),
            })
        })
        .collect()
}

/// Sign each match payload without attempting auto-settle. Used by the
/// side-channel handler — caller submits the settlement PTB themselves.
async fn sign_envelopes(
    state: &Arc<AppState>,
    payloads: Vec<MatchPayload>,
) -> Result<ShellResponse, EnclaveError> {
    let timestamp_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| EnclaveError::GenericError(format!("clock: {e}")))?
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

    Ok(ShellResponse {
        enclave_pubkey: Hex::encode(state.eph_kp.public().as_bytes()),
        intent,
        timestamp_ms,
        matches,
    })
}

// ── Autonomous poller ───────────────────────────────────────────────

/// Spawn the background chain-watching task. Call once from the Nautilus
/// app initialisation hook (mirror seal-example's `on_start`).
pub fn start_poller(state: Arc<AppState>) {
    tokio::spawn(async move {
        let http = &state.shell.http;
        let mut cursor: Option<serde_json::Value> = None;

        loop {
            match poll_once(&state, http, &mut cursor).await {
                Ok(_) => {}
                Err(e) => eprintln!("[shell-poller] error: {e}"),
            }
            sleep(Duration::from_secs(POLL_INTERVAL_SECS)).await;
        }
    });
}

async fn poll_once(
    state: &Arc<AppState>,
    http: &reqwest::Client,
    cursor: &mut Option<serde_json::Value>,
) -> Result<(), EnclaveError> {
    // ── Fetch current epoch for expiry pruning ──────────────────────
    let sys_state = sui_rpc(
        http,
        "sui_getLatestSuiSystemState",
        serde_json::json!([]),
    )
    .await?;
    let current_epoch: u64 = sys_state["epoch"]
        .as_str()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    // ── Query new OrderSubmitted events ─────────────────────────────
    let query_params = serde_json::json!([
        { "MoveEventType": ORDER_SUBMITTED_EVENT },
        cursor,
        50,
        "ascending"
    ]);
    let result = sui_rpc(http, "suix_queryEvents", query_params).await?;

    let empty = vec![];
    let events = result["data"].as_array().unwrap_or(&empty);

    for event in events {
        let json = &event["parsedJson"];
        let order_id_str = json["order_id"].as_str().unwrap_or_default();
        let trader_str = json["trader"].as_str().unwrap_or_default();
        let expiry_epoch: u64 = json["expiry_epoch"]
            .as_str()
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);

        if expiry_epoch > 0 && current_epoch >= expiry_epoch {
            continue; // expired before we saw it
        }

        let order_id = match parse_hex32(order_id_str) {
            Ok(id) => id,
            Err(_) => continue,
        };

        // Skip already-known orders
        if state.shell.order_book.read().await.contains_key(&order_id) {
            continue;
        }

        // ── Fetch on-chain OrderCommitment object ───────────────────
        let obj = match fetch_order_commitment(http, order_id_str).await {
            Ok(o) => o,
            Err(e) => {
                eprintln!("[shell-poller] fetch object {order_id_str}: {e}");
                continue;
            }
        };

        let sealed_envelope_hex = obj.sealed_envelope;
        let commit_hash_hex = obj.commit_hash;
        let collateral_type = obj.collateral_type;

        // ── Seal-decrypt the order ──────────────────────────────────
        let order = match decrypt_order(
            state,
            http,
            order_id,
            &sealed_envelope_hex,
            &commit_hash_hex,
            trader_str,
            expiry_epoch,
            collateral_type,
        )
        .await
        {
            Ok(o) => o,
            Err(e) => {
                eprintln!("[shell-poller] decrypt {order_id_str}: {e}");
                continue;
            }
        };

        // ── Insert into order book + attempt match ──────────────────
        {
            let mut book = state.shell.order_book.write().await;
            book.insert(order_id, order);
        }

        match try_match_and_settle(state).await {
            Ok(_) => {}
            Err(e) => eprintln!("[shell-poller] settle error: {e}"),
        }
    }

    // ── Prune expired orders ────────────────────────────────────────
    {
        let mut book = state.shell.order_book.write().await;
        book.retain(|_, o| current_epoch < o.expiry_epoch);
    }

    // ── Advance cursor ──────────────────────────────────────────────
    if let Some(next) = result.get("nextCursor") {
        if !next.is_null() {
            *cursor = Some(next.clone());
        }
    }

    Ok(())
}

// ── Seal decryption ─────────────────────────────────────────────────

struct CommitmentFields {
    sealed_envelope: String, // hex
    commit_hash: String,     // hex
    collateral_type: String, // Move type tag
}

async fn fetch_order_commitment(
    http: &reqwest::Client,
    object_id: &str,
) -> Result<CommitmentFields, EnclaveError> {
    let result = sui_rpc(
        http,
        "sui_getObject",
        serde_json::json!([object_id, { "showContent": true, "showType": true }]),
    )
    .await?;

    let content = &result["data"]["content"]["fields"];
    let sealed_envelope = content["sealed_envelope"]
        .as_str()
        .ok_or_else(|| EnclaveError::GenericError("missing sealed_envelope".into()))?
        .to_string();
    let commit_hash = content["commit_hash"]
        .as_str()
        .ok_or_else(|| EnclaveError::GenericError("missing commit_hash".into()))?
        .to_string();

    // Extract collateral type T from OrderCommitment<T> type tag
    let type_tag = result["data"]["type"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    let collateral_type = type_tag
        .split('<')
        .nth(1)
        .and_then(|s| s.strip_suffix('>'))
        .unwrap_or("0x2::sui::SUI")
        .to_string();

    Ok(CommitmentFields {
        sealed_envelope,
        commit_hash,
        collateral_type,
    })
}

async fn decrypt_order(
    state: &Arc<AppState>,
    http: &reqwest::Client,
    order_id: [u8; 32],
    sealed_envelope_hex: &str,
    commit_hash_hex: &str,
    trader_str: &str,
    expiry_epoch: u64,
    collateral_type: String,
) -> Result<DecryptedOrder, EnclaveError> {
    let envelope_bytes = Hex::decode(sealed_envelope_hex.strip_prefix("0x").unwrap_or(sealed_envelope_hex))
        .map_err(|e| EnclaveError::GenericError(format!("envelope hex: {e}")))?;
    if envelope_bytes.len() < 32 {
        return Err(EnclaveError::GenericError("sealed_envelope too short".into()));
    }

    // First 32 bytes = Seal IBE identity (nonce chosen by the client during encryptOrder)
    let seal_id: [u8; 32] = envelope_bytes[..32].try_into().unwrap();
    let ciphertext = &envelope_bytes[32..];

    // PHASE 2 TODO: real Seal-in-Nitro decrypt — use seal_sdk::seal_decrypt_object
    // with cached IBE keys (see apps/seal-example/endpoints.rs pattern). Until then,
    // surface a clean error so /process_data + the poller fail loudly instead of
    // silently signing matches over fake data.
    let _ = (state, http, seal_id, ciphertext);
    return Err(EnclaveError::GenericError(
        "Seal-in-Nitro decrypt not yet implemented (Phase 2)".into(),
    ));
    #[allow(unreachable_code)]
    let plaintext_bytes: Vec<u8> = Vec::new();

    // Verify SHA-256(plaintext) == commit_hash
    let digest = Sha256::digest(&plaintext_bytes);
    let expected = Hex::decode(commit_hash_hex.strip_prefix("0x").unwrap_or(commit_hash_hex))
        .map_err(|e| EnclaveError::GenericError(format!("commit_hash hex: {e}")))?;
    if digest.as_ref() != expected.as_slice() {
        return Err(EnclaveError::GenericError(
            "commit_hash mismatch — plaintext tampered".into(),
        ));
    }

    // BCS-deserialise into OrderPlaintext
    // BCS layout (field order matters): side u8, size u64, limit_price u64, expiry_epoch u64, max_slippage_bps u32
    let mut cursor = std::io::Cursor::new(&plaintext_bytes);
    let side_byte: u8 = bcs::from_bytes(&{
        let mut b = [0u8; 1];
        std::io::Read::read_exact(&mut cursor, &mut b)
            .map_err(|e| EnclaveError::GenericError(format!("read side: {e}")))?;
        b
    })
    .unwrap_or(plaintext_bytes[0]);
    // Simpler: decode the full struct at once
    #[derive(Deserialize)]
    struct PlaintextBcs {
        side: u8,
        size: u64,
        limit_price: u64,
        #[allow(dead_code)]
        expiry_epoch: u64,
        #[allow(dead_code)]
        max_slippage_bps: u32,
    }
    let _ = side_byte; // suppress unused warning from partial read attempt above
    let p: PlaintextBcs = bcs::from_bytes(&plaintext_bytes)
        .map_err(|e| EnclaveError::GenericError(format!("bcs decode: {e}")))?;

    let side = match p.side {
        0 => Side::Buy,
        1 => Side::Sell,
        other => return Err(EnclaveError::GenericError(format!("bad side byte: {other}"))),
    };

    let trader = parse_hex32(trader_str)?;

    Ok(DecryptedOrder {
        order_id,
        trader,
        side,
        size: p.size,
        limit_price: p.limit_price,
        expiry_epoch,
        collateral_type,
    })
}

async fn fetch_seal_key(
    state: &Arc<AppState>,
    http: &reqwest::Client,
    seal_id: &[u8; 32],
) -> Result<Vec<u8>, EnclaveError> {
    // Build PTB: shell::shell::seal_approve(id_bytes, &Enclave<SHELL>, ctx)
    // The Seal aggregator dry-runs this PTB; ctx.sender() must equal the
    // enclave's registered on-chain address (blake2b256(0x00 || pubkey)).
    let id_hex = Hex::encode(seal_id);
    let enclave_addr = enclave_sui_address(state);

    // Minimal PTB JSON for Seal's dry-run (MoveCall command)
    let ptb = serde_json::json!({
        "version": 2,
        "sender": enclave_addr,
        "gasData": { "budget": "10000000", "owner": enclave_addr, "payment": [], "price": "1000" },
        "inputs": [
            { "type": "pure", "valueType": "vector<u8>", "value": seal_id },
            { "type": "object", "objectType": "sharedObject", "objectId": ENCLAVE_CONFIG_ID,
              "initialSharedVersion": "1", "mutable": false }
        ],
        "commands": [{
            "MoveCall": {
                "package": SHELL_PACKAGE_ID,
                "module": "shell",
                "function": "seal_approve",
                "typeArguments": [],
                "arguments": [
                    { "Input": 0 },
                    { "Input": 1 }
                ]
            }
        }]
    });

    let ptb_bytes = serde_json::to_vec(&ptb)
        .map_err(|e| EnclaveError::GenericError(format!("ptb serialise: {e}")))?;
    let ptb_b64 = Base64::encode(&ptb_bytes);

    // Sign PTB bytes with enclave's keypair
    let sig = state.eph_kp.sign(&ptb_bytes);
    let sig_hex = Hex::encode(sig.as_bytes());
    let pubkey_hex = Hex::encode(state.eph_kp.public().as_bytes());

    let body = serde_json::json!({
        "ptb": ptb_b64,
        "enc_key": pubkey_hex,
        "enc_verification_key": pubkey_hex,
        "id": id_hex,
        "signature": sig_hex,
    });

    let resp = http
        .post(format!("{SEAL_AGGREGATOR}/v1/fetch_key"))
        .json(&body)
        .send()
        .await
        .map_err(|e| EnclaveError::GenericError(format!("fetch_key http: {e}")))?;

    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(EnclaveError::GenericError(format!("fetch_key {text}")));
    }

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| EnclaveError::GenericError(format!("fetch_key json: {e}")))?;

    // Response contains IBE key shares encrypted to the enclave's ElGamal key.
    // Combine shares using BLS12-381 to derive the symmetric key.
    // The Seal aggregator returns `decryption_key` as a hex-encoded point.
    let key_hex = json["decryption_key"]
        .as_str()
        .ok_or_else(|| EnclaveError::GenericError("no decryption_key in response".into()))?;
    let key_bytes = Hex::decode(key_hex)
        .map_err(|e| EnclaveError::GenericError(format!("key hex: {e}")))?;

    // The key bytes are the 32-byte AES-GCM key derived from the IBE key share.
    // (Seal's current testnet aggregator returns the symmetric key directly when
    // verifyKeyServers=false and there's a single key server with weight=1.)
    if key_bytes.len() != 32 {
        return Err(EnclaveError::GenericError(format!(
            "unexpected key length {} (expected 32)",
            key_bytes.len()
        )));
    }

    Ok(key_bytes)
}

// ── Matching + settlement ───────────────────────────────────────────

async fn try_match_and_settle(state: &Arc<AppState>) -> Result<(), EnclaveError> {
    let orders: Vec<DecryptedOrder> = state
        .shell
        .order_book
        .read()
        .await
        .values()
        .cloned()
        .collect();

    let payloads = match_orders(&orders);
    if payloads.is_empty() {
        return Ok(());
    }

    let response = sign_and_settle(state, payloads).await?;

    // Remove consumed orders from the book
    let mut book = state.shell.order_book.write().await;
    for m in &response.matches {
        let p = &m.envelope.data;
        book.remove(&p.maker_order);
        book.remove(&p.taker_order);
    }

    Ok(())
}

async fn sign_and_settle(
    state: &Arc<AppState>,
    payloads: Vec<MatchPayload>,
) -> Result<ShellResponse, EnclaveError> {
    let timestamp_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| EnclaveError::GenericError(format!("clock: {e}")))?
        .as_millis() as u64;
    let intent = IntentScope::ProcessData as u8;

    let mut matches = Vec::with_capacity(payloads.len());
    for payload in payloads {
        let envelope = IntentMessage::new(payload.clone(), timestamp_ms, intent);
        let bytes = bcs::to_bytes(&envelope)
            .map_err(|e| EnclaveError::GenericError(format!("bcs: {e}")))?;
        let sig = state.eph_kp.sign(&bytes);
        let sig_hex = Hex::encode(sig.as_bytes());

        // Submit settlement PTB to Sui
        if let Err(e) = submit_settlement(state, &payload, timestamp_ms, &sig_hex).await {
            eprintln!("[shell] settlement PTB failed: {e}");
            // Non-fatal — signed match is still returned for manual recovery
        }

        matches.push(SignedMatch {
            envelope,
            signature: sig_hex,
        });
    }

    Ok(ShellResponse {
        enclave_pubkey: Hex::encode(state.eph_kp.public().as_bytes()),
        intent,
        timestamp_ms,
        matches,
    })
}

async fn submit_settlement(
    state: &Arc<AppState>,
    payload: &MatchPayload,
    timestamp_ms: u64,
    sig_hex: &str,
) -> Result<(), EnclaveError> {
    let http = &state.shell.http;

    // Look up collateral types from order book (still present at call site)
    let book = state.shell.order_book.read().await;
    let maker_type = book
        .get(&payload.maker_order)
        .map(|o| o.collateral_type.clone())
        .ok_or_else(|| EnclaveError::GenericError("maker order not in book".into()))?;
    let taker_type = book
        .get(&payload.taker_order)
        .map(|o| o.collateral_type.clone())
        .ok_or_else(|| EnclaveError::GenericError("taker order not in book".into()))?;
    drop(book);

    let enclave_addr = enclave_sui_address(state);
    let maker_order_hex = format!("0x{}", Hex::encode(&payload.maker_order));
    let taker_order_hex = format!("0x{}", Hex::encode(&payload.taker_order));
    let maker_hex = format!("0x{}", Hex::encode(&payload.maker));
    let taker_hex = format!("0x{}", Hex::encode(&payload.taker));
    let sig_bytes: Vec<u8> = Hex::decode(sig_hex)
        .map_err(|e| EnclaveError::GenericError(format!("sig hex: {e}")))?;

    // Build PTB: attestation::verify → settlement::settle<MakerT, TakerT>
    let ptb = serde_json::json!({
        "version": 2,
        "sender": enclave_addr,
        "gasData": { "budget": "50000000", "owner": enclave_addr, "payment": [], "price": "1000" },
        "inputs": [
            { "type": "object", "objectType": "sharedObject", "objectId": ENCLAVE_ID,
              "initialSharedVersion": "1", "mutable": false },
            { "type": "pure", "valueType": "u64", "value": timestamp_ms.to_string() },
            { "type": "pure", "valueType": "address", "value": maker_hex },
            { "type": "pure", "valueType": "address", "value": taker_hex },
            { "type": "pure", "valueType": "address", "value": maker_order_hex },
            { "type": "pure", "valueType": "address", "value": taker_order_hex },
            { "type": "pure", "valueType": "u64", "value": payload.filled_size.to_string() },
            { "type": "pure", "valueType": "u64", "value": payload.filled_price.to_string() },
            { "type": "pure", "valueType": "vector<u8>", "value": payload.deepbook_tx_digest },
            { "type": "pure", "valueType": "vector<u8>", "value": sig_bytes },
            { "type": "object", "objectType": "sharedObject", "objectId": maker_order_hex,
              "initialSharedVersion": "1", "mutable": true },
            { "type": "object", "objectType": "sharedObject", "objectId": taker_order_hex,
              "initialSharedVersion": "1", "mutable": true },
        ],
        "commands": [
            {
                "MoveCall": {
                    "package": SHELL_PACKAGE_ID,
                    "module": "attestation",
                    "function": "verify",
                    "typeArguments": [],
                    "arguments": [
                        {"Input":0},{"Input":1},{"Input":2},{"Input":3},
                        {"Input":4},{"Input":5},{"Input":6},{"Input":7},
                        {"Input":8},{"Input":9}
                    ]
                }
            },
            {
                "MoveCall": {
                    "package": SHELL_PACKAGE_ID,
                    "module": "settlement",
                    "function": "settle",
                    "typeArguments": [maker_type, taker_type],
                    "arguments": [
                        {"Result":0},{"Input":10},{"Input":11}
                    ]
                }
            }
        ]
    });

    let ptb_bytes = serde_json::to_vec(&ptb)
        .map_err(|e| EnclaveError::GenericError(format!("ptb serialise: {e}")))?;
    let sig = state.eph_kp.sign(&ptb_bytes);
    let tx_sig = format!(
        "0x{}{}{}",
        "00", // Ed25519 flag
        Hex::encode(sig.as_bytes()),
        Hex::encode(state.eph_kp.public().as_bytes()),
    );

    let result = sui_rpc(
        http,
        "sui_executeTransactionBlock",
        serde_json::json!([
            Base64::encode(&ptb_bytes),
            [tx_sig],
            { "showEffects": true },
            "WaitForLocalExecution"
        ]),
    )
    .await?;

    let status = result["effects"]["status"]["status"].as_str().unwrap_or("unknown");
    if status != "success" {
        return Err(EnclaveError::GenericError(format!(
            "settlement tx status: {status} — {}",
            result["effects"]["status"]["error"].as_str().unwrap_or("")
        )));
    }

    eprintln!(
        "[shell] settled: maker={maker_order_hex} taker={taker_order_hex} digest={}",
        result["digest"].as_str().unwrap_or("?")
    );

    Ok(())
}

// ── Helpers ─────────────────────────────────────────────────────────

async fn sui_rpc(
    http: &reqwest::Client,
    method: &str,
    params: serde_json::Value,
) -> Result<serde_json::Value, EnclaveError> {
    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params,
    });

    let resp = http
        .post(SUI_FULLNODE)
        .json(&body)
        .send()
        .await
        .map_err(|e| EnclaveError::GenericError(format!("{method} http: {e}")))?
        .json::<serde_json::Value>()
        .await
        .map_err(|e| EnclaveError::GenericError(format!("{method} json: {e}")))?;

    if let Some(err) = resp.get("error") {
        return Err(EnclaveError::GenericError(format!("{method} rpc error: {err}")));
    }

    Ok(resp["result"].clone())
}

fn enclave_sui_address(state: &AppState) -> String {
    // Sui address derivation: blake2b256(0x00 || 32-byte pubkey)
    use fastcrypto::hash::Blake2b256;
    let mut input = vec![0x00u8];
    input.extend_from_slice(state.eph_kp.public().as_bytes());
    let digest = Blake2b256::digest(&input);
    format!("0x{}", Hex::encode(digest.as_ref()))
}

fn parse_hex32(s: &str) -> Result<[u8; 32], EnclaveError> {
    let stripped = s.strip_prefix("0x").unwrap_or(s);
    let bytes = Hex::decode(stripped)
        .map_err(|e| EnclaveError::GenericError(format!("hex: {e}")))?;
    bytes
        .try_into()
        .map_err(|v: Vec<u8>| EnclaveError::GenericError(format!("expected 32B, got {}", v.len())))
}

/// Price-time-priority matcher. Whole-fill only. Maker = lower input index.
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
            if bid.size > ask.size { ai += 1; } else { bi += 1; }
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

// ── Tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod test {
    use super::*;
    use fastcrypto::{ed25519::Ed25519KeyPair, traits::KeyPair};

    fn make_order(idx: usize, side: Side, size: u64, price: u64) -> DecryptedOrder {
        let mut id = [0u8; 32];
        id[31] = idx as u8;
        let mut trader = [0u8; 32];
        trader[31] = (idx + 0xaa) as u8;
        DecryptedOrder {
            order_id: id,
            trader,
            side,
            size,
            limit_price: price,
            expiry_epoch: 9999,
            collateral_type: "0x2::sui::SUI".into(),
        }
    }

    #[test]
    fn crossing_pair_matches() {
        let orders = vec![
            make_order(0, Side::Buy, 100, 12_500),
            make_order(1, Side::Sell, 100, 12_400),
        ];
        let fills = match_orders(&orders);
        assert_eq!(fills.len(), 1);
        assert_eq!(fills[0].filled_size, 100);
        assert_eq!(fills[0].filled_price, 12_500); // maker price
    }

    #[test]
    fn non_crossing_pair_no_match() {
        let orders = vec![
            make_order(0, Side::Buy, 100, 12_000),
            make_order(1, Side::Sell, 100, 12_500),
        ];
        assert!(match_orders(&orders).is_empty());
    }

    #[test]
    fn match_payload_bcs_layout_pins_to_move() {
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
