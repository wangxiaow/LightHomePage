import { isIP } from 'node:net';

// Canonicalize IPv6 and IPv4-mapped IPv6 so one address has one quota.
export function normalizeAddress(value) {
  if (typeof value !== 'string' || value.includes('%') || !isIP(value)) return null;
  if (isIP(value) === 4) return value;
  const address = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  if (!address.startsWith('::ffff:')) return address;
  const words = address.slice(7).split(':').map(word => parseInt(word, 16));
  return [words[0] >> 8, words[0] & 255, words[1] >> 8, words[1] & 255].join('.');
}

export function createClientAddressResolver(trustedProxies = '') {
  if (typeof trustedProxies !== 'string') throw new Error('TRUSTED_PROXIES must be a comma-separated list of exact IP addresses');
  const trusted = new Set();
  if (trustedProxies.trim()) {
    for (const value of trustedProxies.split(',')) {
      const address = normalizeAddress(value.trim());
      if (!address) throw new Error('TRUSTED_PROXIES contains an invalid IP address (CIDRs and wildcards are not accepted)');
      trusted.add(address);
    }
  }
  return request => {
    const peer = normalizeAddress(request.socket.remoteAddress);
    if (!peer) return null;
    if (!trusted.has(peer)) return peer;
    // The trusted edge must overwrite this header with one client IP.
    // Missing/ambiguous headers fail closed instead of sharing the proxy quota.
    const forwarded = request.headers['x-forwarded-for'];
    return typeof forwarded === 'string' ? normalizeAddress(forwarded.trim()) : null;
  };
}
