# Queue-OS: Vendor-Paid, User-Free Queue & Booking Platform on Monad

[![Monad Testnet](https://img.shields.io/badge/Network-Monad%20Testnet%20(10143)-8B75FF?style=for-the-badge&logo=ethereum)](https://testnet.monadscan.com/address/0x6cCaC1BCEd3C6DEd7e11246723276d6B3eaf480F)
[![Smart Contract](https://img.shields.io/badge/Contract-0x6cCaC1...480F-00F5D4?style=for-the-badge)](https://testnet.monadscan.com/address/0x6cCaC1BCEd3C6DEd7e11246723276d6B3eaf480F)
[![License: MIT](https://img.shields.io/badge/License-MIT-FEE75C?style=for-the-badge)](LICENSE)
[![Built with Monskills](https://img.shields.io/badge/Built%20with-MONSKILLS-FF5C5C?style=for-the-badge)](https://skills.devnads.com)

> **Plug-and-Play Decentralized Booking Infrastructure for Real-World Venues, Hospitals & Events.**  
> Built for the **Monad Blitz Hackathon**.

---

## 📢 Pitch Essentials (Say All Four Out Loud During Demo)

| Evaluation Criteria | Official Submission Detail | Quick Link |
|:---|:---|:---|
| **1. Public GitHub Repo** | `https://github.com/cyberbuddyshivam/Queue-OS` | [GitHub Repository](https://github.com/cyberbuddyshivam/Queue-OS) |
| **2. Contract Address** | `0x6cCaC1BCEd3C6DEd7e11246723276d6B3eaf480F` | [MonadScan Explorer](https://testnet.monadscan.com/address/0x6cCaC1BCEd3C6DEd7e11246723276d6B3eaf480F) |
| **3. Live Public URL** | `https://cyberbuddyshivam.github.io/Queue-OS/` | [Live Web3 App](https://cyberbuddyshivam.github.io/Queue-OS/) |
| **4. Deployment Target** | Monad Testnet (Chain ID `10143`, 10,000 TPS, 400ms blocks) | `https://testnet-rpc.monad.xyz` |

---

## ⚡ The Problem: Opaque Queues & Corrupt Priority

In hospitals, government offices, and high-demand product drops, traditional digital queuing systems are black boxes. Behind the scenes:
- Ordinary patients are pushed back in line while VIPs or paying elites jump ahead without transparency.
- Centralized queue servers crash during flash drops, causing lost reservations and bot abuse.
- End users are forced to pay high gas fees just to hold a reservation token.

### 💡 The Solution: Queue-OS
**Queue-OS** is an open, tamper-proof, plug-and-play queue protocol powered by Monad's 10,000 TPS and 400ms finality:
1. **Vendor-Paid, User-Free (B2B2C)**: Businesses and hospitals sponsor capacity via onchain prepaid credits or monthly subscriptions. End users claim slots with **0 MON value transfer**.
2. **Mathematical Queue Integrity**: Queue order is immutable, verifiable, and strictly First-In, First-Out (FIFO). Nobody can secretly reorder or skip positions.
3. **Turnkey Gatekeeper Redemption**: Staff redeem QR passes onchain with 1 click; double-check-ins and duplicate entries are mathematically prevented by the smart contract.

---

## 🚀 60-Second Quickstart (Run Without Setup)

Anyone can run and test Queue-OS locally in under 60 seconds with zero blockchain tooling required:

### Option A: Direct Local Server (Recommended)
```bash
# 1. Clone the repository
git clone https://github.com/cyberbuddyshivam/Queue-OS.git
cd Queue-OS

# 2. Install lightweight dependencies
npm install

# 3. Start local server
npm start
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

### Option B: Instant Offline Open (Zero Installation)
Simply double-click `web/index.html` in your file explorer. All Web3 dependencies (`ethers.umd.min.js`, ABI, and standalone bundle) are packed locally!

---

## 🎮 Interactive Live Demo Walkthrough

### 1. 🏢 Vendor Portal
- **Onboarding & Billing**: Vendors register with either **Prepaid Credits** (pay-per-claim metered micro-debits at 0.001 MON/claim) or **Unlimited Monthly Subscription** (0.05 MON / 30 days).
- **Queue Provisioning**: Define title, capacity limit, booking time windows, metadata URI, and slot duration.
- **Staff Delegation**: Grant and revoke scanning permissions to venue staff addresses.

### 2. 🎟️ Free User Booking Portal
- **Zero Cost Booking**: End users browse active public queues and claim slots for **0 MON transfer**.
- **Proof-of-Queue Pass**: Automatically issues a verified digital ticket pass with slot position, dynamic QR token, and direct MonadScan transaction proof.
- **1-Click Scanner Transfer**: Click `📱 Open in Gatekeeper Scanner` directly from the ticket card to instantly populate ticket tokens in the gatekeeper interface.

### 3. 📱 Gatekeeper Scanner
- **Live Permission Checking**: Live status indicator automatically verifies if the connected wallet is the queue vendor, authorized staff, or platform owner before execution.
- **Preflight Static Simulation**: Emulates redemption before sending to avoid unnecessary gas usage and rate-limiting.
- **Immutable Ticket Burn**: Marks tickets redeemed onchain, emits `UserCheckedIn`, and updates the live audit ledger in real-time.

---

## 💎 Rubric Highlights & Bonus Criteria

### 🎯 Pre-Market Fit & Target Customers (Up to 20 Bonus Points)
Queue-OS solves acute, multi-billion-dollar physical and digital bottleneck problems:
- **Public & Private Healthcare**: Outpatient departments (OPD) and diagnostic centers can publish transparent queue counters, giving patients guaranteed time slots and stopping corrupt VIP line jumping.
- **Hackathon & Event Credentialing**: Monad Blitz, Devcon, and global conferences can distribute gasless attendee badges and swag queue slots with zero Sybil friction.
- **Government Agencies & DMVs**: Citizen service centers provide verified onchain queue tickets, rebuilding public trust.
- **High-Demand E-Commerce & Sneaker Drops**: Brands eliminate bot scalping and ensure verifiable FIFO purchasing turns.

### 💰 Revenue Potential & Monetization Strategy (Up to 20 Bonus Points)
Queue-OS operates an enterprise B2B SaaS business model:
1. **Metered Micro-Billing**: Platform charges `0.001 MON` per claimed slot, automatically debited from the vendor's prepaid treasury.
2. **Enterprise Recurring Subscriptions**: `0.05 MON / month` flat subscription for high-throughput venues hosting unlimited queues.
3. **White-Label SDK Licensing**: Ready-to-embed JavaScript widget allowing any Web2 hospital ERP or ticketing portal to plug into Monad queue verification with 3 lines of code.

### 🔬 Innovation & Monad-Native Engineering (Up to 20 Bonus Points)
- **Monad Execution Model Optimization**: Passes explicit `gasLimit` parameters to eliminate client-side `eth_estimateGas` binary search loops.
- **Dedicated Direct RPC Architecture**: Segregates read-only RPC traffic from wallet signing traffic to prevent browser rate-limit locks (-32005).
- **Cold Storage Access Optimization**: Minimizes Monad cold `SLOAD` penalties (8,100 gas) by packing struct variables (`uint32 capacity`, `uint32 claimedCount`, `uint64 startTime`, `uint64 endTime`).

---

## 🏗️ Architecture & Technology Stack

```text
┌────────────────────────────────────────────────────────┐
│                   Queue-OS Platform                    │
├───────────────────────────┬────────────────────────────┤
│       Web3 Frontend       │      Smart Contracts       │
│  - Vanilla HTML5 / CSS3   │  - MonadQueuePlatform.sol  │
│  - Neubrutalism Design    │  - EIP-712 Typed Signing   │
│  - Ethers.js v6           │  - Role-Based Scanner Auth │
│  - Pure Static Bundle     │  - Usage Metering Logic    │
├───────────────────────────┴────────────────────────────┤
│                Monad High-Throughput L1                │
│       400ms Block Time  │  10,000 TPS  │  Chain 10143   │
└────────────────────────────────────────────────────────┘
```

---

## 🧪 Testing & Invariant Validation

Queue-OS contains a comprehensive automated invariant test suite verifying all 15 core protocol safety rules:

```powershell
# Run the automated invariant test runner:
powershell -ExecutionPolicy Bypass -File .\contracts\test\test_invariants.ps1
```

### Validated Protocol Invariants (15/15 Passed):
- [x] **Balance-Gating**: Prevents queue creation if vendor balance is insufficient.
- [x] **Usage Metering Integrity**: Debits vendor balance by exact `feePerClaim` and credits platform treasury.
- [x] **Double-Claim Prevention**: Blocks duplicate claims by the same address on the same queue.
- [x] **Strict Capacity Ceilings**: Rejects claims when queue capacity is filled.
- [x] **Unauthorized Scanner Rejection**: Restricts `checkIn` strictly to queue vendor, authorized scanner, or contract owner.
- [x] **Anti-Double Redemption**: Blocks multiple check-ins on already redeemed tickets.
- [x] **Vendor Fund Safety**: Guarantees vendors can only withdraw their own unused balance.
- [x] **Low-Balance Alerts**: Emits `VendorBalanceLow` when vendor credits fall below threshold.

---

## 📄 License & Hackathon Attribution

Built for the **Monad Blitz Hackathon** using **[MONSKILLS](https://skills.devnads.com)**.  
Released under the [MIT License](LICENSE).
