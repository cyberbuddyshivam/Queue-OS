// MonadQueue - High Performance Vendor-Paid Queue Platform Logic
import { CONTRACT_ADDRESS, CONTRACT_ABI, MONAD_TESTNET_CHAIN_ID, MONAD_TESTNET_RPC } from './contractAbi.js';

// --- State Management ---
const state = {
  walletConnected: false,
  userAddress: '0x71C...4e92',
  isVendor: true,
  vendor: {
    address: '0x71C...4e92',
    planType: 0, // 0: Prepaid, 1: Subscription
    balance: 0.250, // in MON
    subscriptionExpiresAt: Date.now() + 30 * 24 * 3600 * 1000,
    isActive: true,
    totalQueuesCreated: 3,
    totalSlotsIssued: 142,
    totalCheckIns: 121
  },
  queues: [
    {
      id: 1,
      vendor: '0x71C...4e92',
      title: 'Monad Blitz Hackathon Demo Day Pass',
      metadataURI: 'ipfs://bafybeic73q...demo',
      capacity: 200,
      claimedCount: 142,
      checkedInCount: 121,
      startTime: Date.now() - 3600000,
      endTime: Date.now() + 86400000 * 3,
      slotDurationSec: 0,
      isActive: true,
      feePerClaim: 0.001
    },
    {
      id: 2,
      vendor: '0x71C...4e92',
      title: 'EVM Performance Workshop (Limited)',
      metadataURI: 'ipfs://bafybeic73q...workshop',
      capacity: 50,
      claimedCount: 48,
      checkedInCount: 30,
      startTime: Date.now() - 1800000,
      endTime: Date.now() + 86400000 * 2,
      slotDurationSec: 900,
      isActive: true,
      feePerClaim: 0.001
    },
    {
      id: 3,
      vendor: '0x8b3...1a4f',
      title: 'Exclusive Monad Founders VIP Lounge',
      metadataURI: 'ipfs://bafybeic73q...lounge',
      capacity: 30,
      claimedCount: 12,
      checkedInCount: 8,
      startTime: Date.now() - 7200000,
      endTime: Date.now() + 86400000 * 4,
      slotDurationSec: 0,
      isActive: true,
      feePerClaim: 0.002
    }
  ],
  myTickets: [
    {
      ticketId: 101,
      queueId: 1,
      queueTitle: 'Monad Blitz Hackathon Demo Day Pass',
      slotIndex: 14,
      claimedAt: Date.now() - 7200000,
      checkedIn: false,
      checkedInAt: 0
    }
  ],
  checkinFeed: [
    {
      ticketId: 99,
      queueTitle: 'Monad Blitz Demo Day',
      claimant: '0x43b...88f1',
      redeemedAt: 'Just now',
      scanner: '0x71C...4e92',
      status: 'Verified'
    },
    {
      ticketId: 98,
      queueTitle: 'Monad Blitz Demo Day',
      claimant: '0x99a...32c4',
      redeemedAt: '2 mins ago',
      scanner: '0x71C...4e92',
      status: 'Verified'
    },
    {
      ticketId: 45,
      queueTitle: 'EVM Workshop',
      claimant: '0x12f...ee90',
      redeemedAt: '5 mins ago',
      scanner: '0x71C...4e92',
      status: 'Verified'
    }
  ]
};

// --- Toast System ---
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : '⚠️';
  toast.innerHTML = `
    <span>${icon}</span>
    <span style="font-size: 0.85rem; color: #FFF;">${message}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// --- Navigation Tabs ---
function setupTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabPanels.forEach(panel => panel.classList.remove('active'));

      button.classList.add('active');
      const targetId = button.getAttribute('data-target');
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) {
        targetPanel.classList.add('active');
      }
    });
  });
}

// --- Render Vendor Dashboard ---
function renderVendorDashboard() {
  const balanceDisplay = document.getElementById('vendor-balance-display');
  const planDisplay = document.getElementById('vendor-plan-display');
  const lowBalAlert = document.getElementById('low-balance-alert');
  const balAlertVal = document.getElementById('alert-balance-val');
  const tbody = document.getElementById('vendor-queues-tbody');
  const queueCount = document.getElementById('vendor-queue-count');

  if (balanceDisplay) {
    balanceDisplay.textContent = `${state.vendor.balance.toFixed(4)} MON`;
  }
  if (planDisplay) {
    planDisplay.textContent = state.vendor.planType === 0 ? 'Prepaid Credits' : 'Subscription';
  }

  // Low balance threshold: < 0.003 MON
  if (lowBalAlert) {
    if (state.vendor.balance < 0.005) {
      lowBalAlert.style.display = 'flex';
      balAlertVal.textContent = state.vendor.balance.toFixed(4);
    } else {
      lowBalAlert.style.display = 'none';
    }
  }

  if (tbody) {
    tbody.innerHTML = '';
    const vendorQueues = state.queues.filter(q => q.vendor.toLowerCase() === state.userAddress.toLowerCase() || true);
    queueCount.textContent = `Showing ${vendorQueues.length} queues`;

    vendorQueues.forEach(q => {
      const tr = document.createElement('tr');
      const percent = Math.round((q.claimedCount / q.capacity) * 100);
      tr.innerHTML = `
        <td style="font-family: var(--font-mono); font-weight: 600; color: var(--accent-cyan);">#${q.id}</td>
        <td>
          <div style="font-weight: 600; color: #FFF;">${q.title}</div>
          <div style="font-size: 0.7rem; font-family: var(--font-mono); color: var(--text-dim);">${q.metadataURI}</div>
        </td>
        <td>
          <div>${q.claimedCount} / ${q.capacity} (${percent}%)</div>
          <div class="progress-bar-bg" style="height: 4px; margin-top: 4px;">
            <div class="progress-bar-fill" style="width: ${percent}%;"></div>
          </div>
        </td>
        <td style="font-family: var(--font-mono); color: var(--accent-purple);">${q.checkedInCount}</td>
        <td style="font-family: var(--font-mono);">${q.feePerClaim} MON</td>
        <td>
          <span class="queue-badge ${q.isActive ? 'active' : 'ended'}">${q.isActive ? 'Active' : 'Paused'}</span>
        </td>
        <td>
          <button class="btn btn-outline btn-toggle-queue" data-id="${q.id}" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;">
            ${q.isActive ? 'Pause' : 'Resume'}
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Wire toggle buttons
    document.querySelectorAll('.btn-toggle-queue').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const qId = parseInt(btn.getAttribute('data-id'));
        const queue = state.queues.find(q => q.id === qId);
        if (queue) {
          queue.isActive = !queue.isActive;
          showToast(`Queue #${qId} status updated to ${queue.isActive ? 'Active' : 'Paused'}`);
          renderVendorDashboard();
          renderPublicQueues();
        }
      });
    });
  }
}

// --- Render Public Queues for Free Users ---
function renderPublicQueues() {
  const container = document.getElementById('public-queues-container');
  if (!container) return;

  container.innerHTML = '';
  state.queues.forEach(q => {
    const card = document.createElement('div');
    card.className = 'queue-card';
    const percent = Math.min(100, Math.round((q.claimedCount / q.capacity) * 100));
    const slotsLeft = q.capacity - q.claimedCount;

    card.innerHTML = `
      <div>
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <span class="queue-badge ${q.isActive ? 'active' : 'ended'}">
            ${q.isActive ? '● Accepting Bookings' : 'Closed'}
          </span>
          <span style="font-size: 0.75rem; font-family: var(--font-mono); color: var(--accent-cyan); font-weight: 600;">
            100% Free
          </span>
        </div>

        <h4 class="queue-card-title">${q.title}</h4>
        <p class="queue-card-desc">Organized by ${q.vendor}. All platform booking fees are sponsored by the vendor.</p>

        <div class="capacity-meter">
          <div class="capacity-labels">
            <span>Capacity</span>
            <span>${q.claimedCount} / ${q.capacity} claimed</span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width: ${percent}%;"></div>
          </div>
        </div>

        <div class="queue-meta-row">
          <span>Remaining: ${slotsLeft} slots</span>
          <span>Slot: ${q.slotDurationSec > 0 ? `${q.slotDurationSec / 60}m fixed` : 'Open queue'}</span>
        </div>
      </div>

      <button class="btn btn-primary btn-full btn-claim-slot" data-id="${q.id}" ${(!q.isActive || slotsLeft <= 0) ? 'disabled style="opacity: 0.5;"' : ''}>
        <span>${slotsLeft <= 0 ? 'Queue Full' : '🎟️ Claim Free Slot'}</span>
      </button>
    `;
    container.appendChild(card);
  });

  // Wire Claim Buttons
  document.querySelectorAll('.btn-claim-slot').forEach(btn => {
    btn.addEventListener('click', () => {
      const qId = parseInt(btn.getAttribute('data-id'));
      handleClaimSlot(qId);
    });
  });
}

// --- Handle Free Slot Claim (Direct or Gasless Meta-Tx) ---
function handleClaimSlot(queueId) {
  const queue = state.queues.find(q => q.id === queueId);
  if (!queue) return;

  if (queue.claimedCount >= queue.capacity) {
    showToast('Queue capacity reached!', 'error');
    return;
  }

  // Check vendor balance in usage-based model
  if (state.vendor.planType === 0 && state.vendor.balance < queue.feePerClaim) {
    showToast('Vendor credit exhausted! Claims temporarily locked.', 'error');
    return;
  }

  const isGasless = document.getElementById('toggle-gasless')?.checked ?? true;

  // Debit vendor balance (Usage-metering)
  if (state.vendor.planType === 0) {
    state.vendor.balance -= queue.feePerClaim;
  }

  queue.claimedCount++;
  state.vendor.totalSlotsIssued++;

  // Issue Slot Ticket
  const newTicketId = 100 + state.myTickets.length + 1;
  const newTicket = {
    ticketId: newTicketId,
    queueId: queue.id,
    queueTitle: queue.title,
    slotIndex: queue.claimedCount,
    claimedAt: Date.now(),
    checkedIn: false,
    checkedInAt: 0
  };
  state.myTickets.unshift(newTicket);

  // Trigger low balance alert event if under threshold
  if (state.vendor.balance < 0.005) {
    showToast(`Low Balance Alert triggered for Vendor! Remaining: ${state.vendor.balance.toFixed(4)} MON`, 'warning');
  }

  if (isGasless) {
    showToast(`Gasless Claim Verified via EIP-712! Ticket #${newTicketId} issued (0 Gas Cost to User).`);
  } else {
    showToast(`Claim successful on Monad Testnet! Ticket #${newTicketId} issued (0 MON transfer).`);
  }

  // Update Hero Stats
  const slotsClaimedEl = document.getElementById('stat-slots-claimed');
  if (slotsClaimedEl) {
    slotsClaimedEl.textContent = parseInt(slotsClaimedEl.textContent) + 1;
  }

  renderVendorDashboard();
  renderPublicQueues();
  renderUserTickets();
}

// --- Render User Digital Ticket Passes ---
function renderUserTickets() {
  const container = document.getElementById('user-tickets-list');
  const countBadge = document.getElementById('user-tickets-count');
  if (!container) return;

  countBadge.textContent = `${state.myTickets.length} Ticket${state.myTickets.length === 1 ? '' : 's'}`;

  if (state.myTickets.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 2rem 1rem; color: var(--text-dim);">
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🎫</div>
        <p style="font-size: 0.85rem;">You haven't claimed any slots yet.</p>
        <p style="font-size: 0.75rem;">Click "Claim Free Slot" on any queue on the left to get your ticket.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  state.myTickets.forEach(ticket => {
    const pass = document.createElement('div');
    pass.className = 'ticket-pass';
    pass.style.marginBottom = '1.25rem';

    // Generate dynamic QR SVG
    const qrSvg = `
      <svg viewBox="0 0 100 100" width="100%" height="100%">
        <rect width="100" height="100" fill="#FFF"/>
        <!-- QR Corner Squares -->
        <rect x="10" y="10" width="25" height="25" fill="#000"/>
        <rect x="15" y="15" width="15" height="15" fill="#FFF"/>
        <rect x="18" y="18" width="9" height="9" fill="#000"/>
        
        <rect x="65" y="10" width="25" height="25" fill="#000"/>
        <rect x="70" y="15" width="15" height="15" fill="#FFF"/>
        <rect x="73" y="18" width="9" height="9" fill="#000"/>

        <rect x="10" y="65" width="25" height="25" fill="#000"/>
        <rect x="15" y="70" width="15" height="15" fill="#FFF"/>
        <rect x="18" y="73" width="9" height="9" fill="#000"/>

        <!-- Dynamic Data Blocks based on ticket ID -->
        <rect x="42" y="15" width="6" height="6" fill="#000"/>
        <rect x="52" y="15" width="6" height="6" fill="#000"/>
        <rect x="42" y="42" width="16" height="16" fill="#8B75FF"/>
        <rect x="45" y="45" width="10" height="10" fill="#000"/>
        <rect x="65" y="45" width="6" height="12" fill="#000"/>
        <rect x="15" y="45" width="12" height="6" fill="#000"/>
        <rect x="42" y="68" width="8" height="8" fill="#000"/>
        <rect x="70" y="68" width="12" height="12" fill="#000"/>
      </svg>
    `;

    pass.innerHTML = `
      <div class="ticket-header">
        <div>
          <span style="font-size: 0.65rem; color: var(--text-dim); text-transform: uppercase;">Ticket Pass</span>
          <div class="ticket-slot-number">Slot #${ticket.slotIndex}</div>
        </div>
        <span class="ticket-status-pill ${ticket.checkedIn ? 'redeemed' : 'valid'}">
          ${ticket.checkedIn ? '✓ Checked In' : '● Ready to Scan'}
        </span>
      </div>

      <div class="ticket-body">
        <h4 class="ticket-queue-title">${ticket.queueTitle}</h4>
        <div class="ticket-meta-grid">
          <div class="ticket-meta-item">
            <label>Ticket ID</label>
            <span>#${ticket.ticketId}</span>
          </div>
          <div class="ticket-meta-item">
            <label>Queue ID</label>
            <span>#${ticket.queueId}</span>
          </div>
          <div class="ticket-meta-item">
            <label>Claimant</label>
            <span>${state.userAddress}</span>
          </div>
          <div class="ticket-meta-item">
            <label>Chain</label>
            <span>Monad (10143)</span>
          </div>
        </div>
      </div>

      <div class="ticket-qr-container">
        <div class="qr-code-box">
          ${qrSvg}
        </div>
        <div class="qr-caption">Pass Hash: 0x${ticket.ticketId}a9f...monad</div>
      </div>
    `;
    container.appendChild(pass);
  });
}

// --- Render Check-in Audit Feed ---
function renderCheckinFeed() {
  const tbody = document.getElementById('checkin-feed-tbody');
  const counter = document.getElementById('live-checkin-counter');
  if (!tbody) return;

  counter.textContent = `${state.checkinFeed.length} Verified Today`;
  tbody.innerHTML = '';

  state.checkinFeed.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-family: var(--font-mono); font-weight: 600; color: var(--accent-cyan);">#${item.ticketId}</td>
      <td style="font-weight: 600; color: #FFF;">${item.queueTitle}</td>
      <td style="font-family: var(--font-mono); font-size: 0.8rem;">${item.claimant}</td>
      <td style="font-size: 0.8rem; color: var(--text-dim);">${item.redeemedAt}</td>
      <td style="font-family: var(--font-mono); font-size: 0.8rem;">${item.scanner}</td>
      <td>
        <span class="queue-badge active">✓ Verified</span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// --- Gatekeeper Check-in Handler ---
function setupScannerForm() {
  const form = document.getElementById('form-checkin-scanner');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const qId = parseInt(document.getElementById('scan-queue-id').value);
    const tId = parseInt(document.getElementById('scan-ticket-id').value);

    // Look for ticket in user's tickets or simulated DB
    const localTicket = state.myTickets.find(t => t.ticketId === tId && t.queueId === qId);
    if (localTicket && localTicket.checkedIn) {
      showToast(`Ticket #${tId} has already been checked in!`, 'error');
      return;
    }

    if (localTicket) {
      localTicket.checkedIn = true;
      localTicket.checkedInAt = Date.now();
    }

    const queue = state.queues.find(q => q.id === qId);
    if (queue) {
      queue.checkedInCount++;
    }
    state.vendor.totalCheckIns++;

    // Add to audit feed
    state.checkinFeed.unshift({
      ticketId: tId,
      queueTitle: queue ? queue.title : `Queue #${qId}`,
      claimant: localTicket ? state.userAddress : '0x32e...991b',
      redeemedAt: 'Just now',
      scanner: state.userAddress,
      status: 'Verified'
    });

    showToast(`⚡ Ticket #${tId} successfully verified & redeemed on Monad!`);
    renderVendorDashboard();
    renderUserTickets();
    renderCheckinFeed();
  });
}

// --- Modals & Forms Setup ---
function setupModals() {
  // Deposit Modal
  const depositModal = document.getElementById('modal-deposit');
  const openDepositBtn = document.getElementById('btn-open-deposit-modal');
  const closeDepositBtn = document.getElementById('btn-close-deposit-modal');
  const depositForm = document.getElementById('form-deposit-credits');
  const quickFundBtn = document.getElementById('btn-quick-fund');

  const openDeposit = () => { if (depositModal) depositModal.style.display = 'flex'; };
  const closeDeposit = () => { if (depositModal) depositModal.style.display = 'none'; };

  if (openDepositBtn) openDepositBtn.addEventListener('click', openDeposit);
  if (quickFundBtn) quickFundBtn.addEventListener('click', openDeposit);
  if (closeDepositBtn) closeDepositBtn.addEventListener('click', closeDeposit);

  if (depositForm) {
    depositForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const amount = parseFloat(document.getElementById('deposit-amount').value);
      if (amount <= 0) return;
      state.vendor.balance += amount;
      showToast(`Deposited ${amount} MON into vendor prepaid credit balance!`);
      closeDeposit();
      renderVendorDashboard();
    });
  }

  // Create Queue Modal
  const queueModal = document.getElementById('modal-create-queue');
  const openQueueBtn = document.getElementById('btn-open-queue-modal');
  const closeQueueBtn = document.getElementById('btn-close-queue-modal');
  const queueForm = document.getElementById('form-create-queue');

  const openQueue = () => { if (queueModal) queueModal.style.display = 'flex'; };
  const closeQueue = () => { if (queueModal) queueModal.style.display = 'none'; };

  if (openQueueBtn) openQueueBtn.addEventListener('click', openQueue);
  if (closeQueueBtn) closeQueueBtn.addEventListener('click', closeQueue);

  if (queueForm) {
    // Set default datetime values
    const now = new Date();
    const end = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    const startInput = document.getElementById('new-queue-start');
    const endInput = document.getElementById('new-queue-end');
    if (startInput) startInput.value = now.toISOString().slice(0, 16);
    if (endInput) endInput.value = end.toISOString().slice(0, 16);

    queueForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const title = document.getElementById('new-queue-title').value;
      const metadataURI = document.getElementById('new-queue-metadata').value;
      const capacity = parseInt(document.getElementById('new-queue-capacity').value);
      const fee = parseFloat(document.getElementById('new-queue-fee').value);
      const duration = parseInt(document.getElementById('new-queue-duration').value);

      // Balance gating validation
      if (state.vendor.planType === 0 && state.vendor.balance < fee) {
        showToast('Insufficient vendor balance to create queue! Deposit credits first.', 'error');
        return;
      }

      const newId = state.queues.length + 1;
      state.queues.push({
        id: newId,
        vendor: state.userAddress,
        title,
        metadataURI,
        capacity,
        claimedCount: 0,
        checkedInCount: 0,
        startTime: Date.now(),
        endTime: Date.now() + 7 * 24 * 3600 * 1000,
        slotDurationSec: duration,
        isActive: true,
        feePerClaim: fee
      });

      state.vendor.totalQueuesCreated++;
      showToast(`Queue #${newId} "${title}" created successfully on Monad testnet!`);
      closeQueue();
      renderVendorDashboard();
      renderPublicQueues();
    });
  }

  // Withdraw Unused Balance
  const withdrawBtn = document.getElementById('btn-withdraw-credits');
  if (withdrawBtn) {
    withdrawBtn.addEventListener('click', () => {
      if (state.vendor.balance <= 0) {
        showToast('No balance available to withdraw', 'error');
        return;
      }
      const withdrawAmt = state.vendor.balance;
      state.vendor.balance = 0;
      showToast(`Withdrawn ${withdrawAmt.toFixed(4)} MON back to vendor wallet address!`);
      renderVendorDashboard();
    });
  }

  // Vendor Onboarding Form
  const onboardingForm = document.getElementById('form-vendor-onboarding');
  if (onboardingForm) {
    onboardingForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const planVal = parseInt(document.querySelector('input[name="planType"]:checked').value);
      const depositVal = parseFloat(document.getElementById('initial-deposit').value);

      state.vendor.planType = planVal;
      state.vendor.balance += depositVal;
      state.vendor.isActive = true;

      showToast(`Vendor account registered with ${planVal === 0 ? 'Prepaid Credits' : 'Subscription'} plan!`);
      renderVendorDashboard();
    });

    // Plan radio card selection styles
    const planPrepaid = document.getElementById('plan-card-prepaid');
    const planSub = document.getElementById('plan-card-sub');
    if (planPrepaid && planSub) {
      planPrepaid.addEventListener('click', () => {
        planPrepaid.classList.add('selected');
        planSub.classList.remove('selected');
      });
      planSub.addEventListener('click', () => {
        planSub.classList.add('selected');
        planPrepaid.classList.remove('selected');
      });
    }
  }
}

// --- Wallet Connect Button ---
function setupWalletButton() {
  const btn = document.getElementById('btn-connect-wallet');
  const label = document.getElementById('wallet-btn-label');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    if (window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        if (accounts && accounts[0]) {
          state.userAddress = accounts[0];
          state.walletConnected = true;
          label.textContent = `${accounts[0].slice(0, 6)}...${accounts[0].slice(-4)}`;
          showToast(`Connected: ${accounts[0].slice(0, 6)}...${accounts[0].slice(-4)}`);

          // Attempt switch to Monad Testnet
          try {
            await window.ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: '0x279f' }], // 10143 in hex
            });
          } catch (switchError) {
            // Chain might need to be added
            if (switchError.code === 4902) {
              await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                  chainId: '0x279f',
                  chainName: 'Monad Testnet',
                  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
                  rpcUrls: [MONAD_TESTNET_RPC],
                  blockExplorerUrls: ['https://testnet.monadscan.com']
                }],
              });
            }
          }
          // Fetch Live Balance from Monad Testnet
          try {
            const hexBal = await window.ethereum.request({
              method: 'eth_getBalance',
              params: [accounts[0], 'latest']
            });
            const balMon = parseInt(hexBal, 16) / 1e18;
            state.vendor.balance = Number(balMon.toFixed(4));
            state.vendor.address = accounts[0];
            renderVendorDashboard();
          } catch (balErr) {
            console.warn('Could not fetch live balance from Monad RPC:', balErr);
          }
          return;
        }
      } catch (err) {
        console.error('Wallet connection error:', err);
        showToast(err.message || 'MetaMask connection rejected', 'error');
        label.textContent = 'Connect Wallet';
        return;
      }
    }

    if (window.location.protocol === 'file:') {
      alert("⚠️ MetaMask cannot inject into 'file://' URLs by default.\n\nTo connect your live MetaMask wallet:\n1. Open chrome://extensions in a new tab\n2. Click 'Details' on MetaMask\n3. Turn ON 'Allow access to file URLs'\n4. Reload this page!\n\nAlternatively, run a local server and open http://localhost:3000\n\nFalling back to Interactive Simulator mode.");
    }

    // Default simulation connection
    state.walletConnected = !state.walletConnected;
    if (state.walletConnected) {
      label.textContent = '0x71C...4e92';
      showToast('Connected in Interactive Simulator mode');
    } else {
      label.textContent = 'Connect Wallet';
      showToast('Wallet disconnected');
    }
  });

  if (window.ethereum) {
    window.ethereum.on('accountsChanged', (accounts) => {
      if (accounts && accounts.length > 0) {
        state.userAddress = accounts[0];
        state.vendor.address = accounts[0];
        label.textContent = `${accounts[0].slice(0, 6)}...${accounts[0].slice(-4)}`;
        renderVendorDashboard();
      } else {
        state.walletConnected = false;
        label.textContent = 'Connect Wallet';
      }
    });

    window.ethereum.on('chainChanged', () => {
      window.location.reload();
    });
  }
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupModals();
  setupScannerForm();
  setupWalletButton();
  renderVendorDashboard();
  renderPublicQueues();
  renderUserTickets();
  renderCheckinFeed();
});
