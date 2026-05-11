use crate::match_payload::{MatchPayload, SuiBytes};
use crate::order::{OrderPlaintext, Side};

/// An order after decryption inside the enclave: identifier, owner, and
/// the BCS plaintext the trader sealed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecryptedOrder {
    pub order_id: SuiBytes,
    pub trader: SuiBytes,
    pub plaintext: OrderPlaintext,
}

/// Price-time-priority matcher. v1 emits whole-fill matches only —
/// when bid size and ask size differ, the smaller side is skipped and
/// considered for later windows.
///
/// "Maker" is the order with the lower submission index (earlier order)
/// among the two that cross. The fill price is the maker's limit.
pub fn match_orders(orders: &[DecryptedOrder]) -> Vec<MatchPayload> {
    let mut bids: Vec<(usize, &DecryptedOrder)> = orders
        .iter()
        .enumerate()
        .filter(|(_, o)| matches!(o.plaintext.side, Side::Buy))
        .collect();
    let mut asks: Vec<(usize, &DecryptedOrder)> = orders
        .iter()
        .enumerate()
        .filter(|(_, o)| matches!(o.plaintext.side, Side::Sell))
        .collect();

    bids.sort_by(|a, b| {
        b.1.plaintext
            .limit_price
            .cmp(&a.1.plaintext.limit_price)
            .then(a.0.cmp(&b.0))
    });
    asks.sort_by(|a, b| {
        a.1.plaintext
            .limit_price
            .cmp(&b.1.plaintext.limit_price)
            .then(a.0.cmp(&b.0))
    });

    let mut fills = Vec::new();
    let mut bi = 0usize;
    let mut ai = 0usize;

    while bi < bids.len() && ai < asks.len() {
        let (b_idx, bid) = bids[bi];
        let (a_idx, ask) = asks[ai];

        if bid.plaintext.limit_price < ask.plaintext.limit_price {
            break;
        }

        if bid.plaintext.size != ask.plaintext.size {
            // Whole-fill-only; advance the smaller side.
            if bid.plaintext.size > ask.plaintext.size {
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
            filled_size: bid.plaintext.size,
            filled_price: maker.plaintext.limit_price,
            deepbook_tx_digest: vec![],
        });

        bi += 1;
        ai += 1;
    }

    fills
}

#[cfg(test)]
mod tests {
    use super::*;

    fn order(idx: u8, trader_tag: u8, side: Side, size: u64, price: u64) -> DecryptedOrder {
        DecryptedOrder {
            order_id: [idx; 32],
            trader: [trader_tag; 32],
            plaintext: OrderPlaintext {
                side,
                size,
                limit_price: price,
                expiry_epoch: 100,
                max_slippage_bps: 50,
            },
        }
    }

    #[test]
    fn crossing_pair_produces_one_match() {
        let orders = vec![
            order(1, 0xAA, Side::Buy, 100, 12_500),
            order(2, 0xBB, Side::Sell, 100, 12_400),
        ];
        let fills = match_orders(&orders);
        assert_eq!(fills.len(), 1);
        assert_eq!(fills[0].filled_size, 100);
        // Maker is the bid (submitted first) so the fill price is the bid limit.
        assert_eq!(fills[0].filled_price, 12_500);
        assert_eq!(fills[0].maker, [0xAA; 32]);
        assert_eq!(fills[0].taker, [0xBB; 32]);
    }

    #[test]
    fn non_crossing_produces_no_match() {
        let orders = vec![
            order(1, 0xAA, Side::Buy, 100, 12_300),
            order(2, 0xBB, Side::Sell, 100, 12_400),
        ];
        assert!(match_orders(&orders).is_empty());
    }

    #[test]
    fn best_bid_matches_best_ask_first() {
        // Submission order intentionally interleaved; matcher should sort
        // by price-priority before pairing.
        let orders = vec![
            order(1, 0x11, Side::Buy, 50, 115),  // idx 0, second-best bid
            order(2, 0x22, Side::Sell, 50, 110), // idx 1, second-best ask
            order(3, 0x33, Side::Buy, 50, 120),  // idx 2, best bid
            order(4, 0x44, Side::Sell, 50, 95),  // idx 3, best ask
        ];
        let fills = match_orders(&orders);
        assert_eq!(fills.len(), 2);

        // First match: best bid (120, idx 2) vs best ask (95, idx 3).
        // Maker = bid (lower submission index), so fill_price = 120.
        assert_eq!(fills[0].maker_order, [3; 32]);
        assert_eq!(fills[0].taker_order, [4; 32]);
        assert_eq!(fills[0].filled_price, 120);

        // Remaining: bid 115 (idx 0) vs ask 110 (idx 1). Crosses.
        // Maker = bid (idx 0 < idx 1), fill_price = 115.
        assert_eq!(fills[1].maker_order, [1; 32]);
        assert_eq!(fills[1].taker_order, [2; 32]);
        assert_eq!(fills[1].filled_price, 115);
    }

    #[test]
    fn mismatched_sizes_skipped_smaller_side_first() {
        let orders = vec![
            order(1, 0xAA, Side::Buy, 100, 12_500),
            order(2, 0xBB, Side::Sell, 60, 12_400),
        ];
        assert!(match_orders(&orders).is_empty());
    }

    #[test]
    fn maker_is_earlier_submission() {
        // Ask submitted before the crossing bid: ask is maker.
        let orders = vec![
            order(1, 0xAA, Side::Sell, 100, 12_400),
            order(2, 0xBB, Side::Buy, 100, 12_500),
        ];
        let fills = match_orders(&orders);
        assert_eq!(fills.len(), 1);
        assert_eq!(fills[0].maker, [0xAA; 32]);
        assert_eq!(fills[0].filled_price, 12_400);
    }
}
