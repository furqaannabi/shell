// Copyright (c), Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

use anyhow::Result;
use axum::{routing::get, routing::post, Router};
use fastcrypto::ed25519::Ed25519KeyPair;
use fastcrypto::encoding::{Encoding, Hex};
use fastcrypto::traits::{KeyPair, ToFromBytes};
use nautilus_server::app::process_data;
#[cfg(feature = "shell")]
use nautilus_server::app::shell_status;
use nautilus_server::common::{get_attestation, health_check};
use nautilus_server::AppState;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tracing::info;

#[tokio::main]
async fn main() -> Result<()> {
    // Persistent eph_kp via host-managed seed.
    //
    // expose_enclave.sh reads /home/ec2-user/enclave-seed.hex on the host
    // and pushes it (along with SHELL_ENCLAVE_ID + API_KEY) into the
    // enclave's environment over a one-shot VSOCK secrets blob. Reading
    // ENCLAVE_KEY_SEED here means the enclave's Ed25519 identity — and
    // therefore the on-chain `Enclave<SHELL>.pk` registration — survives
    // reboots without a fresh `register_enclave` call.
    //
    // Falls back to a fresh random key if the env var is absent (e.g.
    // local dev runs). Operators MUST re-register on chain whenever they
    // boot without the seed.
    let eph_kp = match std::env::var("ENCLAVE_KEY_SEED").ok() {
        Some(seed_hex) if !seed_hex.is_empty() => {
            let bytes = Hex::decode(seed_hex.trim())
                .map_err(|e| anyhow::anyhow!("ENCLAVE_KEY_SEED hex decode: {e}"))?;
            if bytes.len() != 32 {
                return Err(anyhow::anyhow!(
                    "ENCLAVE_KEY_SEED must be 32 bytes, got {}",
                    bytes.len()
                ));
            }
            Ed25519KeyPair::from_bytes(&bytes)
                .map_err(|e| anyhow::anyhow!("Ed25519KeyPair::from_bytes: {e}"))?
        }
        _ => {
            eprintln!(
                "[main] ENCLAVE_KEY_SEED not set; generating random eph_kp (re-register on chain after boot)"
            );
            Ed25519KeyPair::generate(&mut rand::thread_rng())
        }
    };

    // This API_KEY value can be stored with secret-manager. To do that, follow the prompt `sh configure_enclave.sh`
    // Answer `y` to `Do you want to use a secret?` and finish. Otherwise, uncomment this code to use a hardcoded value.
    // let api_key = "045a27812dbe456392913223221306".to_string();
    #[cfg(not(feature = "seal-example"))]
    let api_key = std::env::var("API_KEY").expect("API_KEY must be set");

    // NOTE: if built with `seal-example` flag the `process_data` does not use this api_key from AppState, instead
    // it uses SEAL_API_KEY initialized with two phase bootstrap. Modify this as needed for your application.
    #[cfg(feature = "seal-example")]
    let api_key = String::new();

    // Build ShellState (order book + HTTP client) for the autonomous matcher
    // when the `shell` feature is enabled. The constructor is on the app side
    // so DecryptedOrder stays private inside the shell module.
    #[cfg(feature = "shell")]
    let shell = nautilus_server::app::ShellState::new();

    let state = Arc::new(AppState {
        eph_kp,
        api_key,
        #[cfg(feature = "shell")]
        shell,
    });

    // Spawn host-only init server if seal-example feature is enabled
    #[cfg(feature = "seal-example")]
    {
        nautilus_server::app::spawn_host_init_server(state.clone()).await?;
    }

    // Spawn the Shell autonomous chain-watching tasks: the order
    // poller (settles matched pairs once both sides land on chain) and
    // the IOI matcher (decrypts off-chain IOIs and emits MatchProposed).
    // Both are wrapped in `spawn_supervised` inside their fn bodies, so
    // a panic restarts the inner loop instead of silently killing the
    // task while the HTTP server keeps serving.
    #[cfg(feature = "shell")]
    {
        nautilus_server::app::start_poller(state.clone());
        nautilus_server::app::start_ioi_matcher(state.clone());
    }

    // Define your own restricted CORS policy here if needed.
    let cors = CorsLayer::new().allow_methods(Any).allow_headers(Any);

    let app = Router::new()
        .route("/", get(ping))
        .route("/get_attestation", get(get_attestation))
        .route("/process_data", post(process_data))
        .route("/health_check", get(health_check));
    #[cfg(feature = "shell")]
    let app = app.route("/shell/status", get(shell_status));
    let app = app.with_state(state).layer(cors);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await?;
    info!("listening on {}", listener.local_addr().unwrap());
    axum::serve(listener, app.into_make_service())
        .await
        .map_err(|e| anyhow::anyhow!("Server error: {e}"))
}

async fn ping() -> &'static str {
    "Pong!"
}
