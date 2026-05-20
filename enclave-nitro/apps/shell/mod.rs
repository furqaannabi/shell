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
use fastcrypto::ed25519::Ed25519KeyPair;
use fastcrypto::encoding::{Base64, Encoding, Hex};
use fastcrypto::hash::{HashFunction, Sha256};
use fastcrypto::traits::{KeyPair, Signer, ToFromBytes};
use rand::thread_rng;
use seal_sdk::types::{ElGamalPublicKey, ElgamalVerificationKey, FetchKeyRequest, FetchKeyResponse};
use seal_sdk::{
    decrypt_seal_responses, genkey, seal_decrypt_object, signed_message, signed_request,
    Certificate, ElGamalSecretKey, EncryptedObject, IBEPublicKey,
};
use serde::{Deserialize, Serialize};
use serde_repr::{Deserialize_repr, Serialize_repr};
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use sui_crypto::ed25519::Ed25519PrivateKey;
use sui_crypto::SuiSigner;
use sui_sdk_types::{
    Address, Argument, Command, Digest, GasPayment, Identifier, Input, MoveCall,
    ObjectReference, PersonalMessage, ProgrammableTransaction, Transaction,
    TransactionExpiration, TransactionKind, TypeTag,
};
use tokio::sync::RwLock;
use tokio::time::sleep;

// ── On-chain constants ──────────────────────────────────────────────
const SHELL_PACKAGE_ID: &str =
    "0x6a9fb5d245856d9c81da6952b431dceebf870820766df0bee8a6339cb06a56fd";
const ENCLAVE_CONFIG_ID: &str =
    "0xd33555df99c5065a610e479ad39f711ba0219da1f04276b3c2be71101f8f7bb8";
const ENCLAVE_ID: &str =
    "0xa6589585791e4f3aa80164cd98bf8fc3385ebe93ff64d0c371596e21362cc9c3";
const SEAL_TESTNET_KEY_SERVER: &str =
    "0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98";
const SUI_FULLNODE: &str = "https://fullnode.testnet.sui.io";
const SEAL_AGGREGATOR: &str = "https://seal-aggregator-testnet.mystenlabs.com";
const ORDER_SUBMITTED_EVENT: &str =
    "0x6a9fb5d245856d9c81da6952b431dceebf870820766df0bee8a6339cb06a56fd::pool::OrderSubmitted";
const POLL_INTERVAL_SECS: u64 = 5;
const SEAL_CERT_TTL_MIN: u16 = 30;

// ── DeepBook v3 (testnet) constants ─────────────────────────────────
const DEEPBOOK_SUI_DBUSDC_POOL: &str =
    "0x1c19362ca52b8ffd7a33cee805a67d40f31e6ba303753fd3a4cfdfacea7163a5";
const DEEP_COIN_TYPE: &str =
    "0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP";
/// 0x6 — the global Clock shared object, initial_shared_version is 1.
const SUI_CLOCK_OBJECT_ID: &str =
    "0x0000000000000000000000000000000000000000000000000000000000000006";
const SUI_CLOCK_INITIAL_SHARED_VERSION: u64 = 1;
/// Default slippage budget passed to settle. Matches the SDK's default
/// `max_slippage_bps: 50` for now; future work threads the per-order
/// value from the decrypted plaintext.
const DEFAULT_SLIPPAGE_BPS: u64 = 50;

// ── Seal-in-Nitro persistent state ───────────────────────────────────
// ElGamal keypair generated once at enclave boot, used to receive
// per-order IBE shares from the Seal key server. Static so the
// pubkey is stable across requests.
//
// SERVER_PK_MAP is filled lazily on the first decrypt; it holds the
// key server's IBE public key fetched from on-chain so we can verify
// the share decryption.
lazy_static::lazy_static! {
    static ref ENCRYPTION_KEYS: (ElGamalSecretKey, ElGamalPublicKey, ElgamalVerificationKey) = {
        genkey(&mut thread_rng())
    };
    static ref SERVER_PK_MAP: std::sync::RwLock<HashMap<Address, IBEPublicKey>> =
        std::sync::RwLock::new(HashMap::new());
}

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
        "suix_getLatestSuiSystemState",
        serde_json::json!([]),
    )
    .await?;
    let current_epoch: u64 = sys_state["epoch"]
        .as_str()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    // ── Query new OrderSubmitted events ─────────────────────────────
    // queryEvents signature: (query, cursor, limit, descending_order: bool)
    let query_params = serde_json::json!([
        { "MoveEventType": ORDER_SUBMITTED_EVENT },
        cursor,
        50,
        false
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

/// Parse a Move `vector<u8>` field from a Sui RPC `content.fields` blob.
/// Returns lowercase hex (no `0x` prefix). Accepts either:
///   - a JSON string (already hex), or
///   - a JSON array of numbers (raw bytes).
fn parse_bytes_field(v: &serde_json::Value, name: &str) -> Result<String, EnclaveError> {
    if let Some(s) = v.as_str() {
        return Ok(s.strip_prefix("0x").unwrap_or(s).to_string());
    }
    if let Some(arr) = v.as_array() {
        let mut bytes: Vec<u8> = Vec::with_capacity(arr.len());
        for n in arr {
            let b = n
                .as_u64()
                .ok_or_else(|| EnclaveError::GenericError(format!("{name}: non-numeric byte")))?;
            if b > 255 {
                return Err(EnclaveError::GenericError(format!("{name}: byte > 255")));
            }
            bytes.push(b as u8);
        }
        return Ok(Hex::encode(bytes));
    }
    Err(EnclaveError::GenericError(format!("missing {name}")))
}

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
    let sealed_envelope = parse_bytes_field(&content["sealed_envelope"], "sealed_envelope")?;
    let commit_hash = parse_bytes_field(&content["commit_hash"], "commit_hash")?;

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
    let raw_seal_bytes = &envelope_bytes[32..];

    // BCS-decode the EncryptedObject the trader's SDK produced.
    let encrypted_object: EncryptedObject = bcs::from_bytes(raw_seal_bytes)
        .map_err(|e| EnclaveError::GenericError(format!("EncryptedObject decode: {e}")))?;

    // Ensure we have the Seal key server's IBE pubkey cached.
    ensure_server_pubkey(http).await?;

    // Build PTB: shell::shell::seal_approve(id, &Enclave<SHELL>, ctx)
    let enclave_shared_version = fetch_initial_shared_version(http, ENCLAVE_ID).await?;
    let ptb = build_seal_approve_ptb(&seal_id, enclave_shared_version)?;

    // Per-request session keypair (TS SDK calls these "session keys").
    let session_kp = Ed25519KeyPair::generate(&mut thread_rng());
    let session_vk = session_kp.public().clone();
    let creation_time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| EnclaveError::GenericError(format!("clock: {e}")))?
        .as_millis() as u64;

    // The enclave's signing key doubles as its Sui wallet. seal_approve
    // checks ctx.sender() == enclave_address(enclave) — so the cert user
    // must be the same address derived from this keypair.
    // `.private()` consumes, but state.eph_kp lives in an Arc. `.copy()` from
    // the KeyPair trait clones it; then we take the secret bytes off the copy.
    let secret_bytes: [u8; 32] = state
        .eph_kp
        .copy()
        .private()
        .as_ref()
        .try_into()
        .map_err(|_| EnclaveError::GenericError("eph_kp secret wrong size".into()))?;
    let wallet = Ed25519PrivateKey::new(secret_bytes);

    let message = signed_message(
        SHELL_PACKAGE_ID.to_string(),
        &session_vk,
        creation_time,
        SEAL_CERT_TTL_MIN,
    );
    let signature = wallet
        .sign_personal_message(&PersonalMessage(message.as_bytes().into()))
        .map_err(|e| EnclaveError::GenericError(format!("sign cert: {e}")))?;

    let certificate = Certificate {
        user: wallet.public_key().derive_address(),
        session_vk,
        creation_time,
        ttl_min: SEAL_CERT_TTL_MIN,
        signature,
        mvr_name: None,
    };

    let (enc_secret, enc_key, enc_verification_key) = &*ENCRYPTION_KEYS;

    let request_message = signed_request(&ptb, enc_key, enc_verification_key);
    let request_signature = session_kp.sign(&request_message);

    let fetch_request = FetchKeyRequest {
        ptb: Base64::encode(
            bcs::to_bytes(&ptb)
                .map_err(|e| EnclaveError::GenericError(format!("ptb bcs: {e}")))?,
        ),
        enc_key: enc_key.clone(),
        enc_verification_key: enc_verification_key.clone(),
        request_signature,
        certificate,
    };

    let body = fetch_request
        .to_json_string()
        .map_err(|e| EnclaveError::GenericError(format!("request json: {e}")))?;

    let resp = http
        .post(format!("{SEAL_AGGREGATOR}/v1/fetch_key"))
        .header("Content-Type", "application/json")
        .header("Client-Sdk-Type", "rust")
        .header("Client-Sdk-Version", "0.1.0")
        .body(body)
        .send()
        .await
        .map_err(|e| EnclaveError::GenericError(format!("fetch_key http: {e}")))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(EnclaveError::GenericError(format!(
            "fetch_key {status}: {text}"
        )));
    }

    let fetch_response: FetchKeyResponse = resp
        .json()
        .await
        .map_err(|e| EnclaveError::GenericError(format!("fetch_key parse: {e}")))?;

    let server_id = Address::from_str(SEAL_TESTNET_KEY_SERVER)
        .map_err(|e| EnclaveError::GenericError(format!("server id: {e}")))?;

    let server_pk_map = SERVER_PK_MAP.read().unwrap().clone();
    let cached_keys =
        decrypt_seal_responses(enc_secret, &[(server_id, fetch_response)], &server_pk_map)
            .map_err(|e| EnclaveError::GenericError(format!("decrypt responses: {e}")))?;

    let plaintext_bytes = seal_decrypt_object(&encrypted_object, &cached_keys, &server_pk_map)
        .map_err(|e| EnclaveError::GenericError(format!("seal_decrypt: {e}")))?;

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
        .header("Client-Sdk-Type", "rust")
        .header("Client-Sdk-Version", "0.1.0")
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

    // 1. Resolve collateral types from the local order book.
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

    let maker_order_hex = format!("0x{}", Hex::encode(&payload.maker_order));
    let taker_order_hex = format!("0x{}", Hex::encode(&payload.taker_order));
    let sig_bytes: Vec<u8> = Hex::decode(sig_hex)
        .map_err(|e| EnclaveError::GenericError(format!("sig hex: {e}")))?;

    // 2. Sender = the enclave's own Sui address (derived from eph_kp).
    let enclave_addr_str = enclave_sui_address(state);
    let sender = Address::from_str(&enclave_addr_str)
        .map_err(|e| EnclaveError::GenericError(format!("sender addr: {e}")))?;

    // 3. Look up the initial_shared_version for every shared input.
    let enclave_isv = fetch_initial_shared_version(http, ENCLAVE_ID).await?;
    let maker_isv = fetch_initial_shared_version(http, &maker_order_hex).await?;
    let taker_isv = fetch_initial_shared_version(http, &taker_order_hex).await?;
    let pool_isv = fetch_initial_shared_version(http, DEEPBOOK_SUI_DBUSDC_POOL).await?;

    // 4. Fetch a DEEP coin (for DeepBook swap fees) owned by the enclave.
    let deep_ref = fetch_deep_coin(http, &enclave_addr_str).await?;

    // 5. Build the ProgrammableTransaction.
    let ptb = build_settle_ptb(
        enclave_isv,
        maker_isv,
        taker_isv,
        pool_isv,
        deep_ref,
        timestamp_ms,
        payload,
        &sig_bytes,
        &maker_type,
        &taker_type,
        &maker_order_hex,
        &taker_order_hex,
    )?;

    // 6. Fetch a gas coin owned by the enclave + current RGP.
    let gas_ref = fetch_gas_coin(http, &enclave_addr_str).await?;
    let rgp = fetch_reference_gas_price(http).await?;

    // 6. Assemble the Transaction.
    let tx = Transaction {
        kind: TransactionKind::ProgrammableTransaction(ptb),
        sender,
        gas_payment: GasPayment {
            objects: vec![gas_ref],
            owner: sender,
            price: rgp,
            budget: 50_000_000,
        },
        expiration: TransactionExpiration::None,
    };

    // 7. Sign — SuiSigner handles the IntentMessage wrapping + blake2b hash.
    let secret_bytes: [u8; 32] = state
        .eph_kp
        .copy()
        .private()
        .as_ref()
        .try_into()
        .map_err(|_| EnclaveError::GenericError("eph_kp secret wrong size".into()))?;
    let wallet = Ed25519PrivateKey::new(secret_bytes);
    let user_sig = wallet
        .sign_transaction(&tx)
        .map_err(|e| EnclaveError::GenericError(format!("sign tx: {e}")))?;

    // 8. BCS-serialize the transaction and submit.
    let tx_bytes = bcs::to_bytes(&tx)
        .map_err(|e| EnclaveError::GenericError(format!("tx bcs: {e}")))?;

    let result = sui_rpc(
        http,
        "sui_executeTransactionBlock",
        serde_json::json!([
            Base64::encode(&tx_bytes),
            [user_sig.to_base64()],
            { "showEffects": true },
            "WaitForLocalExecution"
        ]),
    )
    .await?;

    let status = result["effects"]["status"]["status"]
        .as_str()
        .unwrap_or("unknown");
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

fn pure_bcs<T: ?Sized + serde::Serialize>(
    v: &T,
    label: &str,
) -> Result<Input, EnclaveError> {
    let bytes = bcs::to_bytes(v)
        .map_err(|e| EnclaveError::GenericError(format!("{label} bcs: {e}")))?;
    Ok(Input::Pure { value: bytes })
}

#[allow(clippy::too_many_arguments)]
fn build_settle_ptb(
    enclave_isv: u64,
    maker_isv: u64,
    taker_isv: u64,
    pool_isv: u64,
    deep_ref: ObjectReference,
    timestamp_ms: u64,
    payload: &MatchPayload,
    signature: &[u8],
    base_type: &str,
    quote_type: &str,
    maker_order_hex: &str,
    taker_order_hex: &str,
) -> Result<ProgrammableTransaction, EnclaveError> {
    let pkg = Address::from_str(SHELL_PACKAGE_ID)
        .map_err(|e| EnclaveError::GenericError(format!("pkg id: {e}")))?;
    let enclave_obj = Address::from_str(ENCLAVE_ID)
        .map_err(|e| EnclaveError::GenericError(format!("enclave id: {e}")))?;
    let maker_obj = Address::from_str(maker_order_hex)
        .map_err(|e| EnclaveError::GenericError(format!("maker obj id: {e}")))?;
    let taker_obj = Address::from_str(taker_order_hex)
        .map_err(|e| EnclaveError::GenericError(format!("taker obj id: {e}")))?;
    let pool_obj = Address::from_str(DEEPBOOK_SUI_DBUSDC_POOL)
        .map_err(|e| EnclaveError::GenericError(format!("pool id: {e}")))?;
    let clock_obj = Address::from_str(SUI_CLOCK_OBJECT_ID)
        .map_err(|e| EnclaveError::GenericError(format!("clock id: {e}")))?;
    let maker_addr = Address::new(payload.maker);
    let taker_addr = Address::new(payload.taker);

    // Argument indices below MUST stay in sync with the MoveCalls.
    //  0  Enclave<SHELL>            (shared, imm)  → verify
    //  1  timestamp_ms              (pure u64)     → verify
    //  2  maker                     (pure addr)    → verify
    //  3  taker                     (pure addr)    → verify
    //  4  maker_order_id            (pure ID)      → verify
    //  5  taker_order_id            (pure ID)      → verify
    //  6  filled_size               (pure u64)     → verify
    //  7  filled_price              (pure u64)     → verify
    //  8  deepbook_tx_digest        (pure vec<u8>) → verify
    //  9  signature                 (pure vec<u8>) → verify
    // 10  maker_order               (shared mut)   → settle
    // 11  taker_order               (shared mut)   → settle
    // 12  pool                      (shared mut)   → settle
    // 13  deep_in                   (owned coin)   → settle
    // 14  slippage_bps              (pure u64)     → settle
    // 15  clock                     (shared imm)   → settle
    let inputs = vec![
        Input::Shared {
            object_id: enclave_obj,
            initial_shared_version: enclave_isv,
            mutable: false,
        },
        pure_bcs(&timestamp_ms, "timestamp_ms")?,
        pure_bcs(&maker_addr, "maker")?,
        pure_bcs(&taker_addr, "taker")?,
        pure_bcs(&maker_obj, "maker_order_id")?,
        pure_bcs(&taker_obj, "taker_order_id")?,
        pure_bcs(&payload.filled_size, "filled_size")?,
        pure_bcs(&payload.filled_price, "filled_price")?,
        pure_bcs(&payload.deepbook_tx_digest, "deepbook_tx_digest")?,
        pure_bcs(&signature.to_vec(), "signature")?,
        Input::Shared {
            object_id: maker_obj,
            initial_shared_version: maker_isv,
            mutable: true,
        },
        Input::Shared {
            object_id: taker_obj,
            initial_shared_version: taker_isv,
            mutable: true,
        },
        Input::Shared {
            object_id: pool_obj,
            initial_shared_version: pool_isv,
            mutable: true,
        },
        Input::ImmutableOrOwned(deep_ref),
        pure_bcs(&DEFAULT_SLIPPAGE_BPS, "slippage_bps")?,
        Input::Shared {
            object_id: clock_obj,
            initial_shared_version: SUI_CLOCK_INITIAL_SHARED_VERSION,
            mutable: false,
        },
    ];

    let verify_call = MoveCall {
        package: pkg,
        module: Identifier::new("attestation")
            .map_err(|e| EnclaveError::GenericError(format!("module: {e}")))?,
        function: Identifier::new("verify")
            .map_err(|e| EnclaveError::GenericError(format!("function: {e}")))?,
        type_arguments: vec![],
        arguments: (0..10).map(Argument::Input).collect(),
    };
    let settle_call = MoveCall {
        package: pkg,
        module: Identifier::new("settlement")
            .map_err(|e| EnclaveError::GenericError(format!("module: {e}")))?,
        function: Identifier::new("settle")
            .map_err(|e| EnclaveError::GenericError(format!("function: {e}")))?,
        type_arguments: vec![
            TypeTag::from_str(base_type)
                .map_err(|e| EnclaveError::GenericError(format!("base_type: {e}")))?,
            TypeTag::from_str(quote_type)
                .map_err(|e| EnclaveError::GenericError(format!("quote_type: {e}")))?,
        ],
        arguments: vec![
            Argument::Result(0),  // MatchInstruction
            Argument::Input(10),  // maker_order
            Argument::Input(11),  // taker_order
            Argument::Input(12),  // pool
            Argument::Input(13),  // deep_in
            Argument::Input(14),  // slippage_bps
            Argument::Input(15),  // clock
        ],
    };

    Ok(ProgrammableTransaction {
        inputs,
        commands: vec![
            Command::MoveCall(verify_call),
            Command::MoveCall(settle_call),
        ],
    })
}

async fn fetch_gas_coin(
    http: &reqwest::Client,
    owner: &str,
) -> Result<ObjectReference, EnclaveError> {
    fetch_first_coin(http, owner, "0x2::sui::SUI").await
}

async fn fetch_deep_coin(
    http: &reqwest::Client,
    owner: &str,
) -> Result<ObjectReference, EnclaveError> {
    fetch_first_coin(http, owner, DEEP_COIN_TYPE).await
}

async fn fetch_first_coin(
    http: &reqwest::Client,
    owner: &str,
    coin_type: &str,
) -> Result<ObjectReference, EnclaveError> {
    let result = sui_rpc(
        http,
        "suix_getCoins",
        serde_json::json!([owner, coin_type, null, 1]),
    )
    .await?;
    let coin = result["data"]
        .as_array()
        .and_then(|a| a.first())
        .ok_or_else(|| {
            EnclaveError::GenericError(format!("no {coin_type} coin for {owner}"))
        })?;
    let id = coin["coinObjectId"]
        .as_str()
        .ok_or_else(|| EnclaveError::GenericError("coin: missing coinObjectId".into()))?;
    let version_str = coin["version"]
        .as_str()
        .ok_or_else(|| EnclaveError::GenericError("coin: missing version".into()))?;
    let digest_b58 = coin["digest"]
        .as_str()
        .ok_or_else(|| EnclaveError::GenericError("coin: missing digest".into()))?;
    let version: u64 = version_str
        .parse()
        .map_err(|e| EnclaveError::GenericError(format!("coin version: {e}")))?;
    let object_id = Address::from_str(id)
        .map_err(|e| EnclaveError::GenericError(format!("coin id: {e}")))?;
    let digest = Digest::from_base58(digest_b58)
        .map_err(|e| EnclaveError::GenericError(format!("coin digest: {e}")))?;
    Ok(ObjectReference::new(object_id, version, digest))
}

async fn fetch_reference_gas_price(http: &reqwest::Client) -> Result<u64, EnclaveError> {
    let result = sui_rpc(http, "suix_getReferenceGasPrice", serde_json::json!([])).await?;
    result
        .as_str()
        .and_then(|s| s.parse().ok())
        .or_else(|| result.as_u64())
        .ok_or_else(|| EnclaveError::GenericError("rgp: missing".into()))
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

/// Construct the PTB the Seal aggregator dry-runs to authorise key release:
/// `shell::shell::seal_approve(id, &Enclave<SHELL>, ctx)`.
fn build_seal_approve_ptb(
    seal_id: &[u8; 32],
    enclave_shared_version: u64,
) -> Result<ProgrammableTransaction, EnclaveError> {
    let pkg = Address::from_str(SHELL_PACKAGE_ID)
        .map_err(|e| EnclaveError::GenericError(format!("pkg id: {e}")))?;
    let enclave_obj = Address::from_str(ENCLAVE_ID)
        .map_err(|e| EnclaveError::GenericError(format!("enclave id: {e}")))?;

    let id_input = Input::Pure {
        value: bcs::to_bytes(&seal_id.to_vec())
            .map_err(|e| EnclaveError::GenericError(format!("id bcs: {e}")))?,
    };
    let enclave_input = Input::Shared {
        object_id: enclave_obj,
        initial_shared_version: enclave_shared_version,
        mutable: false,
    };

    let module = Identifier::new("shell")
        .map_err(|e| EnclaveError::GenericError(format!("module ident: {e}")))?;
    let function = Identifier::new("seal_approve")
        .map_err(|e| EnclaveError::GenericError(format!("function ident: {e}")))?;

    let move_call = MoveCall {
        package: pkg,
        module,
        function,
        type_arguments: vec![],
        arguments: vec![Argument::Input(0), Argument::Input(1)],
    };

    Ok(ProgrammableTransaction {
        inputs: vec![id_input, enclave_input],
        commands: vec![Command::MoveCall(move_call)],
    })
}

/// Fetch a shared object's `initial_shared_version` from Sui RPC. Required
/// to build a PTB that passes the shared object as an input.
async fn fetch_initial_shared_version(
    http: &reqwest::Client,
    object_id: &str,
) -> Result<u64, EnclaveError> {
    let result = sui_rpc(
        http,
        "sui_getObject",
        serde_json::json!([object_id, { "showOwner": true }]),
    )
    .await?;

    let raw = &result["data"]["owner"]["Shared"]["initial_shared_version"];
    let v = raw
        .as_u64()
        .or_else(|| raw.as_str().and_then(|s| s.parse().ok()))
        .ok_or_else(|| {
            EnclaveError::GenericError(format!(
                "initial_shared_version not found for {object_id}"
            ))
        })?;
    Ok(v)
}

/// Idempotent: fetches and caches the Seal key server's IBE public key from
/// its on-chain KeyServer object. Needed by `decrypt_seal_responses` and
/// `seal_decrypt_object` to verify per-server shares.
async fn ensure_server_pubkey(http: &reqwest::Client) -> Result<(), EnclaveError> {
    if !SERVER_PK_MAP.read().unwrap().is_empty() {
        return Ok(());
    }

    // Parent KeyServer object only carries `first_version` / `last_version`.
    // The actual per-version `KeyServerVN { pk, .. }` lives in a dynamic field
    // keyed by `u64` (the version). Walk dynamic fields → pick the one whose
    // objectType matches `key_server::KeyServerV*`, then read its `pk`.
    let dyn_fields = sui_rpc(
        http,
        "suix_getDynamicFields",
        serde_json::json!([SEAL_TESTNET_KEY_SERVER]),
    )
    .await?;

    let entries = dyn_fields["data"]
        .as_array()
        .ok_or_else(|| EnclaveError::GenericError("KeyServer dyn fields: no data".into()))?;
    let child_id = entries
        .iter()
        .find(|f| {
            f["objectType"]
                .as_str()
                .map(|t| t.contains("::key_server::KeyServerV"))
                .unwrap_or(false)
        })
        .and_then(|f| f["objectId"].as_str())
        .ok_or_else(|| EnclaveError::GenericError("KeyServer: no KeyServerV* child".into()))?
        .to_string();

    let child = sui_rpc(
        http,
        "sui_getObject",
        serde_json::json!([child_id, { "showContent": true }]),
    )
    .await?;

    let pk_hex = parse_bytes_field(
        &child["data"]["content"]["fields"]["value"]["fields"]["pk"],
        "KeyServerV*.pk",
    )?;
    let pk_bytes = Hex::decode(&pk_hex)
        .map_err(|e| EnclaveError::GenericError(format!("KeyServer pk hex: {e}")))?;
    let pk: IBEPublicKey = bcs::from_bytes(&pk_bytes)
        .map_err(|e| EnclaveError::GenericError(format!("KeyServer pk bcs: {e}")))?;

    let server_id = Address::from_str(SEAL_TESTNET_KEY_SERVER)
        .map_err(|e| EnclaveError::GenericError(format!("server id: {e}")))?;

    SERVER_PK_MAP.write().unwrap().insert(server_id, pk);
    Ok(())
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
