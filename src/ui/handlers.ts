/** What the tank should do on taps; each mode (shared tank, demo) fills these in. */
export interface TankHandlers {
  fishTap?: (id: string) => void
  fishLongPress?: (id: string) => void
  waterTap?: (x: number, y: number) => void
}

/** Taps in the top part of the tank (this fraction of its height) feed the fish. */
export const FEED_ZONE = 0.22
