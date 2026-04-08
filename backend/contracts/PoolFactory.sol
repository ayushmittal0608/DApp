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
        activePool = address(newPool);
        emit ActivePoolChanged(previous, activePool);
        emit PoolCreated(address(newPool));
    }

    function getPools() external view returns (address[] memory) {
        return pools;
    }

    function setActivePool(address _pool) external {
        require(isPool[_pool], "Not a pool");

        if (activePool != address(0)) {
            Pool(activePool).deactivate(); 
        }

        activePool = _pool;
        Pool(_pool).activate();           

        emit ActivePoolChanged(activePool, _pool);
    }
}
