# Todo
- Currently, user authorization is left due to which any account can connect and no function is dependent on modifier owner currently.
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

# Add-on To Implement
- Front run to run swap logic before user with same input to get highest possible NFS, making it worse for user to have high profits.
- Back run to run swap logic with recieved NFS back to USDC to get net profit on USDC, leading to net loss of user on NFS.
- Above parameters can only be achieved through mempool monitoring and calldata decoding.
