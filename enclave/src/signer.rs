use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use rand::RngCore;
use rand::rngs::OsRng;
use serde::Serialize;

use crate::match_payload::{IntentMessage, MATCH_INTENT, MatchPayload};

/// Long-lived signing key owned by the matching enclave. In a real
/// deployment this is generated *inside* the AWS Nitro enclave at boot
/// and never leaves the encrypted memory enclosure.
pub struct EnclaveSigner {
    signing: SigningKey,
}

impl EnclaveSigner {
    pub fn generate() -> Self {
        let mut secret = [0u8; 32];
        OsRng.fill_bytes(&mut secret);
        Self {
            signing: SigningKey::from_bytes(&secret),
        }
    }

    pub fn from_bytes(secret: &[u8; 32]) -> Self {
        Self {
            signing: SigningKey::from_bytes(secret),
        }
    }

    pub fn public_key(&self) -> VerifyingKey {
        self.signing.verifying_key()
    }

    pub fn public_key_bytes(&self) -> [u8; 32] {
        self.signing.verifying_key().to_bytes()
    }

    /// Sign a match. Returns the raw signature bytes — the Move side
    /// (`shell::attestation::verify`) accepts this directly as the
    /// `signature` argument.
    pub fn sign_match(&self, payload: MatchPayload, timestamp_ms: u64) -> SignedMatch {
        let envelope = IntentMessage::new(MATCH_INTENT, timestamp_ms, payload);
        let bytes = bcs::to_bytes(&envelope).expect("BCS encoding cannot fail for fixed types");
        let sig: Signature = self.signing.sign(&bytes);
        SignedMatch {
            envelope,
            signature: sig.to_bytes(),
        }
    }
}

#[derive(Debug)]
pub struct SignedMatch {
    pub envelope: IntentMessage<MatchPayload>,
    pub signature: [u8; 64],
}

impl SignedMatch {
    /// Convenience: reproduce the bytes the enclave signed.
    pub fn signed_bytes(&self) -> Vec<u8> {
        bcs_to_bytes(&self.envelope)
    }
}

/// Verify an enclave-signed match against a public key. Mirrors the
/// Move-side check that lives inside `enclave::verify_signature`.
pub fn verify_signed_match(pk: &VerifyingKey, signed: &SignedMatch) -> bool {
    let bytes = bcs_to_bytes(&signed.envelope);
    let Ok(sig) = Signature::from_slice(&signed.signature) else {
        return false;
    };
    pk.verify(&bytes, &sig).is_ok()
}

fn bcs_to_bytes<T: Serialize>(value: &T) -> Vec<u8> {
    bcs::to_bytes(value).expect("BCS encoding cannot fail for fixed types")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn payload() -> MatchPayload {
        MatchPayload {
            maker: [0xAA; 32],
            taker: [0xBB; 32],
            maker_order: [0xCC; 32],
            taker_order: [0xDD; 32],
            filled_size: 100,
            filled_price: 2_500,
            deepbook_tx_digest: vec![],
        }
    }

    #[test]
    fn sign_then_verify_succeeds() {
        let signer = EnclaveSigner::generate();
        let signed = signer.sign_match(payload(), 1_750_000_000_000);
        assert!(verify_signed_match(&signer.public_key(), &signed));
    }

    #[test]
    fn tampered_payload_fails_verification() {
        let signer = EnclaveSigner::generate();
        let mut signed = signer.sign_match(payload(), 1_750_000_000_000);
        signed.envelope.payload.filled_price += 1;
        assert!(!verify_signed_match(&signer.public_key(), &signed));
    }

    #[test]
    fn wrong_pubkey_fails_verification() {
        let a = EnclaveSigner::generate();
        let b = EnclaveSigner::generate();
        let signed = a.sign_match(payload(), 1_750_000_000_000);
        assert!(!verify_signed_match(&b.public_key(), &signed));
    }
}
