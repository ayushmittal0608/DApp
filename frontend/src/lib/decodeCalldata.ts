import { ethers } from 'ethers';
import addresses from '../contracts/deployedAddresses.json';

import FactoryArtifact from '../../../backend/artifacts/contracts/PoolFactory.sol/PoolFactory.json';
import PoolArtifact from '../../../backend/artifacts/contracts/Pool.sol/Pool.json';

export type DecodedCalldata =
  | {
      ok: true;
      contractLabel: string;
      functionName: string;
      signature: string;
      args: Record<string, unknown>;
    }
  | {
      ok: false;
      reason: string;
    };

type CandidateInterface = {
  label: string;
  iface: ethers.Interface;
  addresses?: string[];
};

const FACTORY_IFACE = new ethers.Interface((FactoryArtifact as any).abi);
const POOL_IFACE = new ethers.Interface((PoolArtifact as any).abi);
const ERC20_IFACE = new ethers.Interface([
  'function approve(address spender, uint256 value)',
  'function transfer(address to, uint256 value)',
  'function transferFrom(address from, address to, uint256 value)',
]);

const DEFAULT_CANDIDATES: CandidateInterface[] = [
  { label: 'PoolFactory', iface: FACTORY_IFACE, addresses: [addresses.factory] },
  { label: 'Pool', iface: POOL_IFACE },
  { label: 'ERC20', iface: ERC20_IFACE, addresses: [addresses.usdc, addresses.nfs] },
];

function normalizeAddress(value?: string | null): string | null {
  if (!value) return null;
  try {
    return ethers.getAddress(value);
  } catch {
    return value.toLowerCase();
  }
}

function formatArgs(fragment: ethers.FunctionFragment, args: ethers.Result): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  fragment.inputs.forEach((input, index) => {
    const raw = args[index];
    const key = input.name?.length ? input.name : String(index);
    out[key] = stringifyValue(raw);
  });

  return out;
}

function stringifyValue(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(stringifyValue);
  if (value && typeof value === 'object' && typeof (value as any).toString === 'function') {
    const stringified = String((value as any).toString());
    if (stringified !== '[object Object]') return stringified;
  }
  return value;
}

export function decodeCalldata({
  to,
  data,
  value,
  candidates = DEFAULT_CANDIDATES,
}: {
  to?: string | null;
  data?: string;
  value?: bigint;
  candidates?: CandidateInterface[];
}): DecodedCalldata {
  if (!data || data === '0x') return { ok: false, reason: 'No calldata' };
  if (!data.startsWith('0x') || data.length < 10) return { ok: false, reason: 'Invalid calldata' };

  const normalizedTo = normalizeAddress(to);
  const prioritized = candidates
    .slice()
    .sort((a, b) => {
      const aMatch = a.addresses?.some((addr) => normalizeAddress(addr) === normalizedTo) ? 1 : 0;
      const bMatch = b.addresses?.some((addr) => normalizeAddress(addr) === normalizedTo) ? 1 : 0;
      return bMatch - aMatch;
    });

  for (const candidate of prioritized) {
    try {
      const parsed = candidate.iface.parseTransaction({ data, value });
      if (!parsed) continue;
      return {
        ok: true,
        contractLabel: candidate.label,
        functionName: parsed.name,
        signature: parsed.signature,
        args: formatArgs(parsed.fragment, parsed.args),
      };
    } catch {
      
    }
  }

  return { ok: false, reason: 'Unknown function selector' };
}
