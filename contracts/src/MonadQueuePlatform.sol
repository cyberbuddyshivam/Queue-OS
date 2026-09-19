// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * @title MonadQueuePlatform
 * @notice Plug-and-play Vendor-Paid, User-Free Queue & Booking Platform optimized for Monad.
 * @dev Onchain accounting for vendor prepaid balances, recurring subscriptions, capacity-gated
 *      queues, free user slot claims, gasless EIP-712 meta-transactions, and scanner check-ins.
 */

// --- Lightweight OpenZeppelin-style base contracts for zero-dependency compilation ---

abstract contract ReentrancyGuard {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status;

    error ReentrancyGuardReentrantCall();

    constructor() {
        _status = _NOT_ENTERED;
    }

    modifier nonReentrant() {
        if (_status == _ENTERED) revert ReentrancyGuardReentrantCall();
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }
}

abstract contract Ownable {
    address private _owner;

    error OwnableUnauthorizedAccount(address account);
    error OwnableInvalidOwner(address owner);

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert OwnableInvalidOwner(address(0));
        _transferOwnership(initialOwner);
    }

    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    function owner() public view virtual returns (address) {
        return _owner;
    }

    function _checkOwner() internal view virtual {
        if (owner() != msg.sender) revert OwnableUnauthorizedAccount(msg.sender);
    }

    function transferOwnership(address newOwner) public virtual onlyOwner {
        if (newOwner == address(0)) revert OwnableInvalidOwner(address(0));
        _transferOwnership(newOwner);
    }

    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}

abstract contract Pausable is Ownable {
    bool private _paused;

    error EnforcedPause();
    error ExpectedPause();

    event Paused(address account);
    event Unpaused(address account);

    modifier whenNotPaused() {
        _requireNotPaused();
        _;
    }

    modifier whenPaused() {
        _requirePaused();
        _;
    }

    function paused() public view virtual returns (bool) {
        return _paused;
    }

    function _requireNotPaused() internal view virtual {
        if (paused()) revert EnforcedPause();
    }

    function _requirePaused() internal view virtual {
        if (!paused()) revert ExpectedPause();
    }

    function pause() public virtual onlyOwner {
        _requireNotPaused();
        _paused = true;
        emit Paused(msg.sender);
    }

    function unpause() public virtual onlyOwner {
        _requirePaused();
        _paused = false;
        emit Unpaused(msg.sender);
    }
}

/**
 * @notice Cryptographic signature utilities for EIP-712 typed data hashing and verification.
 */
library ECDSA {
    error ECDSAInvalidSignature();
    error ECDSAInvalidSignatureLength(uint256 length);
    error ECDSAInvalidSignatureS(bytes32 s);

    function recover(bytes32 hash, uint8 v, bytes32 r, bytes32 s) internal pure returns (address) {
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D57617F1A16388B29DD78B5636184F6) {
            revert ECDSAInvalidSignatureS(s);
        }
        if (v != 27 && v != 28) {
            revert ECDSAInvalidSignature();
        }
        address signer = ecrecover(hash, v, r, s);
        if (signer == address(0)) {
            revert ECDSAInvalidSignature();
        }
        return signer;
    }
}

contract MonadQueuePlatform is ReentrancyGuard, Pausable {

    // --- Enums & Structs ---

    enum PlanType {
        PREPAID_CREDIT,   // Pay-per-claim usage model: credits deducted on each user claim
        SUBSCRIPTION      // Flat recurring model: unlimited claims during active subscription period
    }

    struct Vendor {
        address owner;
        PlanType planType;
        uint256 balance;               // In wei (MON)
        uint256 subscriptionExpiresAt; // Timestamp when subscription expires
        bool isActive;
        uint32 totalQueuesCreated;
        uint32 totalSlotsIssued;
        uint32 totalCheckIns;
    }

    struct Queue {
        uint256 queueId;
        address vendor;
        string title;
        string metadataURI;            // Offchain metadata (IPFS/HTTP): branding, descriptions, images
        uint32 capacity;               // Maximum number of claimable slots
        uint32 claimedCount;           // Number of slots currently claimed
        uint32 checkedInCount;         // Number of slots checked in / redeemed
        uint64 startTime;              // Unix timestamp when queue opens
        uint64 endTime;                // Unix timestamp when queue closes
        uint32 slotDurationSec;        // Duration allocated per booking slot in seconds (0 for open queue)
        bool isActive;                 // Active status controlled by vendor
        uint256 feePerClaim;           // Fee in MON debited from vendor balance per claim (for PREPAID_CREDIT)
    }

    struct SlotTicket {
        uint256 ticketId;
        uint256 queueId;
        address claimant;
        uint32 slotIndex;              // 1-indexed sequential slot position in queue
        uint64 claimedAt;
        bool checkedIn;
        uint64 checkedInAt;
    }

    // --- EIP-712 Typehashes ---

    bytes32 public immutable DOMAIN_SEPARATOR;
    bytes32 public constant CLAIM_TYPEHASH = keccak256(
        "ClaimSlot(uint256 queueId,address claimant,uint256 nonce,uint256 deadline)"
    );
    bytes32 public constant CHECKIN_TYPEHASH = keccak256(
        "CheckIn(uint256 queueId,uint256 ticketId,address scanner,uint256 nonce,uint256 deadline)"
    );

    // --- State Variables ---

    uint256 public nextQueueId = 1;
    uint256 public nextTicketId = 1;

    // Platform configurations & Treasury
    uint256 public platformTreasuryBalance;
    uint256 public platformSubscriptionRatePer30Days = 0.05 ether; // 0.05 MON per 30 days subscription
    uint256 public minPrepaidDeposit = 0.005 ether;               // 0.005 MON minimum initial deposit
    uint256 public defaultPlatformClaimFee = 0.001 ether;         // 0.001 MON per user claim default
    uint256 public lowBalanceThreshold = 0.003 ether;             // Alerts when vendor balance < threshold

    // Mappings
    mapping(address => Vendor) public vendors;
    mapping(uint256 => Queue) public queues;
    mapping(uint256 => SlotTicket) public tickets;

    // queueId => user => hasClaimed (Double-claim prevention)
    mapping(uint256 => mapping(address => bool)) public hasClaimed;

    // queueId => scannerAddress => isAuthorized
    mapping(uint256 => mapping(address => bool)) public isScanner;

    // user => EIP-712 nonce (Replay protection for gasless transactions)
    mapping(address => uint256) public userNonces;

    // --- Events ---

    event VendorRegistered(address indexed vendor, PlanType planType);
    event VendorFunded(address indexed vendor, uint256 amount, uint256 newBalance);
    event VendorSubscribed(address indexed vendor, uint256 durationSec, uint256 newExpiresAt);
    event VendorWithdrawn(address indexed vendor, uint256 amount, uint256 remainingBalance);
    event VendorStatusUpdated(address indexed vendor, bool isActive);
    event VendorBalanceLow(address indexed vendor, uint256 remainingBalance);

    event QueueCreated(
        uint256 indexed queueId,
        address indexed vendor,
        string title,
        uint32 capacity,
        uint64 startTime,
        uint64 endTime
    );
    event QueueStatusUpdated(uint256 indexed queueId, bool isActive);
    event ScannerUpdated(uint256 indexed queueId, address indexed scanner, bool authorized);

    event SlotClaimed(
        uint256 indexed queueId,
        uint256 indexed ticketId,
        address indexed claimant,
        uint32 slotIndex
    );
    event SlotExpired(uint256 indexed queueId, uint256 indexed ticketId);
    event UserCheckedIn(
        uint256 indexed queueId,
        uint256 indexed ticketId,
        address indexed claimant,
        address scanner
    );

    event PlatformFeesWithdrawn(address indexed to, uint256 amount);
    event ConfigUpdated(string param, uint256 value);

    // --- Custom Errors ---

    error VendorNotRegistered();
    error VendorAlreadyRegistered();
    error VendorNotActive();
    error InsufficientVendorBalance(uint256 required, uint256 available);
    error SubscriptionExpired(uint256 expiredAt);
    error InvalidAmount();
    error InvalidTimeWindow();
    error InvalidCapacity();
    error UnauthorizedVendor(address caller);
    error QueueNotActive();
    error QueueNotStarted(uint64 startTime, uint256 currentTime);
    error QueueEnded(uint64 endTime, uint256 currentTime);
    error QueueCapacityReached(uint32 capacity);
    error UserAlreadyClaimed(uint256 queueId, address user);
    error TicketNotFound(uint256 ticketId);
    error TicketAlreadyCheckedIn(uint256 ticketId);
    error TicketQueueMismatch(uint256 ticketQueueId, uint256 targetQueueId);
    error UnauthorizedScanner(address caller);
    error SignatureExpired(uint256 deadline, uint256 currentTime);
    error TransferFailed();
    error ZeroAddress();

    // --- Constructor ---

    constructor() Ownable(msg.sender) {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("MonadQueuePlatform")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    // --- Vendor Onboarding & Funding ---

    /**
     * @notice Registers a new vendor on the platform.
     * @param planType The selected payment model (PREPAID_CREDIT or SUBSCRIPTION).
     */
    function registerVendor(PlanType planType) external payable whenNotPaused {
        if (vendors[msg.sender].owner != address(0)) revert VendorAlreadyRegistered();

        vendors[msg.sender] = Vendor({
            owner: msg.sender,
            planType: planType,
            balance: 0,
            subscriptionExpiresAt: 0,
            isActive: true,
            totalQueuesCreated: 0,
            totalSlotsIssued: 0,
            totalCheckIns: 0
        });

        emit VendorRegistered(msg.sender, planType);

        if (msg.value > 0) {
            if (planType == PlanType.PREPAID_CREDIT) {
                _depositVendorBalance(msg.sender, msg.value);
            } else {
                _subscribeVendor(msg.sender, msg.value);
            }
        }
    }

    /**
     * @notice Deposits funds into vendor prepaid credit balance.
     */
    function depositVendorBalance() external payable whenNotPaused nonReentrant {
        if (msg.value == 0) revert InvalidAmount();
        Vendor storage v = vendors[msg.sender];
        if (v.owner == address(0)) revert VendorNotRegistered();

        _depositVendorBalance(msg.sender, msg.value);
    }

    /**
     * @notice Pay recurring subscription to unlock platform capacity.
     */
    function subscribe() external payable whenNotPaused nonReentrant {
        if (msg.value == 0) revert InvalidAmount();
        Vendor storage v = vendors[msg.sender];
        if (v.owner == address(0)) revert VendorNotRegistered();

        _subscribeVendor(msg.sender, msg.value);
    }

    function _depositVendorBalance(address vendorAddr, uint256 amount) internal {
        Vendor storage v = vendors[vendorAddr];
        v.balance += amount;
        emit VendorFunded(vendorAddr, amount, v.balance);
    }

    function _subscribeVendor(address vendorAddr, uint256 amount) internal {
        Vendor storage v = vendors[vendorAddr];
        // Calculate duration based on subscription rate (rate per 30 days)
        uint256 durationSec = (amount * 30 days) / platformSubscriptionRatePer30Days;
        if (durationSec == 0) revert InvalidAmount();

        uint256 currentExpiry = v.subscriptionExpiresAt;
        if (currentExpiry < block.timestamp) {
            v.subscriptionExpiresAt = block.timestamp + durationSec;
        } else {
            v.subscriptionExpiresAt = currentExpiry + durationSec;
        }

        // Subscription revenue is added directly to platform treasury
        platformTreasuryBalance += amount;

        emit VendorSubscribed(vendorAddr, durationSec, v.subscriptionExpiresAt);
    }

    /**
     * @notice Allows a vendor to withdraw unused prepaid credits.
     * @param amount Amount in wei to withdraw.
     */
    function withdrawUnusedBalance(uint256 amount) external nonReentrant {
        if (amount == 0) revert InvalidAmount();
        Vendor storage v = vendors[msg.sender];
        if (v.owner == address(0)) revert VendorNotRegistered();
        if (v.balance < amount) revert InsufficientVendorBalance(amount, v.balance);

        v.balance -= amount;
        emit VendorWithdrawn(msg.sender, amount, v.balance);

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        if (!success) revert TransferFailed();
    }

    /**
     * @notice Vendor deactivation or reactivation control.
     */
    function setVendorActive(bool active) external {
        Vendor storage v = vendors[msg.sender];
        if (v.owner == address(0)) revert VendorNotRegistered();
        v.isActive = active;
        emit VendorStatusUpdated(msg.sender, active);
    }

    // --- Queue & Slot Inventory Creation ---

    /**
     * @notice Creates a new queue / event booking. Gated on vendor balance or active subscription.
     * @param title Name or label of the queue/event.
     * @param metadataURI Offchain URI containing rich descriptions, branding, terms.
     * @param capacity Maximum number of attendee slots.
     * @param startTime Start timestamp.
     * @param endTime End timestamp.
     * @param slotDurationSec Duration of each slot (0 for fluid / first-come queue).
     * @param feePerClaim Fixed claim debit for prepaid model (0 to use platform default).
     */
    function createQueue(
        string calldata title,
        string calldata metadataURI,
        uint32 capacity,
        uint64 startTime,
        uint64 endTime,
        uint32 slotDurationSec,
        uint256 feePerClaim
    ) external whenNotPaused returns (uint256) {
        Vendor storage v = vendors[msg.sender];
        if (v.owner == address(0)) revert VendorNotRegistered();
        if (!v.isActive) revert VendorNotActive();
        if (capacity == 0) revert InvalidCapacity();
        if (endTime <= startTime || endTime <= block.timestamp) revert InvalidTimeWindow();

        uint256 effectiveFee = feePerClaim == 0 ? defaultPlatformClaimFee : feePerClaim;

        // Balance-gating check:
        if (v.planType == PlanType.PREPAID_CREDIT) {
            // Must have enough balance to support at least 1 slot claim
            if (v.balance < effectiveFee) {
                revert InsufficientVendorBalance(effectiveFee, v.balance);
            }
        } else if (v.planType == PlanType.SUBSCRIPTION) {
            if (v.subscriptionExpiresAt <= block.timestamp) {
                revert SubscriptionExpired(v.subscriptionExpiresAt);
            }
        }

        uint256 queueId = nextQueueId++;
        queues[queueId] = Queue({
            queueId: queueId,
            vendor: msg.sender,
            title: title,
            metadataURI: metadataURI,
            capacity: capacity,
            claimedCount: 0,
            checkedInCount: 0,
            startTime: startTime,
            endTime: endTime,
            slotDurationSec: slotDurationSec,
            isActive: true,
            feePerClaim: effectiveFee
        });

        // Automatically authorize the vendor as a scanner for their own queue
        isScanner[queueId][msg.sender] = true;
        v.totalQueuesCreated++;

        emit QueueCreated(queueId, msg.sender, title, capacity, startTime, endTime);
        return queueId;
    }

    /**
     * @notice Vendor can pause or resume a queue.
     */
    function setQueueActive(uint256 queueId, bool active) external {
        Queue storage q = queues[queueId];
        if (q.vendor != msg.sender && owner() != msg.sender) revert UnauthorizedVendor(msg.sender);
        q.isActive = active;
        emit QueueStatusUpdated(queueId, active);
    }

    /**
     * @notice Vendor delegates scanner authorization to an event staff address.
     */
    function setScanner(uint256 queueId, address scanner, bool authorized) external {
        if (scanner == address(0)) revert ZeroAddress();
        Queue storage q = queues[queueId];
        if (q.vendor != msg.sender) revert UnauthorizedVendor(msg.sender);
        isScanner[queueId][scanner] = authorized;
        emit ScannerUpdated(queueId, scanner, authorized);
    }

    // --- Free User Slot Claim Flow ---

    /**
     * @notice Standard free user claim. End user sends 0 value to claim a slot.
     * @param queueId The queue identifier.
     */
    function claimSlot(uint256 queueId) external whenNotPaused returns (uint256) {
        return _executeClaim(queueId, msg.sender);
    }

    /**
     * @notice Gasless free slot claim via EIP-712 typed signature.
     * @dev Allows relayer / vendor wallet to sponsor the transaction gas on Monad.
     * @param queueId The queue identifier.
     * @param claimant The user who signed the claim request.
     * @param deadline Expiration timestamp for the signature.
     * @param v ECDSA recovery byte.
     * @param r ECDSA signature output.
     * @param s ECDSA signature output.
     */
    function claimSlotWithSig(
        uint256 queueId,
        address claimant,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external whenNotPaused returns (uint256) {
        if (claimant == address(0)) revert ZeroAddress();
        if (block.timestamp > deadline) revert SignatureExpired(deadline, block.timestamp);

        uint256 currentNonce = userNonces[claimant]++;
        bytes32 structHash = keccak256(
            abi.encode(CLAIM_TYPEHASH, queueId, claimant, currentNonce, deadline)
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash)
        );

        address recovered = ECDSA.recover(digest, v, r, s);
        if (recovered != claimant) revert ECDSA.ECDSAInvalidSignature();

        return _executeClaim(queueId, claimant);
    }

    function _executeClaim(uint256 queueId, address claimant) internal returns (uint256) {
        Queue storage q = queues[queueId];
        if (!q.isActive) revert QueueNotActive();
        if (block.timestamp < q.startTime) revert QueueNotStarted(q.startTime, block.timestamp);
        if (block.timestamp > q.endTime) revert QueueEnded(q.endTime, block.timestamp);
        if (q.claimedCount >= q.capacity) revert QueueCapacityReached(q.capacity);
        if (hasClaimed[queueId][claimant]) revert UserAlreadyClaimed(queueId, claimant);

        Vendor storage v = vendors[q.vendor];
        if (!v.isActive) revert VendorNotActive();

        // Vendor usage metering accounting
        if (v.planType == PlanType.PREPAID_CREDIT) {
            uint256 fee = q.feePerClaim;
            if (v.balance < fee) {
                revert InsufficientVendorBalance(fee, v.balance);
            }
            // Debit vendor balance & credit platform treasury
            v.balance -= fee;
            platformTreasuryBalance += fee;

            // Trigger low balance alert event if under threshold
            if (v.balance < lowBalanceThreshold) {
                emit VendorBalanceLow(q.vendor, v.balance);
            }
        } else if (v.planType == PlanType.SUBSCRIPTION) {
            if (v.subscriptionExpiresAt <= block.timestamp) {
                revert SubscriptionExpired(v.subscriptionExpiresAt);
            }
        }

        // Increment queue slots
        uint32 slotIndex = ++q.claimedCount;
        uint256 ticketId = nextTicketId++;

        tickets[ticketId] = SlotTicket({
            ticketId: ticketId,
            queueId: queueId,
            claimant: claimant,
            slotIndex: slotIndex,
            claimedAt: uint64(block.timestamp),
            checkedIn: false,
            checkedInAt: 0
        });

        hasClaimed[queueId][claimant] = true;
        v.totalSlotsIssued++;

        emit SlotClaimed(queueId, ticketId, claimant, slotIndex);
        return ticketId;
    }

    // --- Check-in & Redemption Flow ---

    /**
     * @notice Marks an issued slot as checked in / redeemed.
     * @param queueId The queue identifier.
     * @param ticketId The ticket identifier.
     */
    function checkIn(uint256 queueId, uint256 ticketId) external whenNotPaused {
        _executeCheckIn(queueId, ticketId, msg.sender);
    }

    /**
     * @notice Gasless check-in via authorized scanner's EIP-712 signature.
     */
    function checkInWithSig(
        uint256 queueId,
        uint256 ticketId,
        address scanner,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external whenNotPaused {
        if (scanner == address(0)) revert ZeroAddress();
        if (block.timestamp > deadline) revert SignatureExpired(deadline, block.timestamp);

        uint256 currentNonce = userNonces[scanner]++;
        bytes32 structHash = keccak256(
            abi.encode(CHECKIN_TYPEHASH, queueId, ticketId, scanner, currentNonce, deadline)
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash)
        );

        address recovered = ECDSA.recover(digest, v, r, s);
        if (recovered != scanner) revert ECDSA.ECDSAInvalidSignature();

        _executeCheckIn(queueId, ticketId, scanner);
    }

    function _executeCheckIn(uint256 queueId, uint256 ticketId, address scanner) internal {
        Queue storage q = queues[queueId];
        if (scanner != q.vendor && !isScanner[queueId][scanner] && scanner != owner()) {
            revert UnauthorizedScanner(scanner);
        }

        SlotTicket storage t = tickets[ticketId];
        if (t.ticketId == 0) revert TicketNotFound(ticketId);
        if (t.queueId != queueId) revert TicketQueueMismatch(t.queueId, queueId);
        if (t.checkedIn) revert TicketAlreadyCheckedIn(ticketId);

        t.checkedIn = true;
        t.checkedInAt = uint64(block.timestamp);
        q.checkedInCount++;

        Vendor storage v = vendors[q.vendor];
        v.totalCheckIns++;

        emit UserCheckedIn(queueId, ticketId, t.claimant, scanner);
    }

    // --- Platform Treasury & Admin Controls ---

    /**
     * @notice Withdraw accumulated platform fees to the designated recipient.
     */
    function withdrawPlatformFees(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0 || amount > platformTreasuryBalance) revert InvalidAmount();

        platformTreasuryBalance -= amount;
        emit PlatformFeesWithdrawn(to, amount);

        (bool success, ) = payable(to).call{value: amount}("");
        if (!success) revert TransferFailed();
    }

    function setPlatformSubscriptionRate(uint256 ratePer30Days) external onlyOwner {
        platformSubscriptionRatePer30Days = ratePer30Days;
        emit ConfigUpdated("subscriptionRate", ratePer30Days);
    }

    function setDefaultPlatformClaimFee(uint256 fee) external onlyOwner {
        defaultPlatformClaimFee = fee;
        emit ConfigUpdated("defaultClaimFee", fee);
    }

    function setLowBalanceThreshold(uint256 threshold) external onlyOwner {
        lowBalanceThreshold = threshold;
        emit ConfigUpdated("lowBalanceThreshold", threshold);
    }

    // --- View Functions ---

    function getQueue(uint256 queueId) external view returns (Queue memory) {
        return queues[queueId];
    }

    function getTicket(uint256 ticketId) external view returns (SlotTicket memory) {
        return tickets[ticketId];
    }

    function getVendor(address vendorAddr) external view returns (Vendor memory) {
        return vendors[vendorAddr];
    }

    function isVendorActive(address vendorAddr) external view returns (bool) {
        Vendor memory v = vendors[vendorAddr];
        if (!v.isActive) return false;
        if (v.planType == PlanType.SUBSCRIPTION) {
            return v.subscriptionExpiresAt > block.timestamp;
        }
        return v.balance > 0;
    }

    function isUserEligibleToClaim(uint256 queueId, address user) external view returns (bool, string memory) {
        Queue memory q = queues[queueId];
        if (!q.isActive) return (false, "Queue inactive");
        if (block.timestamp < q.startTime) return (false, "Queue not started");
        if (block.timestamp > q.endTime) return (false, "Queue ended");
        if (q.claimedCount >= q.capacity) return (false, "Queue full");
        if (hasClaimed[queueId][user]) return (false, "Already claimed");

        Vendor memory v = vendors[q.vendor];
        if (!v.isActive) return (false, "Vendor inactive");
        if (v.planType == PlanType.PREPAID_CREDIT && v.balance < q.feePerClaim) {
            return (false, "Vendor balance insufficient");
        }
        if (v.planType == PlanType.SUBSCRIPTION && v.subscriptionExpiresAt <= block.timestamp) {
            return (false, "Vendor subscription expired");
        }
        return (true, "Eligible");
    }
}
