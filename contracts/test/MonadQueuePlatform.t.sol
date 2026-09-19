// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "../src/MonadQueuePlatform.sol";

// Minimal self-contained Foundry-compatible test harness
abstract contract Test {
    address internal constant VM_ADDRESS = address(uint160(uint256(keccak256("hevm cheat code"))));

    modifier prank(address caller) {
        (bool s, ) = VM_ADDRESS.call(abi.encodeWithSignature("prank(address)", caller));
        require(s, "prank failed");
        _;
    }

    function deal(address to, uint256 amount) internal {
        (bool s, ) = VM_ADDRESS.call(abi.encodeWithSignature("deal(address,uint256)", to, amount));
        require(s, "deal failed");
    }

    function warp(uint256 timestamp) internal {
        (bool s, ) = VM_ADDRESS.call(abi.encodeWithSignature("warp(uint256)", timestamp));
        require(s, "warp failed");
    }

    function expectRevert() internal {
        (bool s, ) = VM_ADDRESS.call(abi.encodeWithSignature("expectRevert()"));
        require(s, "expectRevert failed");
    }

    function expectRevert(bytes4 customError) internal {
        (bool s, ) = VM_ADDRESS.call(abi.encodeWithSignature("expectRevert(bytes4)", customError));
        require(s, "expectRevert custom error failed");
    }

    function assertEq(uint256 a, uint256 b, string memory err) internal pure {
        require(a == b, err);
    }

    function assertEq(address a, address b, string memory err) internal pure {
        require(a == b, err);
    }

    function assertTrue(bool a, string memory err) internal pure {
        require(a, err);
    }

    function assertFalse(bool a, string memory err) internal pure {
        require(!a, err);
    }
}

contract MonadQueuePlatformTest is Test {
    MonadQueuePlatform public platform;

    address public platformOwner = address(0xAA);
    address public vendor1 = address(0xBB);
    address public vendor2 = address(0xBC);
    address public user1 = address(0xCC);
    address public user2 = address(0xCD);
    address public scanner1 = address(0xDD);
    address public relayer = address(0xEE);

    uint256 internal userPrivateKey = 0xA11CE;
    address internal userSigner;

    event VendorRegistered(address indexed vendor, MonadQueuePlatform.PlanType planType);
    event VendorFunded(address indexed vendor, uint256 amount, uint256 newBalance);
    event SlotClaimed(uint256 indexed queueId, uint256 indexed ticketId, address indexed claimant, uint32 slotIndex);
    event VendorBalanceLow(address indexed vendor, uint256 remainingBalance);
    event UserCheckedIn(uint256 indexed queueId, uint256 indexed ticketId, address indexed claimant, address scanner);

    function setUp() public {
        deal(platformOwner, 10 ether);
        deal(vendor1, 10 ether);
        deal(vendor2, 10 ether);
        deal(user1, 10 ether);
        deal(user2, 10 ether);
        deal(relayer, 10 ether);

        // Derive address for userSigner from userPrivateKey
        userSigner = vm_addr(userPrivateKey);
        deal(userSigner, 1 ether);

        // Deploy platform as platformOwner
        (bool s, ) = VM_ADDRESS.call(abi.encodeWithSignature("prank(address)", platformOwner));
        require(s, "setup prank failed");
        platform = new MonadQueuePlatform();
    }

    function vm_addr(uint256 pk) internal returns (address) {
        (bool s, bytes memory ret) = VM_ADDRESS.call(abi.encodeWithSignature("addr(uint256)", pk));
        if (s && ret.length == 32) {
            return abi.decode(ret, (address));
        }
        return address(0x999);
    }

    function vm_sign(uint256 pk, bytes32 digest) internal returns (uint8 v, bytes32 r, bytes32 s) {
        (bool success, bytes memory ret) = VM_ADDRESS.call(
            abi.encodeWithSignature("sign(uint256,bytes32)", pk, digest)
        );
        require(success, "vm_sign failed");
        return abi.decode(ret, (uint8, bytes32, bytes32));
    }

    // --- Invariant Test 1: Balance Gating ---

    function test_BalanceGating_CannotCreateQueueWithoutFunds() public {
        // Register vendor1 with PREPAID_CREDIT plan, but 0 balance
        (bool s, ) = VM_ADDRESS.call(abi.encodeWithSignature("prank(address)", vendor1));
        require(s, "prank failed");
        platform.registerVendor(MonadQueuePlatform.PlanType.PREPAID_CREDIT);

        uint64 startTime = uint64(block.timestamp + 100);
        uint64 endTime = uint64(block.timestamp + 1000);

        // Expect revert when creating queue because balance is 0
        (s, ) = VM_ADDRESS.call(abi.encodeWithSignature("prank(address)", vendor1));
        require(s, "prank failed");
        expectRevert(MonadQueuePlatform.InsufficientVendorBalance.selector);
        platform.createQueue("Tech Conference Queue", "ipfs://meta1", 50, startTime, endTime, 60, 0.001 ether);
    }

    function test_BalanceGating_SuccessWithFunds() public {
        // Register and deposit 1 MON
        (bool s, ) = VM_ADDRESS.call(abi.encodeWithSignature("prank(address)", vendor1));
        require(s, "prank failed");
        platform.registerVendor{value: 1 ether}(MonadQueuePlatform.PlanType.PREPAID_CREDIT);

        uint64 startTime = uint64(block.timestamp + 100);
        uint64 endTime = uint64(block.timestamp + 1000);

        (s, ) = VM_ADDRESS.call(abi.encodeWithSignature("prank(address)", vendor1));
        require(s, "prank failed");
        uint256 qId = platform.createQueue("Tech Conference Queue", "ipfs://meta1", 50, startTime, endTime, 60, 0.001 ether);

        assertEq(qId, 1, "Queue ID should be 1");
        MonadQueuePlatform.Queue memory q = platform.getQueue(qId);
        assertEq(q.capacity, 50, "Capacity should match");
        assertEq(q.vendor, vendor1, "Vendor should match");
    }

    // --- Invariant Test 2: Usage Metering Accuracy ---

    function test_UsageMetering_DeductsVendorBalancePerClaim() public {
        // Vendor deposits 0.01 ether (10 claims at 0.001 ether)
        (bool s, ) = VM_ADDRESS.call(abi.encodeWithSignature("prank(address)", vendor1));
        require(s, "prank failed");
        platform.registerVendor{value: 0.01 ether}(MonadQueuePlatform.PlanType.PREPAID_CREDIT);

        uint64 startTime = uint64(block.timestamp);
        uint64 endTime = uint64(block.timestamp + 1000);

        (s, ) = VM_ADDRESS.call(abi.encodeWithSignature("prank(address)", vendor1));
        require(s, "prank failed");
        uint256 qId = platform.createQueue("Workshop", "ipfs://meta2", 10, startTime, endTime, 0, 0.001 ether);

        // User1 claims slot for FREE (0 MON)
        (s, ) = VM_ADDRESS.call(abi.encodeWithSignature("prank(address)", user1));
        require(s, "prank failed");
        uint256 ticketId = platform.claimSlot(qId);

        assertEq(ticketId, 1, "Ticket ID should be 1");

        // Verify vendor balance decremented exactly by 0.001 ether
        MonadQueuePlatform.Vendor memory v = platform.getVendor(vendor1);
        assertEq(v.balance, 0.01 ether - 0.001 ether, "Vendor balance should decrease by 0.001 ether");
        assertEq(v.totalSlotsIssued, 1, "Vendor totalSlotsIssued should be 1");

        // Verify platform treasury increased
        assertEq(platform.platformTreasuryBalance(), 0.001 ether, "Treasury should receive fee");
    }

    // --- Invariant Test 3: Double-Claim Prevention ---

    function test_DoubleClaimPrevention() public {
        (bool s, ) = VM_ADDRESS.call(abi.encodeWithSignature("prank(address)", vendor1));
        require(s, "prank failed");
        platform.registerVendor{value: 1 ether}(MonadQueuePlatform.PlanType.PREPAID_CREDIT);

        uint64 startTime = uint64(block.timestamp);
        uint64 endTime = uint64(block.timestamp + 1000);

        (s, ) = VM_ADDRESS.call(abi.encodeWithSignature("prank(address)", vendor1));
        require(s, "prank failed");
        uint256 qId = platform.createQueue("Festival", "ipfs://meta3", 100, startTime, endTime, 0, 0.001 ether);

        // User1 claims first slot successfully
        (s, ) = VM_ADDRESS.call(abi.encodeWithSignature("prank(address)", user1));
        require(s, "prank failed");
        platform.claimSlot(qId);

        // User1 attempts to claim again on the same queue -> Revert!
        (s, ) = VM_ADDRESS.call(abi.encodeWithSignature("prank(address)", user1));
        require(s, "prank failed");
        expectRevert(MonadQueuePlatform.UserAlreadyClaimed.selector);
        platform.claimSlot(qId);
    }

    // --- Invariant Test 4: Capacity Limit Enforcement ---

    function test_CapacityLimitEnforcement() public {
        (bool s, ) = VM_ADDRESS.call(abi.encodeWithSignature("prank(address)", vendor1));
        require(s, "prank failed");
        platform.registerVendor{value: 1 ether}(MonadQueuePlatform.PlanType.PREPAID_CREDIT);

        uint64 startTime = uint64(block.timestamp);
        uint64 endTime = uint64(block.timestamp + 1000);

        // Queue with capacity of 1
        (s, ) = VM_ADDRESS.call(abi.encodeWithSignature("prank(address)", vendor1));
        require(s, "prank failed");
        uint256 qId = platform.createQueue("VIP Lounge", "ipfs://vip", 1, startTime, endTime, 0, 0.001 ether);

        // User1 claims the only slot
        (s, ) = VM_ADDRESS.call(abi.encodeWithSignature("prank(address)", user1));
        require(s, "prank failed");
        platform.claimSlot(qId);

        // User2 attempts to claim -> Revert: QueueCapacityReached
        (s, ) = VM_ADDRESS.call(abi.encodeWithSignature("prank(address)", user2));
        require(s, "prank failed");
        expectRevert(MonadQueuePlatform.QueueCapacityReached.selector);
        platform.claimSlot(qId);
    }

    // --- Invariant Test 5: Vendor Withdrawal Permissions ---

    function test_VendorWithdrawalPermissions() public {
        (bool s, ) = VM_ADDRESS.call(abi.encodeWithSignature("prank(address)", vendor1));
        require(s, "prank failed");
        platform.registerVendor{value: 2 ether}(MonadQueuePlatform.PlanType.PREPAID_CREDIT);

        // Non-owner (user1) attempts to withdraw -> Revert
        (bool s2, ) = VM_ADDRESS.call(abi.encodeWithSignature("prank(address)", user1));
        require(s2, "prank failed");
        expectRevert(MonadQueuePlatform.VendorNotRegistered.selector);
        platform.withdrawUnusedBalance(1 ether);

        // Vendor1 withdraws 1 ether
        uint256 balBefore = vendor1.balance;
        (s, ) = VM_ADDRESS.call(abi.encodeWithSignature("prank(address)", vendor1));
        require(s, "prank failed");
        platform.withdrawUnusedBalance(1 ether);

        assertEq(vendor1.balance, balBefore + 1 ether, "Vendor should receive withdrawn MON");
        MonadQueuePlatform.Vendor memory v = platform.getVendor(vendor1);
        assertEq(v.balance, 1 ether, "Vendor contract balance should be 1 ether");

        // Vendor attempts to withdraw more than remaining balance -> Revert
        (s, ) = VM_ADDRESS.call(abi.encodeWithSignature("prank(address)", vendor1));
        require(s, "prank failed");
        expectRevert(MonadQueuePlatform.InsufficientVendorBalance.selector);
        platform.withdrawUnusedBalance(2 ether);
    }

    // --- Check-in & Scanner Authorization Test ---

    function test_CheckIn_Redemption() public {
        (bool s, ) = VM_ADDRESS.call(abi.encodeWithSignature("prank(address)", vendor1));
        require(s, "prank failed");
        platform.registerVendor{value: 1 ether}(MonadQueuePlatform.PlanType.PREPAID_CREDIT);

        uint64 startTime = uint64(block.timestamp);
        uint64 endTime = uint64(block.timestamp + 1000);

        (s, ) = VM_ADDRESS.call(abi.encodeWithSignature("prank(address)", vendor1));
        require(s, "prank failed");
        uint256 qId = platform.createQueue("Exhibition", "ipfs://ex", 10, startTime, endTime, 0, 0.001 ether);

        // Authorize scanner1
        (s, ) = VM_ADDRESS.call(abi.encodeWithSignature("prank(address)", vendor1));
        require(s, "prank failed");
        platform.setScanner(qId, scanner1, true);

        // User1 claims slot
        (s, ) = VM_ADDRESS.call(abi.encodeWithSignature("prank(address)", user1));
        require(s, "prank failed");
        uint256 ticketId = platform.claimSlot(qId);

        // Unauthorized user2 attempts to check in ticket -> Revert
        (s, ) = VM_ADDRESS.call(abi.encodeWithSignature("prank(address)", user2));
        require(s, "prank failed");
        expectRevert(MonadQueuePlatform.UnauthorizedScanner.selector);
        platform.checkIn(qId, ticketId);

        // Authorized scanner1 checks in ticket -> Success
        (s, ) = VM_ADDRESS.call(abi.encodeWithSignature("prank(address)", scanner1));
        require(s, "prank failed");
        platform.checkIn(qId, ticketId);

        MonadQueuePlatform.SlotTicket memory t = platform.getTicket(ticketId);
        assertTrue(t.checkedIn, "Ticket should be marked checked in");
        assertTrue(t.checkedInAt > 0, "Check in timestamp should be set");

        // Double check-in -> Revert
        (s, ) = VM_ADDRESS.call(abi.encodeWithSignature("prank(address)", scanner1));
        require(s, "prank failed");
        expectRevert(MonadQueuePlatform.TicketAlreadyCheckedIn.selector);
        platform.checkIn(qId, ticketId);
    }
}
