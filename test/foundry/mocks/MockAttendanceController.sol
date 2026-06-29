// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

/// @notice Stand-in for TeeRexAttendanceControllerV1's `eventConfigByLock` getter. Only the four
/// leading status flags the rewards controller decodes are modeled; trailing fields are omitted.
contract MockAttendanceController {
    struct Config {
        bool exists;
        bool managerReleased;
        bool cancelInitiated;
        bool refundComplete;
    }

    mapping(address => Config) private _config;

    function setConfig(
        address lock,
        bool exists,
        bool managerReleased,
        bool cancelInitiated,
        bool refundComplete
    ) external {
        _config[lock] = Config(exists, managerReleased, cancelInitiated, refundComplete);
    }

    function eventConfigByLock(address lock)
        external
        view
        returns (bool exists, bool managerReleased, bool cancelInitiated, bool refundComplete)
    {
        Config memory c = _config[lock];
        return (c.exists, c.managerReleased, c.cancelInitiated, c.refundComplete);
    }
}
