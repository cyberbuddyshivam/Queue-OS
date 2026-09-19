# Queue-OS: Vendor-Paid, User-Free Booking & Queue Platform on Monad

> **Plug-and-Play B2B2C Booking Infrastructure on Monad Testnet (Chain ID `10143`)**  
> Built with **[MONSKILLS](https://skills.devnads.com)**.

Queue-OS is a decentralized, high-throughput booking and queue management platform where **vendors** (businesses, event organizers, service providers) fund capacity through onchain subscriptions or prepaid credits, while **end users** claim slots and join queues at **zero cost** with **gasless EIP-712 meta-transactions**.

---

## ⚡ Why Monad?

- **10,000 TPS & 400ms Block Times**: Accommodates massive concurrency during flash booking drops without network congestion.
- **Sub-Second Finality (800ms)**: Instant confirmation of queue position and digital passes.
- **Gas Optimization**: Monad charges gas based on `gas_limit`, not `gas_used`. Contracts are optimized with tight gas bounds and cached memory reads to counter cold storage SLOAD pricing (8,100 gas).

---

## 🏗️ Architecture: Onchain vs. Offchain

| Layer | Components | Details |
|---|---|---|
| **Onchain** | Vendor Balances & Plans | Prepaid usage credits (debited per claim) or 30-day recurring subscriptions. |
| | Queue Inventory | Capacity, time windows, slot durations, balance gating. |
| | Slot Claims & Tickets | Double-claim prevention, sequential slot index, 0 MON value transfer. |
| | Gasless Claims | EIP-712 typed signature verification (`claimSlotWithSig`). |
| | Check-ins & Redemptions | Venue scanner validation (`checkIn` & `checkInWithSig`). |
| **Offchain** | Rich Metadata | IPFS/HTTPS URLs for logos, banners, event descriptions, and venue FAQs. |
| | Indexer | Envio HyperIndex tracking lifecycle events for dashboards. |

---

## 📡 Live Monad Testnet Deployment

| Parameter | Value |
|---|---|
| **Contract Name** | `MonadQueuePlatform` |
| **Network** | Monad Testnet |
| **Chain ID** | `10143` |
| **Contract Address** | [`0x6cCaC1BCEd3C6DEd7e11246723276d6B3eaf480F`](https://testnet.monadscan.com/address/0x6cCaC1BCEd3C6DEd7e11246723276d6B3eaf480F) |
| **RPC Endpoint** | `https://testnet-rpc.monad.xyz` |
| **Block Explorer** | [testnet.monadscan.com](https://testnet.monadscan.com/address/0x6cCaC1BCEd3C6DEd7e11246723276d6B3eaf480F) |

---

## 📁 Project Structure

```text
├── .monskills                  # Provenance metadata (built-with=monskills, chain=monad-testnet)
├── SECURITY_AND_COMPLIANCE.md  # Legal, audit & gas sponsorship risk analysis
├── verify.json                 # Monad verification API payload (https://agents.devnads.com/v1/verify)
│
├── contracts/                  # Smart Contracts & Testing
│   ├── src/
│   │   └── MonadQueuePlatform.sol   # Core platform contract
│   ├── test/
│   │   ├── MonadQueuePlatform.t.sol # Foundry unit test suite
│   │   └── test_invariants.ps1      # Self-contained invariant test suite (15/15 passed)
│   ├── script/
│   │   └── Deploy.s.sol             # Monad deployment script
│   └── foundry.toml                 # Foundry configuration for Monad testnet
│
├── web/                        # High-Aesthetic Web Application
│   ├── index.html                   # Interactive single-page application shell
│   ├── styles.css                   # Custom dark glassmorphism design system
│   ├── app.bundle.js                # Standalone client bundle (runs via HTTP or file://)
│   ├── app.js                       # ES-module client logic
│   └── contractAbi.js               # ABI and Monad Testnet constants
│
└── indexer/                    # Envio HyperIndex Configuration
    ├── config.yaml                  # Monad Testnet event subscription
    ├── schema.graphql               # Relational entity schema
    └── src/
        └── EventHandlers.ts         # TypeScript event processors
```

---

## 🧪 Testing & Verification

### 1. Invariant Test Suite (Automated, Zero Dependencies)
Run the self-contained invariant verification runner in PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\contracts\test\test_invariants.ps1
```

**Validated Invariants (15/15 Passed)**:
- [x] **Balance-Gating**: Reverts queue creation if vendor balance is 0.
- [x] **Usage-Metering Accuracy**: Debits vendor balance by exact `feePerClaim` (0.001 MON) and credits platform treasury.
- [x] **Double-Claim Prevention**: Rejects duplicate claims by the same user address on the same queue.
- [x] **Capacity Enforcements**: Enforces queue slot ceilings.
- [x] **Vendor Withdrawal Controls**: Restricts withdrawals to vendor owners and prevents overdrawing.
- [x] **Check-in Authorization**: Rejects unauthorized scanners and blocks double redemptions.
- [x] **Low-Balance Alerts**: Emits `VendorBalanceLow` when vendor credits fall below 0.003 MON.

### 2. Foundry Unit Tests (Native)
```bash
cd contracts
forge test -v
```

---

## 🚀 Running the Web Interface

You can view the interactive platform in three ways:

1. **Instant Browser Open (No Server Needed)**:
   Double-click `web/index.html` or open it directly in Chrome/Edge/Brave.
2. **Local Web Server**:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\web_server.ps1
   ```
   Navigate to `http://localhost:3000/`.

---

## 🔒 Security & Compliance Note

Any real-funds vendor billing requires independent security audits, legal review of vendor Terms of Service / SLAs, and defensive rate-limiting against gas-sponsorship economic exhaustion. See [SECURITY_AND_COMPLIANCE.md](SECURITY_AND_COMPLIANCE.md) for details.

---

## 📄 License
MIT License. Built for the Monad Blitz Hackathon.
