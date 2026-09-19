# Security, Compliance & Economic Risk Architecture
## Monad B2B2C Vendor-Paid Queue & Booking Platform

This document outlines critical operational, legal, and economic considerations for moving the Vendor-Paid, User-Free Monad Queue Platform to production with real funds.

---

## 1. Smart Contract Auditing & Security Invariants

Before mainnet deployment or accepting real customer deposits:
- **Formal Verification & External Audit**: A dual-firm security audit focusing on:
  - **Reentrancy on Withdrawal**: Strict adherence to Checks-Effects-Interactions pattern and `nonReentrant` mutexes during `withdrawUnusedBalance` and `withdrawPlatformFees`.
  - **Accounting Invariants**: Sum of all active vendor balances + accumulated platform treasury must always be $\le$ the total contract native MON balance (`address(this).balance`).
  - **EIP-712 Replay Protection**: Nonce progression (`userNonces[claimant]++`) ensures signatures cannot be replayed across transactions or reorgs. Domain separator binds chainId (`10143` for testnet, `143` for mainnet) and verifying contract address.
- **Monad-Specific Gas Dynamics**:
  - Monad charges transactions based on `gas_limit`, not `gas_used`.
  - Excessive estimation buffers waste real MON.
  - Cold storage access costs (8,100 gas for storage, 10,100 for accounts) require optimized struct packing and memory caching.
  - `ecrecover` precompile costs 6,000 gas (2x Ethereum).

---

## 2. Gas-Sponsorship & Relayer Cost Exposure

When offering gasless claims to end users via meta-transactions (`claimSlotWithSig`):
- **Economic Drainage Risk**: A griefing attacker could generate thousands of ephemeral keys, sign valid claim requests, and broadcast them through the relayer. If the relayer pays the L1/L2 gas unconditionally, the platform or vendor treasury will be drained.
- **Defensive Safeguards**:
  1. **Per-Vendor Gas Caps**: Impose an hourly/daily maximum gas subsidy funded out of the vendor's deposited balance. If the vendor's balance or daily allocation is exhausted, meta-transactions must be rejected before submitting onchain.
  2. **Sybil & Bot Deterrence**: Integrate CAPTCHA or proof-of-humanity / Passkey / email authentication (e.g., via Para embedded auth) before the relayer accepts a signature for dispatch.
  3. **Rate Limiting by IP and Subnet**: Relayer API must enforce token-bucket rate limits (e.g., max 5 claims per minute per IP).
  4. **Dynamic Fee Adjustments**: In periods of base fee spikes on Monad, the relayer should either throttle gasless claims or request the user switch to direct wallet transaction.

---

## 3. Legal Review & Terms of Service (ToS)

- **Vendor Terms of Service**:
  - Explicit terms regarding prepaid credit expiration, service SLA, platform uptime, and forfeiture of abandoned accounts.
  - Clarification that credits deposited to the smart contract represent pre-funded software execution rights and not bank deposits or interest-bearing instruments.
- **Refund Policies**:
  - Clear policies governing vendor credit withdrawals and potential platform clawbacks for disputed credit-card or fiat onramp deposits.
- **Consumer Protections**:
  - Disclaimer to end users that free ticket claims do not constitute a financial investment or guarantee admission if the venue cancels the event.
  - GDPR/CCPA compliance regarding offchain attendee metadata, email addresses, and phone numbers stored offchain.
