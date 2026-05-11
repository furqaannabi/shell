use serde::{Deserialize, Serialize};

/// BCS layout mirrors `OrderPlaintextBcs` in [`@shell-finance/sdk`].
/// Field order is load-bearing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct OrderPlaintext {
    pub side: Side,
    pub size: u64,
    pub limit_price: u64,
    pub expiry_epoch: u64,
    pub max_slippage_bps: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(into = "u8", try_from = "u8")]
pub enum Side {
    Buy,
    Sell,
}

impl From<Side> for u8 {
    fn from(s: Side) -> Self {
        match s {
            Side::Buy => 0,
            Side::Sell => 1,
        }
    }
}

impl TryFrom<u8> for Side {
    type Error = SideError;
    fn try_from(v: u8) -> Result<Self, Self::Error> {
        match v {
            0 => Ok(Side::Buy),
            1 => Ok(Side::Sell),
            _ => Err(SideError::UnknownTag(v)),
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum SideError {
    #[error("unknown Side tag: {0}")]
    UnknownTag(u8),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bcs_round_trip() {
        let order = OrderPlaintext {
            side: Side::Buy,
            size: 1_000,
            limit_price: 12_500,
            expiry_epoch: 1101,
            max_slippage_bps: 50,
        };
        let bytes = bcs::to_bytes(&order).unwrap();
        let decoded: OrderPlaintext = bcs::from_bytes(&bytes).unwrap();
        assert_eq!(order, decoded);
    }

    #[test]
    fn bcs_matches_ts_sdk_layout() {
        // Hand-computed reference vector to lock the wire format.
        // side=0(buy) || size=1u64 LE || price=2u64 LE || expiry=3u64 LE || slip=4u32 LE
        let order = OrderPlaintext {
            side: Side::Buy,
            size: 1,
            limit_price: 2,
            expiry_epoch: 3,
            max_slippage_bps: 4,
        };
        let bytes = bcs::to_bytes(&order).unwrap();
        assert_eq!(
            hex::encode(&bytes),
            "00\
             0100000000000000\
             0200000000000000\
             0300000000000000\
             04000000"
                .replace(['\n', ' '], "")
        );
    }
}
