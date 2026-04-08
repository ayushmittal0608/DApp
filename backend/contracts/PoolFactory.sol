// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.19;

import './Pool.sol';

contract PoolFactory {
    address public owner;
    address[] public pools;
    address public activePool;
    mapping(address => bool) public isPool;

    event PoolCreated(address indexed poolAddress);
    event ActivePoolChanged(address indexed previousPool, address indexed newPool);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "New owner is the zero address");
        owner = newOwner;
    }

    constructor() {
        owner = msg.sender;
    }

    function createPool() external onlyOwner {
        Pool newPool = new Pool(msg.sender);
        pools.push(address(newPool));
        isPool[address(newPool)] = true;

        address previous = activePool;
        if (previous != address(0)) {
            Pool(previous).deactivate();
        }

        activePool = address(newPool);
        Pool(activePool).activate();

        emit ActivePoolChanged(previous, activePool);
        emit PoolCreated(address(newPool));
    }

    function getPools() external view returns (address[] memory) {
        return pools;
    }

    function setActivePool(address _pool) external {
        require(isPool[_pool], "Not a pool");

        address previous = activePool;
        if (previous != address(0)) {
            Pool(previous).deactivate();
        }

        activePool = _pool;
        Pool(_pool).activate();

        emit ActivePoolChanged(previous, _pool);
    }
}
