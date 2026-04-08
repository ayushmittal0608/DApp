# Todo
- Currently, user authorization is left due to which any account can connect and no function is dependent on modifier owner currently.
- Currently, simple storage contract is not there, actually I haven't implemented it due to get fresh results out for development, and testing.
- Currently, tracking pending states before transaction (mempool monitoring) and decoding calldata to extract slippage amount and trade size is pending.

# Mathematical Functions are being implemented thoroughly
- Pool Creation and Initialisation
  1. Fee Tier
  2. Oracle Price Seed
  3. Kernel Type
  4. Tokens USDC and NFS
- Pool Management
- Minting and Burning tokens
  1. Minting and Burning done (mints can be burnt fully not partially)
  2. Tvl calculation done as per fee tier
- Swapping Algorithms
  1. Calculation of output amount from reserve in, reserve out, fee tier and input amount
  2. Calculation of slippage tolerance and comparison for effective swapping
- Curve Distribution Algorithm
  1. Kernel : f(kernel) = Peak . e ^ (-1/2)(x)^2 (where x is x(price)-u(mean/center)/sigma(99.7% width using (max-min)/6))
  2. Triangular : f(triangular) = Peak . t (where t is max(0, 1-abs(price-center)/(max-center)))
  3. Uniform: f(uniform) = Peak . 0.6
