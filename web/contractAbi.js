// MonadQueuePlatform ABI and Constants for Monad Testnet
export const MONAD_TESTNET_CHAIN_ID = 10143;
export const MONAD_TESTNET_RPC = "https://testnet-rpc.monad.xyz";
export const MONAD_EXPLORER = "https://testnet.monadscan.com";

// Default placeholder for local testing / testnet deployment
export const CONTRACT_ADDRESS = "0x89C1aB1358362615469E022c07452d3eb03a54C8";

export const CONTRACT_ABI = [
  "function registerVendor(uint8 planType) external payable",
  "function depositVendorBalance() external payable",
  "function subscribe() external payable",
  "function withdrawUnusedBalance(uint256 amount) external",
  "function setVendorActive(bool active) external",
  "function createQueue(string title, string metadataURI, uint32 capacity, uint64 startTime, uint64 endTime, uint32 slotDurationSec, uint256 feePerClaim) external returns (uint256)",
  "function setQueueActive(uint256 queueId, bool active) external",
  "function setScanner(uint256 queueId, address scanner, bool authorized) external",
  "function claimSlot(uint256 queueId) external returns (uint256)",
  "function claimSlotWithSig(uint256 queueId, address claimant, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external returns (uint256)",
  "function checkIn(uint256 queueId, uint256 ticketId) external",
  "function checkInWithSig(uint256 queueId, uint256 ticketId, address scanner, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external",
  "function withdrawPlatformFees(address to, uint256 amount) external",
  "function getQueue(uint256 queueId) external view returns (tuple(uint256 queueId, address vendor, string title, string metadataURI, uint32 capacity, uint32 claimedCount, uint32 checkedInCount, uint64 startTime, uint64 endTime, uint32 slotDurationSec, bool isActive, uint256 feePerClaim))",
  "function getTicket(uint256 ticketId) external view returns (tuple(uint256 ticketId, uint256 queueId, address claimant, uint32 slotIndex, uint64 claimedAt, bool checkedIn, uint64 checkedInAt))",
  "function getVendor(address vendorAddr) external view returns (tuple(address owner, uint8 planType, uint256 balance, uint256 subscriptionExpiresAt, bool isActive, uint32 totalQueuesCreated, uint32 totalSlotsIssued, uint32 totalCheckIns))",
  "function isVendorActive(address vendorAddr) external view returns (bool)",
  "function isUserEligibleToClaim(uint256 queueId, address user) external view returns (bool, string memory)",
  "function userNonces(address user) external view returns (uint256)",
  "function DOMAIN_SEPARATOR() external view returns (bytes32)",
  "function platformTreasuryBalance() external view returns (uint256)",
  "event VendorRegistered(address indexed vendor, uint8 planType)",
  "event VendorFunded(address indexed vendor, uint256 amount, uint256 newBalance)",
  "event VendorSubscribed(address indexed vendor, uint256 durationSec, uint256 newExpiresAt)",
  "event VendorWithdrawn(address indexed vendor, uint256 amount, uint256 remainingBalance)",
  "event VendorBalanceLow(address indexed vendor, uint256 remainingBalance)",
  "event QueueCreated(uint256 indexed queueId, address indexed vendor, string title, uint32 capacity, uint64 startTime, uint64 endTime)",
  "event SlotClaimed(uint256 indexed queueId, uint256 indexed ticketId, address indexed claimant, uint32 slotIndex)",
  "event UserCheckedIn(uint256 indexed queueId, uint256 indexed ticketId, address indexed claimant, address scanner)"
];
