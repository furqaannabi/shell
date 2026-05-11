use serde::{Deserialize, Serialize};

/// 32-byte Sui address or ObjectID. BCS-encodes as raw bytes (no length prefix).
pub type SuiBytes = [u8; 32];

/// Intent tag the Move side (`shell::attestation::MATCH_INTENT`) requires.
pub const MATCH_INTENT: u8 = 0;

/// BCS layout mirrors `shell::attestation::MatchPayload`. Field order is
/// load-bearing — the Move and Rust definitions must stay in lockstep.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MatchPayload {
    pub maker: SuiBytes,
    pub taker: SuiBytes,
    pub maker_order: SuiBytes,
    pub taker_order: SuiBytes,
    pub filled_size: u64,
    pub filled_price: u64,
    pub deepbook_tx_digest: Vec<u8>,
}

/// BCS layout mirrors `enclave::enclave::IntentMessage<P>` from the
/// upstream nautilus Move package. The struct the enclave actually signs
/// (before BCS-encoding) is always wrapped in this envelope.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct IntentMessage<P> {
    pub intent: u8,
    pub timestamp_ms: u64,
    pub payload: P,
}

impl<P> IntentMessage<P> {
    pub fn new(intent: u8, timestamp_ms: u64, payload: P) -> Self {
        Self {
            intent,
            timestamp_ms,
            payload,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn match_payload_round_trip() {
        let payload = MatchPayload {
            maker: [0xAA; 32],
            taker: [0xBB; 32],
            maker_order: [0xCC; 32],
            taker_order: [0xDD; 32],
            filled_size: 1_000,
            filled_price: 12_500,
            deepbook_tx_digest: b"db-tx-digest".to_vec(),
        };
        let bytes = bcs::to_bytes(&payload).unwrap();
        let decoded: MatchPayload = bcs::from_bytes(&bytes).unwrap();
        assert_eq!(payload, decoded);
    }

    #[test]
    fn intent_envelope_layout_matches_enclave_test_serde() {
        // Reproduces the test vector pinned in `enclave::enclave::test_serde`
        // upstream, swapping its SigningPayload for a small inline struct
        // to prove our IntentMessage<T> BCS framing is byte-identical.
        #[derive(Serialize)]
        struct SigningPayload<'a> {
            location: &'a str,
            temperature: u64,
        }

        let envelope = IntentMessage::new(
            0u8,
            1_744_038_900_000u64,
            SigningPayload {
                location: "San Francisco",
                temperature: 13,
            },
        );
        let bytes = bcs::to_bytes(&envelope).unwrap();
        assert_eq!(
            hex::encode(&bytes),
            "0020b1d110960100000d53616e204672616e636973636f0d00000000000000",
        );
    }
}
