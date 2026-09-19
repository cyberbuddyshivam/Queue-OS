// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "../src/MonadQueuePlatform.sol";

// Minimal Script harness compatible with Foundry
abstract contract Script {
    address internal constant VM_ADDRESS = address(uint160(uint256(keccak256("hevm cheat code"))));

    function vm_startBroadcast() internal {
        (bool s, ) = VM_ADDRESS.call(abi.encodeWithSignature("startBroadcast()"));
        require(s, "broadcast failed");
    }

    function vm_stopBroadcast() internal {
        (bool s, ) = VM_ADDRESS.call(abi.encodeWithSignature("stopBroadcast()"));
        require(s, "stop broadcast failed");
    }
}

contract DeployMonadQueuePlatform is Script {
    function run() external returns (MonadQueuePlatform platform) {
        vm_startBroadcast();
        platform = new MonadQueuePlatform();
        vm_stopBroadcast();
    }
}
