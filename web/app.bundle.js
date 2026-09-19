(() => {
// MonadQueue - Standalone Client Bundle (Live Monad Testnet Web3)
const cfg = window.MONAD_CONFIG || {};

const MONAD_TESTNET_CHAIN_ID = cfg.MONAD_TESTNET_CHAIN_ID || 10143;
const MONAD_TESTNET_RPC = cfg.MONAD_TESTNET_RPC || "https://testnet-rpc.monad.xyz";
const MONAD_EXPLORER = cfg.MONAD_EXPLORER || "https://testnet.monadscan.com";
const CONTRACT_ADDRESS = cfg.CONTRACT_ADDRESS || "0x6cCaC1BCEd3C6DEd7e11246723276d6B3eaf480F";
const CONTRACT_ABI = cfg.CONTRACT_ABI || [];

// --- Live Authoritative Application State ---
const state = {
  walletConnected: false,
  userAddress: null,
  isVendor: false,
  isOnChain: false,
  vendor: {
    address: null,
    planType: 0, // 0: Prepaid, 1: Subscription
    balance: 0,
    subscriptionExpiresAt: 0,
    isActive: false,
    totalQueuesCreated: 0,
    totalSlotsIssued: 0,
    totalCheckIns: 0
  },
  queues: [],
  myTickets: [],
  checkinFeed: []
};

// In-flight guard flags to prevent duplicate overlapping RPC storms
let isFetchingQueues = false;
let isFetchingTickets = false;
let isFetchingVendor = false;

// --- Dedicated Read-Only Provider (Direct Monad RPC, bypasses MetaMask rate limits) ---
let _readOnlyProvider = null;
function getReadOnlyProvider() {
  if (!_readOnlyProvider && window.ethers) {
    _readOnlyProvider = new ethers.JsonRpcProvider(MONAD_TESTNET_RPC);
  }
  return _readOnlyProvider;
}

// --- Web3 Provider Detection (Used ONLY for signing transactions) ---
function getEthereumProvider() {
  if (typeof window === 'undefined') return null;
  if (window.ethereum) {
    if (window.ethereum.providers && window.ethereum.providers.length) {
      const mm = window.ethereum.providers.find(p => p.isMetaMask);
      return mm || window.ethereum.providers[0];
    }
    return window.ethereum;
  }
  return null;
}

async function getProviderAndSigner() {
  const eth = getEthereumProvider();
  if (!eth || !window.ethers) return null;
  const provider = new ethers.BrowserProvider(eth);
  const signer = await provider.getSigner();
  return { provider, signer };
}

async function ensureMonadNetwork() {
  const eth = getEthereumProvider();
  if (!eth) throw new Error("Please install MetaMask or Rabby.");
  const hexChainId = "0x" + Number(MONAD_TESTNET_CHAIN_ID).toString(16);
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexChainId }]
    });
  } catch (err) {
    if (
      err.code === 4902 ||
      err.data?.originalError?.code === 4902 ||
      err.message?.includes("Unrecognized") ||
      err.message?.includes("not found")
    ) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: hexChainId,
          chainName: "Monad Testnet",
          nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
          rpcUrls: [MONAD_TESTNET_RPC],
          blockExplorerUrls: [MONAD_EXPLORER]
        }]
      });
    } else {
      throw err;
    }
  }
}

// --- Error Decoders & Toast Formatter ---
function extractErrorMessage(err, contractInterface) {
  if (!err) return "Unknown error occurred.";
  
  // Rate limit error check
  if (err.code === -32005 || err.message?.includes('-32005') || err.message?.toLowerCase().includes('rate limited')) {
    return "Monad RPC is temporarily rate limited. Please pause 3-5 seconds and retry.";
  }

  // Parse revert data from ethers error structure
  const rawData = err.data || (err.info && err.info.error && err.info.error.data) || (err.error && err.error.data);
  if (rawData && contractInterface) {
    try {
      const parsed = contractInterface.parseError(rawData);
      if (parsed) {
        switch (parsed.name) {
          case 'UnauthorizedScanner':
            return `Unauthorized Scanner: Connected wallet is not authorized for this queue. Only the vendor or authorized scanners can check in attendees.`;
          case 'TicketNotFound':
            return `Ticket #${parsed.args[0]} was not found on Monad.`;
          case 'TicketQueueMismatch':
            return `Ticket #${parsed.args[0]} belongs to Queue #${parsed.args[1]}, not the selected Queue.`;
          case 'TicketAlreadyCheckedIn':
            return `Ticket #${parsed.args[0]} has already been redeemed/checked in!`;
          case 'UserAlreadyClaimed':
            return `Your wallet has already claimed a slot in this queue.`;
          case 'QueueCapacityReached':
            return `This queue has reached maximum capacity (${parsed.args[0]} slots).`;
          case 'InsufficientVendorBalance':
            return `Vendor prepaid balance is insufficient to cover this slot.`;
          case 'SubscriptionExpired':
            return `Vendor's monthly subscription has expired.`;
          case 'VendorNotActive':
            return `Vendor account is not active.`;
          case 'QueueNotActive':
            return `Queue is currently paused or closed.`;
          case 'QueueNotStarted':
            return `Queue booking window has not opened yet.`;
          case 'QueueEnded':
            return `Queue booking window has already closed.`;
          case 'UnauthorizedVendor':
            return `Only the queue creator vendor can perform this action.`;
          default:
            return `Contract notice: ${parsed.name}`;
        }
      }
    } catch (parseErr) {}
  }

  if (err.code === 4001 || err.message?.includes('user rejected') || err.message?.includes('User denied')) {
    return "Transaction cancelled in wallet.";
  }
  if (err.reason) return err.reason;
  if (err.shortMessage) return err.shortMessage;
  return err.message?.slice(0, 85) || "Transaction failed.";
}

// --- Live Contract Reads (Uses Dedicated Direct JSON-RPC, Never Floods MetaMask) ---
async function fetchOnChainVendorData(address) {
  if (!window.ethers || !address || isFetchingVendor) return;
  isFetchingVendor = true;
  try {
    const provider = getReadOnlyProvider();
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    const v = await contract.getVendor(address);
    if (v.owner && v.owner !== ethers.ZeroAddress) {
      state.vendor = {
        address: address,
        owner: v.owner,
        planType: Number(v.planType),
        balance: parseFloat(ethers.formatEther(v.balance)),
        subscriptionExpiresAt: Number(v.subscriptionExpiresAt) * 1000,
        isActive: v.isActive,
        totalQueuesCreated: Number(v.totalQueuesCreated),
        totalSlotsIssued: Number(v.totalSlotsIssued),
        totalCheckIns: Number(v.totalCheckIns)
      };
      state.isOnChain = true;
      state.isVendor = true;
    } else {
      state.vendor = {
        address: address,
        owner: address,
        planType: 0,
        balance: 0,
        subscriptionExpiresAt: 0,
        isActive: false,
        totalQueuesCreated: 0,
        totalSlotsIssued: 0,
        totalCheckIns: 0
      };
      state.isOnChain = false;
      state.isVendor = false;
    }
    renderVendorDashboard();
  } catch (e) {
    console.warn("fetchOnChainVendorData notice:", e.message);
  } finally {
    isFetchingVendor = false;
  }
}

async function fetchOnChainQueues() {
  if (!window.ethers || isFetchingQueues) return;
  isFetchingQueues = true;
  try {
    const provider = getReadOnlyProvider();
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    
    const count = Number(await contract.nextQueueId());
    const liveQueues = [];
    for (let i = 1; i < count; i++) {
      try {
        const q = await contract.getQueue(i);
        liveQueues.push({
          id: Number(q.queueId),
          vendor: q.vendor.slice(0,6) + '...' + q.vendor.slice(-4),
          rawVendor: q.vendor,
          title: q.title,
          metadataURI: q.metadataURI,
          capacity: Number(q.capacity),
          claimedCount: Number(q.claimedCount),
          checkedInCount: Number(q.checkedInCount),
          startTime: Number(q.startTime) * 1000,
          endTime: Number(q.endTime) * 1000,
          slotDurationSec: Number(q.slotDurationSec),
          isActive: q.isActive,
          feePerClaim: parseFloat(ethers.formatEther(q.feePerClaim))
        });
      } catch (e) {
        console.warn(`Error reading queue #${i}:`, e);
      }
    }
    state.queues = liveQueues;
    renderVendorDashboard();
    renderPublicQueues();
    updateHeroStats();
    updateScannerAuthBanner();
  } catch (e) {
    console.warn("fetchOnChainQueues notice:", e.message);
  } finally {
    isFetchingQueues = false;
  }
}

async function fetchUserTickets(userAddress) {
  if (!window.ethers || isFetchingTickets) return;
  isFetchingTickets = true;
  try {
    const provider = getReadOnlyProvider();
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    const totalTickets = Number(await contract.nextTicketId());
    
    const userTickets = [];
    const feed = [];

    for (let i = 1; i < totalTickets; i++) {
      try {
        const t = await contract.getTicket(i);
        const qId = Number(t.queueId);
        const queue = state.queues.find(q => q.id === qId);
        const qTitle = queue ? queue.title : `Queue #${qId}`;

        if (userAddress && t.claimant && t.claimant.toLowerCase() === userAddress.toLowerCase()) {
          userTickets.push({
            ticketId: Number(t.ticketId),
            queueId: qId,
            queueTitle: qTitle,
            slotIndex: Number(t.slotIndex),
            claimedAt: Number(t.claimedAt) * 1000,
            checkedIn: t.checkedIn,
            checkedInAt: Number(t.checkedInAt) * 1000,
            txHash: null
          });
        }

        if (t.checkedIn) {
          feed.unshift({
            ticketId: Number(t.ticketId),
            queueTitle: qTitle,
            claimant: `${t.claimant.slice(0,6)}...${t.claimant.slice(-4)}`,
            redeemedAt: t.checkedInAt ? new Date(Number(t.checkedInAt) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Verified',
            scanner: queue ? queue.vendor : 'Scanner',
            status: 'Verified'
          });
        }
      } catch (e) {}
    }
    state.myTickets = userTickets;
    state.checkinFeed = feed;
    renderUserTickets();
    renderCheckinFeed();
    updateHeroStats();
  } catch (e) {
    console.warn("fetchUserTickets notice:", e);
  } finally {
    isFetchingTickets = false;
  }
}

async function fetchAllOnChainData(address) {
  await fetchOnChainQueues();
  if (address) {
    await fetchOnChainVendorData(address);
  }
  await fetchUserTickets(address);
}

// --- Dynamic Hero Stats ---
function updateHeroStats() {
  const activeQueuesEl = document.getElementById('stat-active-queues');
  const slotsClaimedEl = document.getElementById('stat-slots-claimed');
  const checkinRateEl = document.getElementById('stat-checkin-rate');

  const totalActive = state.queues.filter(q => q.isActive).length;
  let totalClaimed = 0;
  let totalCheckedIn = 0;
  state.queues.forEach(q => {
    totalClaimed += q.claimedCount;
    totalCheckedIn += q.checkedInCount;
  });

  if (activeQueuesEl) activeQueuesEl.textContent = totalActive;
  if (slotsClaimedEl) slotsClaimedEl.textContent = totalClaimed;
  if (checkinRateEl) {
    if (totalClaimed > 0) {
      checkinRateEl.textContent = `${Math.round((totalCheckedIn / totalClaimed) * 100)}%`;
    } else {
      checkinRateEl.textContent = '100%';
    }
  }
}

// --- Toast System ---
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = type === 'success' ? '⚡' : type === 'error' ? '❌' : type === 'info' ? 'ℹ️' : '⚠️';
  toast.innerHTML = `
    <span>${icon}</span>
    <span style="font-size: 0.85rem; color: #FFF;">${message}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 5000);
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

      if (targetId === 'scanner-terminal') {
        updateScannerAuthBanner();
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
  const statusBadge = document.getElementById('vendor-status-badge');

  if (balanceDisplay) {
    balanceDisplay.textContent = state.walletConnected ? `${state.vendor.balance.toFixed(4)} MON` : '0.0000 MON';
  }
  if (planDisplay) {
    if (!state.walletConnected) {
      planDisplay.textContent = 'Connect Wallet';
    } else if (!state.isOnChain) {
      planDisplay.textContent = 'Not Registered';
    } else if (state.vendor.planType === 1) {
      const daysLeft = Math.max(0, Math.round((state.vendor.subscriptionExpiresAt - Date.now()) / (24 * 3600 * 1000)));
      planDisplay.textContent = `Subscription (${daysLeft}d left)`;
    } else {
      planDisplay.textContent = 'Prepaid Credits';
    }
  }

  if (statusBadge) {
    if (!state.walletConnected) {
      statusBadge.textContent = 'Wallet Disconnected';
      statusBadge.className = 'queue-badge ended';
    } else if (state.isOnChain && state.vendor.isActive) {
      statusBadge.textContent = 'Vendor Active';
      statusBadge.className = 'queue-badge active';
    } else {
      statusBadge.textContent = 'Registration Required';
      statusBadge.className = 'queue-badge ended';
    }
  }

  if (lowBalAlert) {
    if (state.isOnChain && state.vendor.planType === 0 && state.vendor.balance < 0.005) {
      lowBalAlert.style.display = 'flex';
      if (balAlertVal) balAlertVal.textContent = state.vendor.balance.toFixed(4);
    } else {
      lowBalAlert.style.display = 'none';
    }
  }

  if (tbody) {
    tbody.innerHTML = '';
    const vendorQueues = state.queues.filter(q => !state.userAddress || q.rawVendor?.toLowerCase() === state.userAddress.toLowerCase());
    if (queueCount) queueCount.textContent = `Showing ${vendorQueues.length} queue${vendorQueues.length === 1 ? '' : 's'}`;

    if (vendorQueues.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 2.5rem; color: var(--text-dim);">
            ${state.walletConnected ? 'No queues created by this account yet. Click <strong>"Create New Queue"</strong> above.' : 'Connect your wallet to manage your vendor queues.'}
          </td>
        </tr>
      `;
    } else {
      vendorQueues.forEach(q => {
        const tr = document.createElement('tr');
        const percent = Math.min(100, Math.round((q.claimedCount / q.capacity) * 100));
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

      document.querySelectorAll('.btn-toggle-queue').forEach(btn => {
        btn.addEventListener('click', async () => {
          const qId = parseInt(btn.getAttribute('data-id'));
          const queue = state.queues.find(q => q.id === qId);
          if (!queue) return;

          try {
            await ensureMonadNetwork();
            const { signer } = await getProviderAndSigner();
            const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
            showToast(`Updating Queue #${qId} status on Monad...`, 'info');
            const tx = await contract.setQueueActive(qId, !queue.isActive, { gasLimit: 120000n });
            await tx.wait();
            showToast(`Queue #${qId} status updated on Monad!`);
            await fetchOnChainQueues();
          } catch (e) {
            showToast(extractErrorMessage(e, CONTRACT_ABI), 'warning');
          }
        });
      });
    }
  }
}

// --- Render Public Queues for Free Users ---
function renderPublicQueues() {
  const container = document.getElementById('public-queues-container');
  if (!container) return;

  container.innerHTML = '';
  if (state.queues.length === 0) {
    container.innerHTML = `
      <div class="card" style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem;">
        <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">📋</div>
        <h4 style="font-size: 1.1rem; color: #FFF; margin-bottom: 0.5rem;">No Queues on Monad Testnet Yet</h4>
        <p style="font-size: 0.85rem; color: var(--text-secondary); max-width: 440px; margin: 0 auto 1.25rem;">
          Connect your vendor wallet in the Vendor Portal, fund your account, and create the first verifiable queue on-chain!
        </p>
        <button class="btn btn-primary" id="btn-goto-vendor" style="margin: 0 auto;">
          <span>Go to Vendor Portal ➔</span>
        </button>
      </div>
    `;
    const gotoBtn = document.getElementById('btn-goto-vendor');
    if (gotoBtn) gotoBtn.addEventListener('click', () => document.getElementById('tab-vendor').click());
    return;
  }

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
            100% Free (0 MON)
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
        <span>${slotsLeft <= 0 ? 'Queue Full' : '🎟️ Claim Free Slot (0 MON)'}</span>
      </button>
    `;
    container.appendChild(card);
  });

  document.querySelectorAll('.btn-claim-slot').forEach(btn => {
    btn.addEventListener('click', () => {
      const qId = parseInt(btn.getAttribute('data-id'));
      handleClaimSlot(qId);
    });
  });
}

// --- Handle Free Slot Claim ---
async function handleClaimSlot(queueId) {
  const queue = state.queues.find(q => q.id === queueId);
  if (!queue) return;

  if (queue.claimedCount >= queue.capacity) {
    showToast('Queue capacity reached!', 'error');
    return;
  }

  if (!state.walletConnected) {
    showToast('Please connect your wallet first to secure your canonical position.', 'warning');
    const connectBtn = document.getElementById('btn-connect-wallet');
    if (connectBtn) connectBtn.click();
    return;
  }

  try {
    await ensureMonadNetwork();
    const { signer } = await getProviderAndSigner();
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

    showToast('Simulating free claim on Monad...', 'info');
    
    // Pre-flight simulation via staticCall to catch reverts cleanly
    try {
      await contract.claimSlot.staticCall(queueId);
    } catch (simErr) {
      const msg = extractErrorMessage(simErr, contract.interface);
      showToast(msg, 'error');
      return;
    }

    showToast('Securing canonical position on Monad (0 MON Transfer)... Please confirm in wallet.', 'info');
    // Explicit gasLimit avoids MetaMask eth_estimateGas binary searches and rate limits
    const tx = await contract.claimSlot(queueId, { gasLimit: 200000n });
    showToast(`Tx submitted to Monad (${tx.hash.slice(0, 10)}...). Confirming...`, 'info');
    const receipt = await tx.wait();

    let assignedSlot = queue.claimedCount + 1;
    let ticketId = 1;

    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed && parsed.name === 'SlotClaimed') {
          ticketId = Number(parsed.args.ticketId);
          assignedSlot = Number(parsed.args.slotIndex);
          break;
        }
      } catch (e) {}
    }

    showToast(`✓ Monad Verified! You are Position #${assignedSlot} (Ticket #${ticketId})`);

    await fetchAllOnChainData(state.userAddress);
  } catch (err) {
    const msg = extractErrorMessage(err, CONTRACT_ABI);
    showToast(`Claim notice: ${msg}`, 'error');
  }
}

// --- Render User Digital Ticket Passes ---
function renderUserTickets() {
  const container = document.getElementById('user-tickets-list');
  const countBadge = document.getElementById('user-tickets-count');
  if (!container) return;

  if (countBadge) {
    countBadge.textContent = `${state.myTickets.length} Ticket${state.myTickets.length === 1 ? '' : 's'}`;
  }

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

    const qrSvg = `
      <svg viewBox="0 0 100 100" width="100%" height="100%">
        <rect width="100" height="100" fill="#FFF"/>
        <rect x="10" y="10" width="25" height="25" fill="#000"/>
        <rect x="15" y="15" width="15" height="15" fill="#FFF"/>
        <rect x="18" y="18" width="9" height="9" fill="#000"/>
        <rect x="65" y="10" width="25" height="25" fill="#000"/>
        <rect x="70" y="15" width="15" height="15" fill="#FFF"/>
        <rect x="73" y="18" width="9" height="9" fill="#000"/>
        <rect x="10" y="65" width="25" height="25" fill="#000"/>
        <rect x="15" y="70" width="15" height="15" fill="#FFF"/>
        <rect x="18" y="73" width="9" height="9" fill="#000"/>
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

    const txShort = ticket.txHash ? `${ticket.txHash.slice(0, 10)}...${ticket.txHash.slice(-6)}` : 'Onchain Verified';
    const explorerUrl = ticket.txHash && ticket.txHash.startsWith('0x') ? `${MONAD_EXPLORER}/tx/${ticket.txHash}` : `${MONAD_EXPLORER}/address/${CONTRACT_ADDRESS}`;

    pass.innerHTML = `
      <div class="ticket-header">
        <div>
          <span style="font-size: 0.65rem; color: var(--text-dim); text-transform: uppercase;">Proof of Queue Pass</span>
          <div class="ticket-slot-number">Position #${ticket.slotIndex}</div>
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
            <span>${state.userAddress ? `${state.userAddress.slice(0,6)}...${state.userAddress.slice(-4)}` : '0x...'}</span>
          </div>
          <div class="ticket-meta-item">
            <label>Network</label>
            <span>Monad (10143)</span>
          </div>
        </div>
        
        <div style="margin-top: 0.8rem; padding: 0.5rem; background: rgba(0,0,0,0.3); border-radius: 6px; font-size: 0.75rem;">
          <span style="color: var(--text-dim);">Verification:</span>
          <a href="${explorerUrl}" target="_blank" style="color: var(--accent-cyan); text-decoration: underline; margin-left: 4px; font-family: var(--font-mono);">
            ${txShort} ↗
          </a>
        </div>

        <div style="margin-top: 0.75rem;">
          ${!ticket.checkedIn ? `
            <button class="btn btn-primary btn-sm btn-open-in-scanner" data-queue-id="${ticket.queueId}" data-ticket-id="${ticket.ticketId}" style="width: 100%; padding: 0.45rem; font-size: 0.75rem;">
              📱 Open in Gatekeeper Scanner
            </button>
          ` : `
            <div style="font-size: 0.75rem; color: var(--accent-emerald); font-weight: 600; text-align: center; padding: 0.3rem;">
              ✓ Redeemed on Monad
            </div>
          `}
        </div>
      </div>

      <div class="ticket-qr-container">
        <div class="qr-code-box">
          ${qrSvg}
        </div>
        <div class="qr-caption">Pass #${ticket.ticketId} · Verified on Monad</div>
      </div>
    `;
    container.appendChild(pass);
  });

  // Attach Open in Gatekeeper Scanner click handlers
  container.querySelectorAll('.btn-open-in-scanner').forEach(btn => {
    btn.addEventListener('click', () => {
      const qId = btn.getAttribute('data-queue-id');
      const tId = btn.getAttribute('data-ticket-id');
      
      const scannerTab = document.getElementById('tab-scanner');
      if (scannerTab) scannerTab.click();

      const qInput = document.getElementById('scan-queue-id');
      const tInput = document.getElementById('scan-ticket-id');
      if (qInput) qInput.value = qId;
      if (tInput) tInput.value = tId;

      updateScannerAuthBanner();
      showToast(`Loaded Ticket #${tId} for Queue #${qId} into Scanner.`, 'info');
    });
  });
}

// --- Render Check-in Audit Feed ---
function renderCheckinFeed() {
  const tbody = document.getElementById('checkin-feed-tbody');
  const counter = document.getElementById('live-checkin-counter');
  if (!tbody) return;

  if (counter) counter.textContent = `${state.checkinFeed.length} Verified Today`;
  tbody.innerHTML = '';

  if (state.checkinFeed.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-dim);">
          No tickets checked in yet today. Scan a ticket pass or enter ticket ID above.
        </td>
      </tr>
    `;
    return;
  }

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

// --- Live Scanner Authorization Banner Update ---
async function updateScannerAuthBanner() {
  const statusEl = document.getElementById('scanner-auth-status');
  const dotEl = document.getElementById('scanner-auth-dot');
  const queueInput = document.getElementById('scan-queue-id');
  if (!statusEl || !dotEl) return;

  if (!state.walletConnected || !state.userAddress) {
    dotEl.style.background = 'var(--text-dim)';
    statusEl.innerHTML = 'Connect vendor/scanner wallet to verify redemption authorization.';
    return;
  }

  const qId = parseInt(queueInput ? queueInput.value : "1") || 1;
  const queue = state.queues.find(q => q.id === qId);

  if (!queue) {
    dotEl.style.background = 'var(--accent-yellow)';
    statusEl.innerHTML = `Queue #${qId} not loaded. Please ensure Queue ID exists.`;
    return;
  }

  const userAddr = state.userAddress.toLowerCase();
  const vendorAddr = (queue.rawVendor || "").toLowerCase();

  if (userAddr === vendorAddr) {
    dotEl.style.background = 'var(--accent-emerald)';
    statusEl.innerHTML = `<span style="color: var(--accent-emerald); font-weight: 600;">✓ Authorized:</span> You are connected as Queue #${qId} Vendor (${state.userAddress.slice(0,6)}...${state.userAddress.slice(-4)})`;
    return;
  }

  // Check if authorized staff scanner on-chain via dedicated read-only provider
  try {
    const provider = getReadOnlyProvider();
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    const isStaff = await contract.isScanner(qId, state.userAddress);
    if (isStaff) {
      dotEl.style.background = 'var(--accent-emerald)';
      statusEl.innerHTML = `<span style="color: var(--accent-emerald); font-weight: 600;">✓ Authorized:</span> Verified Staff Scanner for Queue #${qId}`;
      return;
    }

    const owner = await contract.owner();
    if (owner.toLowerCase() === userAddr) {
      dotEl.style.background = 'var(--accent-emerald)';
      statusEl.innerHTML = `<span style="color: var(--accent-emerald); font-weight: 600;">✓ Authorized:</span> Platform Owner (${state.userAddress.slice(0,6)}...${state.userAddress.slice(-4)})`;
      return;
    }
  } catch (e) {}

  dotEl.style.background = 'var(--accent-yellow)';
  statusEl.innerHTML = `<span style="color: var(--accent-yellow); font-weight: 600;">⚠️ Unauthorized:</span> Wallet (${state.userAddress.slice(0,6)}...${state.userAddress.slice(-4)}) cannot redeem tickets for Queue #${qId}. Switch to vendor wallet (<strong>${queue.rawVendor.slice(0,6)}...${queue.rawVendor.slice(-4)}</strong>) in MetaMask.`;
}

// --- Gatekeeper Check-in Handler ---
function setupScannerForm() {
  const form = document.getElementById('form-checkin-scanner');
  if (!form) return;

  const queueInput = document.getElementById('scan-queue-id');
  const ticketInput = document.getElementById('scan-ticket-id');

  // Pre-fill scanner fields if tickets exist
  function prefillScannerFields() {
    if (ticketInput && (!ticketInput.value || ticketInput.value === '')) {
      if (state.myTickets.length > 0) {
        const unredeemed = state.myTickets.find(t => !t.checkedIn) || state.myTickets[0];
        ticketInput.value = unredeemed.ticketId;
        if (queueInput && (!queueInput.value || queueInput.value === '')) {
          queueInput.value = unredeemed.queueId;
        }
      } else {
        ticketInput.value = 1;
      }
    }
    if (queueInput && (!queueInput.value || queueInput.value === '')) {
      queueInput.value = 1;
    }
    updateScannerAuthBanner();
  }

  if (queueInput) {
    queueInput.addEventListener('input', () => updateScannerAuthBanner());
    queueInput.addEventListener('change', () => updateScannerAuthBanner());
  }

  prefillScannerFields();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const qId = parseInt(document.getElementById('scan-queue-id').value);
    const tId = parseInt(document.getElementById('scan-ticket-id').value);

    if (isNaN(qId) || qId <= 0) {
      showToast("Please enter a valid Queue ID.", "warning");
      return;
    }
    if (isNaN(tId) || tId <= 0) {
      showToast("Please enter a valid Ticket ID.", "warning");
      return;
    }

    if (!state.walletConnected || !state.userAddress) {
      showToast("Connect authorized scanner or vendor wallet first.", "warning");
      const connectBtn = document.getElementById('btn-connect-wallet');
      if (connectBtn) connectBtn.click();
      return;
    }

    // Step 1: Fast On-Chain Pre-Validation via Dedicated Read-Only Provider
    try {
      const readProvider = getReadOnlyProvider();
      const readContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, readProvider);

      // Check Queue Existence
      let queueData;
      try {
        queueData = await readContract.getQueue(qId);
        if (!queueData || queueData.vendor === ethers.ZeroAddress) {
          showToast(`Queue #${qId} does not exist on Monad.`, 'error');
          return;
        }
      } catch (qe) {
        showToast(`Queue #${qId} not found on Monad.`, 'error');
        return;
      }

      // Check Scanner Authorization
      const scannerAddr = state.userAddress.toLowerCase();
      const vendorAddr = queueData.vendor.toLowerCase();
      let isAuth = (scannerAddr === vendorAddr);

      if (!isAuth) {
        try {
          isAuth = await readContract.isScanner(qId, state.userAddress);
        } catch (se) {}
      }
      if (!isAuth) {
        try {
          const ownerAddr = (await readContract.owner()).toLowerCase();
          if (ownerAddr === scannerAddr) isAuth = true;
        } catch (oe) {}
      }

      if (!isAuth) {
        showToast(`⚠️ Unauthorized scanner: Current wallet (${state.userAddress.slice(0,6)}...${state.userAddress.slice(-4)}) is NOT authorized for Queue #${qId}. Switch to vendor wallet (${queueData.vendor.slice(0,6)}...${queueData.vendor.slice(-4)}) in MetaMask.`, 'error');
        return;
      }

      // Check Ticket Status
      let ticketData;
      try {
        ticketData = await readContract.getTicket(tId);
        if (!ticketData || Number(ticketData.ticketId) === 0) {
          showToast(`Ticket #${tId} does not exist on Monad testnet.`, 'error');
          return;
        }
        if (Number(ticketData.queueId) !== qId) {
          showToast(`Ticket #${tId} belongs to Queue #${ticketData.queueId}, not Queue #${qId}.`, 'error');
          return;
        }
        if (ticketData.checkedIn) {
          showToast(`Ticket #${tId} has ALREADY been checked in and redeemed!`, 'warning');
          return;
        }
      } catch (te) {
        showToast(`Ticket #${tId} lookup failed: ${te.message?.slice(0, 40)}`, 'error');
        return;
      }

    } catch (preCheckErr) {
      console.warn("Pre-check note:", preCheckErr);
    }

    // Step 2: Preflight Simulation and Transaction Dispatch
    try {
      await ensureMonadNetwork();
      const { signer } = await getProviderAndSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

      showToast(`Simulating check-in for Ticket #${tId}...`, 'info');

      // StaticCall simulation catches reverts before MetaMask tx estimation loops
      try {
        await contract.checkIn.staticCall(qId, tId);
      } catch (simErr) {
        const errorMsg = extractErrorMessage(simErr, contract.interface);
        showToast(errorMsg, 'error');
        return;
      }

      showToast(`Submitting check-in for Ticket #${tId} to Monad... Please confirm in MetaMask.`, 'info');
      // Passing explicit gasLimit: 150000n avoids eth_estimateGas and RPC rate limiting (-32005)
      const tx = await contract.checkIn(qId, tId, { gasLimit: 150000n });
      showToast(`Tx submitted (${tx.hash.slice(0, 10)}...). Confirming on Monad...`, 'info');
      const receipt = await tx.wait();
      showToast(`⚡ Ticket #${tId} successfully redeemed on Monad! Tx: ${receipt.hash.slice(0, 8)}...`);

      // Refresh all onchain data
      await fetchAllOnChainData(state.userAddress);
    } catch (err) {
      const msg = extractErrorMessage(err, CONTRACT_ABI);
      showToast(`Check-in notice: ${msg}`, 'error');
    }
  });
}

// --- Modals & Forms Setup ---
function setupModals() {
  const depositModal = document.getElementById('modal-deposit');
  const openDepositBtn = document.getElementById('btn-open-deposit-modal');
  const closeDepositBtn = document.getElementById('btn-close-deposit-modal');
  const depositForm = document.getElementById('form-deposit-credits');
  const quickFundBtn = document.getElementById('btn-quick-fund');
  const buySubBtn = document.getElementById('btn-buy-subscription');

  const openDeposit = () => { if (depositModal) depositModal.style.display = 'flex'; };
  const closeDeposit = () => { if (depositModal) depositModal.style.display = 'none'; };

  if (openDepositBtn) openDepositBtn.addEventListener('click', openDeposit);
  if (quickFundBtn) quickFundBtn.addEventListener('click', openDeposit);
  if (closeDepositBtn) closeDepositBtn.addEventListener('click', closeDeposit);

  // Buy Subscription Handler
  const handleBuySubAction = async () => {
    if (!state.walletConnected) {
      showToast("Please connect your wallet first.", "warning");
      const connectBtn = document.getElementById('btn-connect-wallet');
      if (connectBtn) connectBtn.click();
      return;
    }

    try {
      await ensureMonadNetwork();
      const { signer } = await getProviderAndSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      showToast('Confirm 30-day subscription (0.05 MON) in your wallet...', 'info');
      const tx = await contract.subscribe({ value: ethers.parseEther("0.05"), gasLimit: 200000n });
      showToast("Transaction sent! Waiting for Monad confirmation...", 'info');
      const receipt = await tx.wait();
      showToast(`🎉 30-Day Subscription active on Monad! Tx: ${receipt.hash.slice(0, 8)}...`);
      await fetchAllOnChainData(await signer.getAddress());
    } catch (err) {
      showToast(extractErrorMessage(err, CONTRACT_ABI), 'error');
    }
  };

  if (buySubBtn) {
    buySubBtn.addEventListener('click', handleBuySubAction);
  }

  // Deposit Credits Form
  if (depositForm) {
    depositForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = parseFloat(document.getElementById('deposit-amount').value);
      if (amount <= 0) return;

      if (!state.walletConnected) {
        showToast("Please connect your wallet first.", "warning");
        return;
      }

      try {
        await ensureMonadNetwork();
        const { signer } = await getProviderAndSigner();
        const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
        showToast(`Confirming deposit of ${amount} MON in wallet...`, 'info');
        const tx = await contract.depositVendorBalance({
          value: ethers.parseEther(amount.toString()),
          gasLimit: 150000n
        });
        showToast('Submitted to Monad! Waiting for confirmation...', 'info');
        const receipt = await tx.wait();
        showToast(`Deposited ${amount} MON successfully! Tx: ${receipt.hash.slice(0, 8)}...`);
        closeDeposit();
        await fetchAllOnChainData(await signer.getAddress());
      } catch (err) {
        showToast(extractErrorMessage(err, CONTRACT_ABI), 'error');
      }
    });
  }

  // Queue Modal
  const queueModal = document.getElementById('modal-create-queue');
  const openQueueBtn = document.getElementById('btn-open-queue-modal');
  const closeQueueBtn = document.getElementById('btn-close-queue-modal');
  const queueForm = document.getElementById('form-create-queue');

  const openQueue = () => { if (queueModal) queueModal.style.display = 'flex'; };
  const closeQueue = () => { if (queueModal) queueModal.style.display = 'none'; };

  if (openQueueBtn) openQueueBtn.addEventListener('click', openQueue);
  if (closeQueueBtn) closeQueueBtn.addEventListener('click', closeQueue);

  if (queueForm) {
    const now = new Date();
    const end = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    const startInput = document.getElementById('new-queue-start');
    const endInput = document.getElementById('new-queue-end');
    if (startInput) startInput.value = now.toISOString().slice(0, 16);
    if (endInput) endInput.value = end.toISOString().slice(0, 16);

    queueForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('new-queue-title').value;
      const metadataURI = document.getElementById('new-queue-metadata').value;
      const capacity = parseInt(document.getElementById('new-queue-capacity').value);
      const fee = parseFloat(document.getElementById('new-queue-fee').value);
      const duration = parseInt(document.getElementById('new-queue-duration').value);

      if (!state.walletConnected) {
        showToast("Please connect your wallet first.", "warning");
        const connectBtn = document.getElementById('btn-connect-wallet');
        if (connectBtn) connectBtn.click();
        return;
      }

      try {
        await ensureMonadNetwork();
        const { signer } = await getProviderAndSigner();
        const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
        showToast(`Submitting queue "${title}" to Monad Testnet...`, 'info');
        
        const startTs = Math.floor(now.getTime() / 1000);
        const endTs = Math.floor(end.getTime() / 1000);
        const feeWei = ethers.parseEther(fee.toString());

        // Preflight simulation
        try {
          await contract.createQueue.staticCall(title, metadataURI, capacity, startTs, endTs, duration, feeWei);
        } catch (simErr) {
          showToast(extractErrorMessage(simErr, contract.interface), 'error');
          return;
        }

        const tx = await contract.createQueue(title, metadataURI, capacity, startTs, endTs, duration, feeWei, { gasLimit: 350000n });
        showToast(`Tx submitted (${tx.hash.slice(0, 10)}...). Confirming...`, 'info');
        const receipt = await tx.wait();
        showToast(`🎉 Queue created on Monad Testnet! Tx: ${receipt.hash.slice(0, 8)}...`);
        closeQueue();
        await fetchAllOnChainData(await signer.getAddress());
      } catch (err) {
        showToast(extractErrorMessage(err, CONTRACT_ABI), 'error');
      }
    });
  }

  // Withdraw Unused Balance
  const withdrawBtn = document.getElementById('btn-withdraw-credits');
  if (withdrawBtn) {
    withdrawBtn.addEventListener('click', async () => {
      if (!state.walletConnected || state.vendor.balance <= 0) {
        showToast('No balance available to withdraw', 'error');
        return;
      }

      try {
        await ensureMonadNetwork();
        const { signer } = await getProviderAndSigner();
        const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
        showToast('Withdrawing balance on Monad...', 'info');
        const tx = await contract.withdrawUnusedBalance(ethers.parseEther(state.vendor.balance.toString()), { gasLimit: 150000n });
        await tx.wait();
        showToast("Refund complete on Monad!");
        await fetchAllOnChainData(await signer.getAddress());
      } catch (err) {
        showToast(extractErrorMessage(err, CONTRACT_ABI), 'error');
      }
    });
  }

  // Vendor Onboarding Form
  const onboardingForm = document.getElementById('form-vendor-onboarding');
  if (onboardingForm) {
    onboardingForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const planVal = parseInt(document.querySelector('input[name="planType"]:checked').value);
      const depositVal = parseFloat(document.getElementById('initial-deposit').value);

      if (!state.walletConnected) {
        showToast("Please connect your wallet first.", "warning");
        const connectBtn = document.getElementById('btn-connect-wallet');
        if (connectBtn) connectBtn.click();
        return;
      }

      try {
        await ensureMonadNetwork();
        const { signer } = await getProviderAndSigner();
        const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
        showToast(`Registering vendor with ${planVal === 0 ? 'Prepaid Credits' : 'Subscription'} on Monad...`, 'info');

        if (planVal === 1) {
          // Subscription: 0.05 MON
          const tx = await contract.subscribe({ value: ethers.parseEther("0.05"), gasLimit: 200000n });
          showToast('Subscription submitted! Waiting for block confirmation...', 'info');
          const receipt = await tx.wait();
          showToast(`✓ Subscribed to Monad Platform! Tx: ${receipt.hash.slice(0, 8)}...`);
        } else {
          // Prepaid: min 0.005 MON
          const tx = await contract.registerVendor(0, { value: ethers.parseEther(depositVal.toString()), gasLimit: 250000n });
          showToast('Registration submitted! Waiting for block confirmation...', 'info');
          const receipt = await tx.wait();
          showToast(`✓ Vendor registered with ${depositVal} MON credits! Tx: ${receipt.hash.slice(0, 8)}...`);
        }

        await fetchAllOnChainData(await signer.getAddress());
      } catch (err) {
        showToast(extractErrorMessage(err, CONTRACT_ABI), 'error');
      }
    });

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

// --- Wallet Connect Button & Events ---
function updateWalletUI() {
  const label = document.getElementById('wallet-btn-label');
  if (!label) return;
  const btn = document.getElementById('btn-connect-wallet');
  if (state.walletConnected && state.userAddress) {
    label.textContent = `${state.userAddress.slice(0, 6)}...${state.userAddress.slice(-4)}`;
    if (btn) {
      btn.setAttribute('title', 'Click to disconnect');
      btn.classList.add('connected');
    }
  } else {
    label.textContent = 'Connect Wallet';
    if (btn) {
      btn.removeAttribute('title');
      btn.classList.remove('connected');
    }
  }
  updateScannerAuthBanner();
}

function setupWalletButton() {
  const btn = document.getElementById('btn-connect-wallet');
  const label = document.getElementById('wallet-btn-label');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    // If currently connected -> Disconnect toggle
    if (state.walletConnected) {
      state.walletConnected = false;
      state.userAddress = null;
      state.isOnChain = false;
      state.isVendor = false;
      state.vendor = {
        address: null,
        planType: 0,
        balance: 0,
        subscriptionExpiresAt: 0,
        isActive: false,
        totalQueuesCreated: 0,
        totalSlotsIssued: 0,
        totalCheckIns: 0
      };
      state.myTickets = [];
      sessionStorage.setItem('wallet_user_disconnected', 'true');
      updateWalletUI();
      renderVendorDashboard();
      renderUserTickets();
      showToast('Wallet disconnected');
      return;
    }

    sessionStorage.removeItem('wallet_user_disconnected');
    const eth = getEthereumProvider();
    if (!eth) {
      showToast("No Web3 wallet found! Please install MetaMask or Rabby.", "error");
      return;
    }

    try {
      showToast("Requesting wallet connection...", "info");
      const accounts = await eth.request({ method: 'eth_requestAccounts' });
      if (accounts && accounts.length > 0) {
        state.userAddress = accounts[0];
        state.walletConnected = true;
        updateWalletUI();
        showToast(`Connected: ${accounts[0].slice(0, 6)}...${accounts[0].slice(-4)}`);

        try {
          await ensureMonadNetwork();
        } catch (netErr) {
          console.warn("Network switch notice:", netErr);
          showToast("Please switch network to Monad Testnet in your wallet.", "warning");
        }

        await fetchAllOnChainData(accounts[0]);
      }
    } catch (err) {
      console.warn('Wallet connection note:', err);
      if (err.code === 4001) {
        showToast("Connection cancelled in wallet.", "warning");
      } else {
        showToast(err.message?.slice(0, 50) || 'Connection error', 'warning');
      }
    }
  });

  btn.addEventListener('mouseenter', () => {
    if (state.walletConnected && state.userAddress && label) {
      label.textContent = 'Disconnect ✕';
    }
  });

  btn.addEventListener('mouseleave', () => {
    if (state.walletConnected && state.userAddress && label) {
      label.textContent = `${state.userAddress.slice(0, 6)}...${state.userAddress.slice(-4)}`;
    }
  });

  const eth = getEthereumProvider();
  if (eth && sessionStorage.getItem('wallet_user_disconnected') !== 'true') {
    eth.request({ method: 'eth_accounts' }).then(accounts => {
      if (accounts && accounts.length > 0) {
        state.userAddress = accounts[0];
        state.walletConnected = true;
        updateWalletUI();
        fetchAllOnChainData(accounts[0]);
      }
    }).catch(() => {});

    if (eth.on) {
      eth.on('accountsChanged', (accounts) => {
        if (accounts.length > 0 && sessionStorage.getItem('wallet_user_disconnected') !== 'true') {
          state.userAddress = accounts[0];
          state.walletConnected = true;
          updateWalletUI();
          showToast(`Account switched: ${accounts[0].slice(0, 6)}...${accounts[0].slice(-4)}`);
          fetchAllOnChainData(accounts[0]);
        } else {
          state.walletConnected = false;
          state.userAddress = null;
          updateWalletUI();
          renderVendorDashboard();
          renderUserTickets();
        }
      });

      eth.on('chainChanged', () => {
        window.location.reload();
      });
    }
  }
}

// --- Initialize on DOM ready ---
document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupModals();
  setupScannerForm();
  setupWalletButton();
  renderVendorDashboard();
  renderPublicQueues();
  renderUserTickets();
  renderCheckinFeed();

  // Load live queues and verified feed immediately on page load via direct Monad RPC
  fetchAllOnChainData(state.userAddress);
});
})();
