// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {MockERC20} from "./MockERC20.sol";

/// @notice ERC20 that skims a fee on every transfer, so the recipient is credited less than the
/// requested amount. Used to prove the controller's balance-delta funding check rejects
/// non-standard tokens even if one slips past the allowlist.
contract MockFeeOnTransferERC20 is MockERC20 {
    uint256 public immutable feeBps;

    constructor(uint256 _feeBps) MockERC20("FeeToken", "FEE", 18) {
        feeBps = _feeBps;
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        uint256 fee = (amount * feeBps) / 10_000;
        _transfer(msg.sender, address(0xdead), fee);
        _transfer(msg.sender, to, amount - fee);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "ERC20: allowance");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        uint256 fee = (amount * feeBps) / 10_000;
        _transfer(from, address(0xdead), fee);
        _transfer(from, to, amount - fee);
        return true;
    }
}
