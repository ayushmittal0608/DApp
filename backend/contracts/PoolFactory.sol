// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.19;

import './Pool.sol';

contract PoolFactory {
    address public owner;
    address[] public pools;
    address public activePool;
    mapping(address => bool) public isPool;

    event PoolCreated(address indexed poolAddress, address[] assets, uint256 fee, uint256 initialPrice, string kernelType);
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

    function createPool(
        address[] memory _assets,
        uint256 _fee,
        uint256 _initialPrice,
        string calldata _kernelType
    ) external {
        Pool newPool = new Pool(msg.sender, _assets, _fee, _initialPrice, _kernelType);
        pools.push(address(newPool));
        isPool[address(newPool)] = true;
        address previous = activePool;
        activePool = address(newPool);
        emit ActivePoolChanged(previous, activePool);
        emit PoolCreated(address(newPool), _assets, _fee, _initialPrice, _kernelType);
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
