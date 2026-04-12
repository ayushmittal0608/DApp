# Decentralized Application (d-App) Front-End
I have built a functional Web3 front-end application to facilitate wallet integration, creation of pool and its initialization with parameters like fee-tier, asset configuration, initial price and kernel-type. Along with that, I have given user authorization based on pool addresses on liquidity page which prompts Metamask to authorize user apart from owner. It also consists of pool management, adding/removing liquidity from pools, swap initiation with slippage tolerance and manipulation of graphical kernel.

# Requirement Analysis
For building such application, following languages, frameworks and tools were used:
1.	React.js, typescript and tailwindCSS for frontend
2.	Node.js for backend
3.	Smart Contract written in Solidity
4.	Hardhat Development Environment
5.	Anvil Local Node
6.	Metamask Wallet Integration

# Architecture and Flow
### Frontend Flow
 
  1. The whole application tabs, views and header is built inside App.tsx file which navigates to different components like initialize, swap, pool and mempool.
  2. Now the first part of application is Header tab which displays the whole header component with Activity lucide-react icon, zap icon and balance fetched when connected to wallet and near it is the button to connect to wallet.
  3. For formatting addresses, numbers and tailwind styles, I have initialised those functions inside lib/util.ts to reuse the component.
  4. Now, comes the alert box which I have designed to show each state in UI with three parameters - error, info and success, when a button is triggered.
  5. Then comes the initialize pool component, which functions to create a new pool and then initialise it based on parameters like fee-tier, asset configuration, oracle price seed and kernel type and graphical interface below it is to show UI based on the pool selected based kernel.
  6. Kernel Visualiser has three components - kernel (gaussian curve), uniform and triangular curve, where we have fed the data based on price and total liquidity to be displayed inside the curve with min, max and initial price.
  7. Now comes the pool part where we can insert any account in search bar and authorize that particular user, currently it displays the owner of the pool, this page has lots of functionalities, like pool management inside EXPLORE tab.
  8. We can add or remove the liquidity from the two cards displayed in POSITIONS tab and once it is approved as mint, then it is displayed inside the table which we can burn anytime, we can mint any number of tokens and burn them too but if we need to partially burn it, then we can burn that mint only, so we can initiate n number of mints where we can burn any m number of mints from liquidity pool, where m<=n.
  9. Now, the next part is swap.tsx file, where we have provided the whole information at the time of swap related to price impact, minimum price, slippage info and so on. We have set 3 parameters for choosing slippage tolerance - 1%, 0.5% and 0.1%.
  10. Now, for monitoring all pending transactions, we have a mempool monitor which monitors all the transactions in its pending state through websocket.
2. Structure of Mempool Engine
   1. Pending Handler: It is designed to recieve all pending hashes, when someone subscribes the engine, this handler manages the pending hashes.
   2. State Handler: It is designed to manage the states of mempool monitor - connecting, connected, idle and error.
   3. Mempool Transport: In case, webSocket stops polling, it fallbacks to http, so we have taken 3 types - ws, http and null.
   4. Mempool Transport Engine Snapshot: This snapshot manages all the types for status, error and transport to be used by Engine functions.
   5. formatEngineError: In order to have a clean error message, we have trimmed it to show it, if no error message, then return display message.
   6. isRPCMethodUnsupported: It checks what does message includes, so that we know whether it is the problem of RPC Method support or not, so it would include these 4 parameters if not supported.
   7. isFilterNotFound: Polling can't be done if filter not found.
   8. normalizeRpcUrls: It is used to normalise RPC URL by either taking wss or http, initially it would be wss but if not there, then it fallbacks to http
   9. Mempool Engine Class:
       - Now, this class is designed for building the flow on how each transaction is being monitored, so now we have two parameters that are ws and http, obviously if ws fails, it fallbacks to http, if not, then ws start the websocket, this websocketsubscribes to pending state and emit pending, now if normalised has error like if ws have error, it triggers shutdown to be true which stops polling, closes websockets , destroy provider and so on.
       - Now this shutdown cleans up web sockets which disconnects the websocket lifecycle and remove all listeners and uninstall the filter.
       - This way, this whole system is designed where currently websocket is taken, if it doesn't work, we fallback to http polling and then it polls and emit pending status which enables subscribers to recieve tx hashes.
  10. This is the frontend flow on how this application works.
   
### Transaction Flow
  1. The application starts with useWeb3.ts hook, where we declare a global interface Window for provider, account and etherium.
  2. The first phase of transaction is to initiate a etherium window browser provider and then fetch accounts from that provider and get their network for all transactions.
  3. For this, we can initialise anvil in our bash which opens the metamask window. Without anvil or any blockchain, one can't access metamask window.
  4. Now, we will set first account from all the accounts provided by anvil and accounts, networks, etc. are stored inside react states, alongwith chain id.
  5. Now we return all these parameters including balance and everything and use it inside callback function to pass it to other components as a prop to be reused.
  6. Now, we fetch it inside Headers.tsx to display balance on clicking button with alerts.
  7. Our next step is to create and initialise a pool, so we build a backend folder with hardhat config file and scripts and contracts folder.
  8. Now, in our scripts file, we initialise a script for creation of pool as PoolFactory.sol where we are creating a pool, setting it active and get pools.
  9. Our initialisation script is inside Pool.sol file where we have used modifier for only owner, and onlyAuthorised, not limited to that but also if pool is not initialised, then also we don't want to use it for our mint, burn and swap functions, once it is done, we initialise a pool, for taking pool transaction from create pool, we have iFace.parseLog(), actually it is used for fetching data from factory contract interface
  10. Now, we initialise a pool with four parameters - assets, free-tier, kernel type and initial price.
  11. Now, once pool is initialise, we can watch it inside EXPLORE section. Let me segregate all functions in this file to have a better overview:
         - loadPoolData: We initialise checks for account and providers, then initialise a new contract using factory address, factory abi and provider. Once, it is initialised we call getPools() from contract to get pools to be managed, now it calls all the pools parellely using promise and setPoolDetailsList.
         - handleAuthorize: It has a feature of two modes to decide whether to authorize particular user or remove its authorization by searching and triggerring the respective button.
         - RefreshAuthorization: It checks for active provider, if not there, it triggers getActivePoolAddress() function to get active provider.
         - getActivePoolAddress: It checks for active provider, if it doesn't find it, it extracts activePool() from contract.
         - handleManagePool: It is triggered on clicking Set Pool button, for setting current pool while removing/unset the previous pool.
         - resolvePoolAddress: It is used to set latest address as current address.
         -  resolveSymbol: It converts a token address into a readable symbol (USDC/NFS) or returns the raw address if unknown.
         -  handleBurnMint: Burns a user’s liquidity position after validating wallet, pool state, authorization, and balances.
         -  handleMint: Approves token spending and mints a new liquidity position in the active pool after all checks.
         -  adjustAmount: Increments or decrements the USDC or NFS input amount safely without going below zero.
         -  onAmountInput: Updates USDC or NFS amount state from user input after validating it’s a number.
         -  loadMintEvents: Fetches LiquidityAdded/LiquidityRemoved events from the pool and builds the current mint event list.
         -  loadSwapEvents: Fetches Swap events from the pool and formats them into readable swap history.
         -  loadPoolData: Fetches all pools from factory and builds detailed metadata (TVL, APR, fee, status, etc.) for UI display.
  12. Now, once liquidity is added to the pool, we can perform a swap function to calculate the amount out, taking the slippage tolerance and fee tier in consideration to retrieve a swapped amount. Let me segregare all functions in this file to have a better overview:
         - loadActiveLiquidity: Through openzeppelin/contact file, I have taken an interface of ERC20.sol for building a contract for mock tokens which I have utilised to store my balance tokens in USDC and NSF which I load inside this file.
         -  handleFlipTokens: It is triggered by double swap arrow to flip the tokens from USDC to NFS and from NFS to USDC.
         -  getMaxFromBalance: It is used for getting maximum balance for both tokens.
         -  handleFromAmountChange: It is used to handle tokens change.
         -  estimateOutput: While all calculations are being implemented in swap contract, it gives us tentative output for getting an approximation idea.
         -  priceFromTo: Value of 1 UDSC or 1 NFS in terms of each other.
         -  SlippageInfo: It is used to calculate slippage tolerance during the conversion.
         -  priceImpact: It is used for the calculation of price impact during the conversion.
  13. I have implemented the sandwich bot but it is triggering only once and at the start of the token swapping, or sometimes don't, I need to optimise it more and get into the test cases for making it work.

# Project Setup
### Prerequisites
Install these tools and languages first:
#### Core
1. Node.js
2. npm
3. git
4. metamask (browser extension)

#### Blockchain Dev Tools
1. Hardhat
2. Anvil

### Clone and Install
```
git clone https://github.com/ayushmittal0608/DApp
cd DApp
```
### Install frontend
```
cd frontend
npm install
```

### Install backend
```
cd backend
npm install
```

### Start Local Blockchain
Use anvil
```
anvil
```
This gives three parameters:
- 10 pre-funded accounts
- Private Keys
- RPC URL: http://127.0.0.1:8545

### Create wallet
- Create new wallet
- Set password
This creates metamask identity

### Add Local Network
Go to:
$$Settings → Networks → Add Network → Manual$$
Fill:
```Network Name: Anvil Local
RPC URL: http://127.0.0.1:8545
Chain ID: 31337
Currency Symbol: ETH
```
Save it.

### Import Anvil Account
Now pick private key from anvil and set env variables
You will see:
```
Private Key: 0xabc123...
```
For account, I have hardcoded anvil to take first account from useWeb3.ts file.
Note: I know that it is not a good practice to expose the env credentials but I have exposed it as it is just a test project, so you can get idea on how to setup the project more clearly. Companies manage keys and credentials through KMS and HSM to manage key security. Keys and credentials are too much important for any project that it is even encrypted using post quantum cryptography techniques like kyber, signing it with a digital signature such as dilithium.

### Compiling Solidity File and Running Backend Script
Inside backend, run:
```
npx hardhat node
npx harhat compile
npx hardhat run scripts/Pool.js --network anvil
```
- This is done to compile solidity file and run script to generate address for pool factory contract and two mock tokens NFS and USDC, ignore executor address because I was thinking about implementation of script for sandwich bot, but then eventually I used flash bot instead of it.
- Now all the addresses are being stored inside /frontend/src/contracts/deployedAddresses.json inside the frontend.

### Start frontend
Inside frontend, run:
```
npm run dev
```

### Testing
For running tests, we need to create a test folder, add test.sol file and run:
```
npx hardhat test 
```
### Example test (Pool Factory)
```
import { expect } from "chai";
import { ethers } from "hardhat";

describe("PoolFactory", function () {
  it("should create a pool", async function () {
    const Factory = await ethers.getContractFactory("PoolFactory");
    const factory = await Factory.deploy();

    await factory.createPool(
      "USDC",
      "NFS",
      30,
      1000,
      1
    );

    const pools = await factory.getPools();
    expect(pools.length).to.equal(1);
  });
});
```
Note: The above script can be implemented to run automated test to solidity but I prefer manual testing more as it gives us an insight for UI and everything on single screen.

## 🧮 Mathematical Model of the Protocol

This protocol is built on a custom mathematical framework combining AMM pricing, liquidity lifecycle modeling, kernel-based distribution, and real-time transaction analysis.

---

## 1. Pool Creation & Initialization Model

A liquidity pool is defined as:

$$P = (F, S₀, K, A)$$

Where:
$$F → Fee tier  S₀ → Oracle initial price seed  K → Kernel type (pricing model)  A → Token pair (USDC, NFS)$$

---

## 2. Pool State Evolution

Pool state changes over time based on liquidity updates:

$$P(t+1) = P(t) + ΔL - ΔB$$

Where:
$$ΔL → Liquidity added (mint) ΔB → Liquidity removed (burn)$$

---

## 3. Minting & Burning Model

### Mint Function

$$LP = f_mint(x, y, F)$$

Where:
$$x, y → token deposits  F → fee tier adjustment  LP → liquidity position minted$$ 

---

### Burn Function

$$(x, y) = f_burn(LP_i),  i = 1...n$$

Constraint:
$$Σ LP_i = LP_total$$

- Each LP position is independently tracked
- Partial burns per mint are not supported

---

## 4. TVL (Total Value Locked)

$$TVL = Σ (x_i * P_x + y_i * P_y)$$

Where:
$$P_x, P_y → token prices  x_i, y_i → liquidity amounts$$

---

## 5. Swap Algorithm (AMM Model)

### Output Calculation

$$y_out = (x_in * R_y) / (R_x + x_in(1 - F))$$

Where:
$$R_x, R_y → reserves  F → fee factor  x_in → input amount$$

---

### Slippage Model

$$S = (y_expected - y_actual) / y_expected$$

Condition:
$$S ≤ S_max$$

---

## 6. Price Impact

$$PI = (P_post - P_pre) / P_pre$$

Where:
$$P_pre → price before swap  P_post → price after swap$$

---

## 7. Kernel-Based Liquidity Distribution

Normalized deviation:

$$x = (P - μ) / σ$$

Where:
$$σ = (max - min) / 6$$

---

### Gaussian Kernel

$$f(x) = P_peak * e^(-x² / 2)$$

---

### Triangular Kernel

$$f(P) = P_peak * max(0, 1 - |P - c| / (max - c))$$

Where:
$$c → center price$$ 

---

### Uniform Kernel

$$f(P) = 0.6 * P_peak$$

---

## 8. Mempool Monitoring Model

$$T = W(ws) ∪ H(http)$$

Where:
$$W(ws) → WebSocket stream  H(http) → HTTP fallback stream$$

State:

$$S ∈ {connecting, connected, idle, error}$$

---

## 9. CallData Decoding

$$D(tx) = ABI⁻¹(calldata)$$

Where:
$$D → decoding function  ABI⁻¹ → reverse ABI parser$$

# Improvements and Add-ons
- Pool should burn the tokens partially, Currently, whole mint is being burnt, partial burn is required.
- Sandwich bot is not implemented perfectly, it needs more improvements.
- We can add order books and tick based graphs for tracking the liquidity graphs after each mint, burn and swap to scale it.

# References
1. NoFeeSwap YellowPaper: github.com/NoFeeSwap/docs/blob/main/yellowpaper.pdf
2. Documentation: https://docs.uniswap.org/contracts/v4/guides/ERC-6909
3. Documentation: https://docs.metamask.io/
