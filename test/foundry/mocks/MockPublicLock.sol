// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

/// @notice Minimal Unlock PublicLock stand-in exposing only what the rewards controller reads:
/// `balanceOf` (valid-key count), `totalSupply`, and `isLockManager`. All settable by tests.
contract MockPublicLock {
    mapping(address => uint256) private _balance;
    mapping(address => bool) private _manager;
    uint256 private _totalSupply;

    function setBalance(address account, uint256 value) external {
        _balance[account] = value;
    }

    function setManager(address account, bool isMgr) external {
        _manager[account] = isMgr;
    }

    function setTotalSupply(uint256 value) external {
        _totalSupply = value;
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balance[account];
    }

    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }

    function isLockManager(address account) external view returns (bool) {
        return _manager[account];
    }
}
