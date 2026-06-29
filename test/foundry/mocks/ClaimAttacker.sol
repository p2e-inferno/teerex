// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

interface IClaimable {
    function claim(uint256 poolId, uint16 placement) external;
}

/// @notice Winner-controlled contract used to exercise the native-payout edge cases: an ETH
/// rejection (drives `NativeTransferFailed`) and a reentrant re-claim (must be blocked by the
/// nonReentrant guard, so no double payout is possible).
contract ClaimAttacker {
    IClaimable public immutable controller;
    uint256 public poolId;
    bool public reenter;
    uint16 public reenterPlacement;
    bool public acceptEther;

    constructor(address _controller) {
        controller = IClaimable(_controller);
    }

    function configure(uint256 _poolId, bool _reenter, uint16 _reenterPlacement, bool _acceptEther) external {
        poolId = _poolId;
        reenter = _reenter;
        reenterPlacement = _reenterPlacement;
        acceptEther = _acceptEther;
    }

    function doClaim(uint16 placement) external {
        controller.claim(poolId, placement);
    }

    receive() external payable {
        if (reenter) {
            controller.claim(poolId, reenterPlacement);
        } else if (!acceptEther) {
            revert("reject ether");
        }
    }
}
