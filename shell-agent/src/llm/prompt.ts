import type { MatchProposal } from "../proposals.js";

/** Build the system prompt for a proposal-evaluation decision. The
 *  prompt nudges the LLM to call relevant tools before deciding and
 *  pins the final response shape so the loop can parse it. */
export function buildSystemPrompt(opts: {
  address: string;
  policy: string;
  side: "buy" | "sell";
  toolsAvailable: boolean;
}): string {
  const toolNote = opts.toolsAvailable
    ? "\nYou have access to tools listed below. Before deciding, you SHOULD call relevant tools to verify the trade fits your policy (e.g. check ref price, your balance, your risk cap, recent fills). Do not invent data — call a tool if you need a fact." +
      "\nCall get_ref_price({asset}) with this proposal's asset. If the source is 'fixed' (NAV stub), treat the price as exact NAV — reject only if agreed_price deviates by more than 0.5%." +
      "\nCollateral side: BUY deposits QUOTE coin (size × price), SELL deposits BASE coin (size). Check the right balance against the right requirement — wrong-side checks lead to InsufficientCoinBalance failures on submit."
    : "";
  return (
    `You are a Shell Finance trading agent.\n` +
    `Your address: ${opts.address}.\n` +
    `Your side on this proposal: ${opts.side}.\n` +
    `Your policy: ${opts.policy}.\n` +
    toolNote +
    `\n\nWhen you have enough information, respond with ONLY a JSON object:\n` +
    `  { "decision": "accept_match" | "reject_match" | "wait",\n` +
    `    "reasoning": string,\n` +
    `    "policy_check": boolean }\n` +
    `Set policy_check=true only if the decision provably stays within the\n` +
    `declared policy (having actually checked it via tools when applicable).`
  );
}

/** Format the user-message describing a proposal for the LLM. */
export function buildUserMessage(p: MatchProposal): string {
  const priceUsdc = Number(p.agreedPrice) / 1e6;   // e.g. 1.000000 USDC
  const sizeSui   = Number(p.agreedSize)  / 1e9;   // e.g. 0.150000 SUI
  const collateralUsdc = (sizeSui * priceUsdc).toFixed(6);
  const priceFmt = priceUsdc.toFixed(6);
  const sizeFmt  = sizeSui.toFixed(6);
  return (
    `Match proposal (your side = ${p.side}):\n` +
    `  asset:             ${p.asset}\n` +
    `  agreed_price:      ${p.agreedPrice} raw  = ${priceFmt} USDC\n` +
    `  agreed_size:       ${p.agreedSize} raw  = ${sizeFmt} SUI\n` +
    `  collateral_needed: ${collateralUsdc} USDC (size × price, for balance check)\n` +
    `  counterparty:      ${p.side === "buy" ? p.sellAgent : p.buyAgent}\n` +
    `  expiry_ms:         ${p.expiryMs}\n` +
    `If calling check_risk_cap, pass proposed_size_sui=${sizeFmt}.\n` +
    `Decide.`
  );
}
