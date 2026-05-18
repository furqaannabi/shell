// Copyright (c), Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

use anyhow::Result;
use axum::{routing::get, routing::post, Router};
use fastcrypto::{
    ed25519::Ed25519KeyPair,
    encoding::{Encoding, Hex},
    traits::{KeyPair, ToFromBytes},
};
use nautilus_server::app::process_data;
use nautilus_server::common::{get_attestation, health_check};
use nautilus_server::AppState;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tracing::info;

#[tokio::main]
async fn main() -> Result<()> {
    // Derive eph_kp from `ENCLAVE_KEY_SEED` (32-byte hex, pushed via the
    // host secrets blob) so the enclave's signing identity survives
    // reboots and the on-chain `Enclave<T>` registration stays valid. Falls
    // back to a fresh random keypair when the seed is unset, preserving the
    // original demo-app behavior.
    let eph_kp = match std::env::var("ENCLAVE_KEY_SEED") {
        Ok(hex) => {
            let bytes = Hex::decode(hex.strip_prefix("0x").unwrap_or(&hex))
                .map_err(|e| anyhow::anyhow!("ENCLAVE_KEY_SEED hex decode: {e}"))?;
            if bytes.len() != 32 {
                return Err(anyhow::anyhow!(
                    "ENCLAVE_KEY_SEED must be 32 bytes, got {}",
                    bytes.len()
                ));
            }
            Ed25519KeyPair::from_bytes(&bytes)
                .map_err(|e| anyhow::anyhow!("ENCLAVE_KEY_SEED → keypair: {e}"))?
        }
        Err(_) => Ed25519KeyPair::generate(&mut rand::thread_rng()),
    };
    info!(
        "enclave pubkey: 0x{}",
        Hex::encode(eph_kp.public().as_bytes())
    );

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

    // Spawn the Shell autonomous chain-watching task.
    #[cfg(feature = "shell")]
    {
        nautilus_server::app::start_poller(state.clone());
    }

    // Define your own restricted CORS policy here if needed.
    let cors = CorsLayer::new().allow_methods(Any).allow_headers(Any);

    let app = Router::new()
        .route("/", get(ping))
        .route("/get_attestation", get(get_attestation))
        .route("/process_data", post(process_data))
        .route("/health_check", get(health_check))
        .with_state(state)
        .layer(cors);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await?;
    info!("listening on {}", listener.local_addr().unwrap());
    axum::serve(listener, app.into_make_service())
        .await
        .map_err(|e| anyhow::anyhow!("Server error: {e}"))
}

async fn ping() -> &'static str {
    "Pong!"
}
