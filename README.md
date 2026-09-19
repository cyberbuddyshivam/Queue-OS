# Queue-OS

> **Plug-and-Play B2B2C Booking & High-Throughput Queue Infrastructure on Monad**  
> Built with **[MONSKILLS](https://skills.devnads.com)**.

[![Monad Testnet](https://img.shields.io/badge/Network-Monad%20Testnet%20(10143)-8B75FF?style=for-the-badge&logo=ethereum)](https://testnet.monadscan.com/address/0x6cCaC1BCEd3C6DEd7e11246723276d6B3eaf480F)
[![Smart Contract](https://img.shields.io/badge/Contract-0x6cCaC1...480F-00F5D4?style=for-the-badge)](https://testnet.monadscan.com/address/0x6cCaC1BCEd3C6DEd7e11246723276d6B3eaf480F)
[![License: MIT](https://img.shields.io/badge/License-MIT-FEE75C?style=for-the-badge)](LICENSE)

Queue-OS is a decentralized, high-throughput booking and queue management platform where **vendors** (businesses, event organizers, hospitals, service providers) fund capacity through onchain subscriptions or prepaid credits, while **end users** claim queue slots and digital tickets at **zero cost** (0 MON value transfer).

---

## ⚡ Overview

In hospitals, service venues, and high-demand product drops, traditional queue systems are opaque and vulnerable:
- **Corrupt Priority & Line-Jumping**: Opaque digital queuing allows VIPs or paying elites to skip ordinary attendees without accountability.
- **Single-Point-of-Failure Outages**: High-concurrency drops crash centralized booking servers.
- **End-User Friction**: Requiring users to hold native tokens and pay gas just to reserve a slot prevents mass adoption.

### The Queue-OS Architecture
Queue-OS solves this with a **Vendor-Paid, User-Free (B2B2C)** model leveraging Monad's 10,000 TPS and 400ms block times:
1. **Vendor Capacity Funding**: Vendors sponsor their queues onchain through metered **Prepaid Credits** (debited strictly per user claim) or flat **Monthly Subscriptions**.
2. **Zero-Cost User Claiming**: Users book slots for 0 MON with cryptographic FIFO order guaranteed by smart contracts.
3. **Turnkey Gatekeeper Redemption**: Onchain QR ticket passes verified and redeemed with 1 click; double-entry and reused tickets are rejected onchain.

---

## 📡 Live Monad Testnet Deployment

| Parameter | Value |
|:---|:---|
| **Network** | Monad Testnet |
| **Chain ID** | `10143` |
| **RPC Endpoint** | `https://testnet-rpc.monad.xyz` |
| **Contract Name** | `MonadQueuePlatform` |
| **Contract Address** | [`0x6cCaC1BCEd3C6DEd7e11246723276d6B3eaf480F`](https://testnet.monadscan.com/address/0x6cCaC1BCEd3C6DEd7e11246723276d6B3eaf480F) |
| **Block Explorer** | [testnet.monadscan.com](https://testnet.monadscan.com/address/0x6cCaC1BCEd3C6DEd7e11246723276d6B3eaf480F) |
| **Live Web Application** | [QueueOS Web3 Link](https://queue-os-delta.vercel.app/) |
| **X** | [X Post Link](https://x.com/shivam_1110_/status/2101283159795265670) |
| **LinkedIn** | [LinkedIn Post Link](https://lnkd.in/p/dMKcsb9u) |
| **Instagram** | [Creative Ad Instagram Post Link](https://www.instagram.com/reel/DdeER5DITi-/?stkn=N214dDFzNm9nODRx) |
| **Instagram** | [Demo Video on Instagram](https://www.instagram.com/reel/DdeEwZ_oGaT/?stkn=cWJlYTJvMjJ1anA4) |

---

## 🛠️ Technology Stack

| Layer | Technology | Role / Purpose |
|:---|:---|:---|
| **Blockchain** | **Monad Testnet (EVM L1)** | High-throughput (10,000 TPS, 400ms blocks, sub-second finality) |
| **Smart Contracts** | **Solidity `^0.8.28`** | Core protocol (`MonadQueuePlatform.sol`), EIP-712 typed data, reentrancy guards |
| **Contract Tooling** | **Foundry / Solc** | Local compilation, deployment, and testing suite |
| **Web3 Client** | **Ethers.js v6 (Standalone Bundle)** | Contract interactions, direct JsonRpcProvider reading, MetaMask signing |
| **Frontend UI** | **HTML5, CSS3, JavaScript (ES6+)** | Neubrutalism design system, responsive tabs, dynamic QR pass renderer |
| **Server** | **Node.js HTTP Server** | Lightweight local static asset server |

---

## 🚀 Key Features

### 1. 🏢 Vendor Portal
- **Flexible Billing**: Onboard with Prepaid Credits (0.001 MON metered per user claim) or Recurring Subscription (0.05 MON / 30 days unlimited).
- **Queue Provisioning**: Create customized queues with capacity limits, active time windows, slot durations, and rich IPFS metadata.
- **Credit Management**: Top up prepaid balance, upgrade to subscription, or withdraw unused funds at any time.
- **Scanner Delegation**: Authorize designated staff wallet addresses to scan and redeem tickets.

### 2. 🎟️ Free User Booking Portal
- **Zero-Cost Booking**: Claim verified queue slots with 0 MON value transfer.
- **Verifiable Pass Generation**: Instant digital pass issuance featuring position number, dynamic QR code, and onchain verification hash.
- **1-Click Scanner Transfer**: Send ticket tokens directly into the Gatekeeper Scanner with one click.

### 3. 📱 Gatekeeper Scanner
- **Live Authorization Verification**: Automatically validates whether the connected wallet is the queue vendor or authorized scanner before executing check-in.
- **Simulation Preflight**: Pre-tests redemptions via `staticCall` to prevent unexpected reverts and gas waste.
- **Audit Logging**: Real-time onchain redemption log tracking attendee check-ins and timestamps.

---

## 💻 How to Run the Project

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or newer)
- A Web3 wallet (e.g. [MetaMask](https://metamask.io/) or Rabby) connected to **Monad Testnet**

### 1. Clone & Install
```bash
# Clone repository
git clone https://github.com/cyberbuddyshivam/Queue-OS.git
cd Queue-OS

# Install dependencies
npm install
```

### 2. Run Local Web Server
```bash
npm start
```
Navigate to **`http://localhost:3000/`** in your browser.

> **Alternative (Zero Install):** You can also open `web/index.html` directly in any web browser. All Web3 dependencies (`ethers.umd.min.js`, contract ABI, and client bundle) are packaged locally.

---

## 📁 Repository Structure

```text
├── contracts/
│   ├── src/
│   │   └── MonadQueuePlatform.sol   # Core queue platform smart contract
│   ├── test/
│   │   ├── MonadQueuePlatform.t.sol # Foundry unit tests
│   │   └── test_invariants.ps1      # Automated 15-rule protocol invariant test suite
│   └── out_compiled.json            # Compiled contract artifacts (ABI & Bytecode)
│
├── web/
│   ├── index.html                   # Responsive Web3 application shell
│   ├── styles.css                   # Neubrutalism design system styling
│   ├── app.bundle.js                # Full client application bundle
│   ├── contractAbi.js               # Exported contract ABI and network parameters
│   └── ethers.umd.min.js            # Standalone Ethers.js v6 library
│
├── compile.js                       # Standalone Solidity compiler script
├── deploy.js                        # Monad Testnet deployment runner
├── server.js                        # Node.js local HTTP server
├── index.html                       # Root redirect for static hosting
├── verify.json                      # Explorer verification payload
└── README.md                        # Project documentation
```

---

## 🧪 Testing & Invariant Validation

The platform includes an automated invariant test suite verifying all 15 core protocol safety invariants:

```powershell
powershell -ExecutionPolicy Bypass -File .\contracts\test\test_invariants.ps1
```

### Validated Protocol Invariants (15/15 Passed):
- [x] **Balance-Gating**: Prevents queue creation if vendor balance is insufficient.
- [x] **Usage Metering Integrity**: Debits vendor balance by exact `feePerClaim` and credits platform treasury.
- [x] **Double-Claim Prevention**: Blocks duplicate claims by the same address on the same queue.
- [x] **Capacity Ceilings**: Rejects claims once maximum capacity is reached.
- [x] **Scanner Authorization**: Restricts ticket redemption strictly to authorized scanners, vendor, or owner.
- [x] **Anti-Double Redemption**: Blocks multiple check-ins on already redeemed tickets.
- [x] **Vendor Fund Safety**: Guarantees vendors can only withdraw their own unused balance.
- [x] **Low-Balance Alerts**: Emits `VendorBalanceLow` when vendor credits fall below threshold.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
