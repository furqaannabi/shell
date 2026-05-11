//! Shell Finance matching enclave: BCS-mirrored types + Ed25519 signer.
//!
//! The structs in [`order`] and [`match_payload`] mirror the on-chain
//! Move definitions byte-for-byte under BCS. The Move side
//! (`shell::attestation::verify`) re-builds a `MatchPayload` from
//! caller-supplied arguments, BCS-encodes it inside an `IntentMessage`
//! envelope, and Ed25519-verifies it against the registered enclave
//! pubkey — so anything we sign here must produce the same byte stream
//! that Move reconstructs there.

pub mod match_payload;
pub mod order;
pub mod signer;

pub use match_payload::{IntentMessage, MATCH_INTENT, MatchPayload, SuiBytes};
pub use order::{OrderPlaintext, Side};
pub use signer::{EnclaveSigner, SignedMatch, verify_signed_match};
