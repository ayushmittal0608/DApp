// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.19;

interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract Pool {
    address public owner;

    bool public isActive;
    bool public isInitialized;

    address[] public assets;
    uint256 public fee;
    uint256 public initialPrice;
    string public kernelType;
    
    uint256 public tvl;
    uint256 public volume24h;
    uint256 public apr;

    mapping(address => uint256) public userUsdcDeposit;
    mapping(address => uint256) public userNfsDeposit;
    mapping(address => bool) public authorizedUsers;


    event PoolInitialized(
        address[] assets,
        uint256 fee,
        uint256 initialPrice,
        string kernelType
    );
    event LiquidityAdded(address indexed provider, uint256 usdcAmount, uint256 nfsAmount);
    event LiquidityRemoved(address indexed provider, uint256 usdcAmount, uint256 nfsAmount);
    event Swap(
        address indexed sender,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 minAmountOut,
        uint256 slippageBps
    );
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    modifier onlyAuthorized() {
        require(authorizedUsers[msg.sender], "Not authorized");
        _;
    }

    modifier isInit() {
        require(isInitialized, "Pool not initialized");
        _;
    }

    modifier notInitialized() {
        require(!isInitialized, "Pool is already initialized");
        _;
    }

    constructor(address _owner) {
        owner = _owner;
        authorizedUsers[_owner] = true;
    }

    function addAuthorizedUser(address _user) external onlyOwner {
        require(_user != address(0), "Invalid user address");
        authorizedUsers[_user] = true;
    }

    function removeAuthorizedUser(address _user) external onlyOwner {
        authorizedUsers[_user] = false;
    }

    function isAuthorized(address _user) external view returns (bool) {
        return authorizedUsers[_user];
    }

    function initializePool(
        address[] memory _assets,
        uint256 _fees,
        uint256 _initialPrice,
        string calldata _kernelType
    ) external notInitialized {
        require(_assets.length == 2, "Exactly two assets are required");
        require(_fees > 0, "Fee must be greater than zero");
        require(_initialPrice > 0, "Initial price must be greater than zero");
        require(bytes(_kernelType).length > 0, "Kernel type is required");

        assets = _assets;
        fee = _fees;
        initialPrice = _initialPrice;
        kernelType = _kernelType;
        isInitialized = true;

        tvl = 0; 
        volume24h = 0;
        apr = 0;

        emit PoolInitialized(_assets, _fees, _initialPrice, _kernelType);
    }

    function activate() external {
        isActive = true;
    }

    function deactivate() external {
        isActive = false;
    }

    function mint(uint256 _usdcAmount, uint256 _nfsAmount) external isInit onlyAuthorized {
        require(isActive, "Pool not active");
        require(_usdcAmount > 0 || _nfsAmount > 0, "Amount must be > 0");

        if (_usdcAmount > 0) {
            IERC20(assets[0]).transferFrom(msg.sender, address(this), _usdcAmount);
            userUsdcDeposit[msg.sender] += _usdcAmount;
        }

        if (_nfsAmount > 0) {
            IERC20(assets[1]).transferFrom(msg.sender, address(this), _nfsAmount);
            userNfsDeposit[msg.sender] += _nfsAmount;
        }

        tvl += (_usdcAmount * 1e12 + (_nfsAmount * initialPrice / 1e18)); 

        emit LiquidityAdded(msg.sender, _usdcAmount, _nfsAmount);
    }

    function burn(uint256 _usdcAmount, uint256 _nfsAmount) external isInit onlyAuthorized {
        require(_usdcAmount > 0 || _nfsAmount > 0, "Amount must be > 0");
        require(userUsdcDeposit[msg.sender] >= _usdcAmount, "Insufficient USDC balance");
        require(userNfsDeposit[msg.sender] >= _nfsAmount, "Insufficient NFS balance");

        if (_usdcAmount > 0) {
            userUsdcDeposit[msg.sender] -= _usdcAmount;
            IERC20(assets[0]).transfer(msg.sender, _usdcAmount);
        }

        if (_nfsAmount > 0) {
            userNfsDeposit[msg.sender] -= _nfsAmount;
            IERC20(assets[1]).transfer(msg.sender, _nfsAmount);
        }

        uint256 valueRemoved = (_usdcAmount * 1e12) + (_nfsAmount * initialPrice / 1e18);
        
        if (tvl >= valueRemoved) {
            tvl -= valueRemoved;
        } else {
            tvl = 0; 
        }

        emit LiquidityRemoved(msg.sender, _usdcAmount, _nfsAmount);
    }

    function swap(
        address tokenIn,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 slippageBps
    ) external isInit onlyAuthorized {
        require(isActive, "Pool not active");
        require(amountIn > 0, "Amount must be > 0");
        require(tokenIn == assets[0] || tokenIn == assets[1], "Invalid token");
        require(fee <= 1_000_000, "Fee too large");

        address tokenOut = tokenIn == assets[0] ? assets[1] : assets[0];

        uint256 reserveIn = IERC20(tokenIn).balanceOf(address(this));
        uint256 reserveOut = IERC20(tokenOut).balanceOf(address(this));
        require(reserveIn > 0 && reserveOut > 0, "Insufficient liquidity");

        uint256 amountInWithFee = (amountIn * (1_000_000 - fee)) / 1_000_000;
        uint256 amountOut = (amountInWithFee * reserveOut) / (reserveIn + amountInWithFee);
        require(amountOut > 0 && amountOut < reserveOut, "Insufficient output");
        require(amountOut >= minAmountOut, "Slippage exceeded");

        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenOut).transfer(msg.sender, amountOut);

        emit Swap(msg.sender, tokenIn, tokenOut, amountIn, amountOut, minAmountOut, slippageBps);
    }

    function getPoolDetails() external view returns (
        address[] memory,
        uint256,
        uint256,
        string memory,
        uint256,
        uint256,
        uint256
    ) {
        return (assets, fee, initialPrice, kernelType, tvl, volume24h, apr);
    }

    function updateMetrics(uint256 _tvl, uint256 _volume, uint256 _apr) external onlyOwner {
        tvl = _tvl;
        volume24h = _volume;
        apr = _apr;
    }

}
