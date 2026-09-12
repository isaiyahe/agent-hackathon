export type User = { id: string };

/** Fixed signed-in shopper for the non-guest path. No auth, no database. */
export const DEMO_USER: User = { id: 'demo-user' };

/** Guests have no session, so there is no user. */
export function resolveUser(guest: boolean): User | null {
  return guest ? null : DEMO_USER;
}

/**
 * SEEDED DEMO BUG (intentional) for the REPRO guest-checkout demo.
 *
 * Checkout assumes every shopper is signed in. For a guest, `user` is null,
 * so reading `user.id` throws the real runtime error, every time:
 *
 *   TypeError: Cannot read properties of null (reading 'id')
 *
 * The fix would be to handle `user === null` before reading `user.id`.
 */
export function placeOrder(user: User | null): { userId: string } {
  const userId = user!.id;
  return { userId };
}
