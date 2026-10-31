import { db } from './supabase'

/**
 * Makes a one-time code (8 letters and digits, valid 30 minutes) that moves you to another device:
 * a new phone, or the Home Screen app on an iPhone, which has its own storage separate from Safari.
 */
export async function createDeviceCode(): Promise<string> {
  const { data, error } = await db().rpc('create_device_code')
  if (error) throw error
  return String(data)
}

/** Uses a code from your other device: its tanks and fish become this device's. Returns how many tanks came across. */
export async function claimDeviceCode(code: string): Promise<number> {
  const { data, error } = await db().rpc('claim_device_code', { code })
  if (error) throw error
  return Number(data)
}

/** "ABCDEFGH" → "ABCD-EFGH", easier to read and type. */
export function formatDeviceCode(code: string) {
  const clean = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4, 8)}` : clean
}
