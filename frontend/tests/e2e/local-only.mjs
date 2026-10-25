export const origin = 'http://127.0.0.1:3100';
export function assertLocalTarget(value = process.env.E2E_BASE_URL ?? origin) {
  // A fixed endpoint also prevents accidentally targeting another local app.
  if (value !== origin) throw new Error('E2E refuses target overrides; use the isolated loopback stack');
  return value;
}