// The REPRO demo API (server/demo). Guest checkout deterministically returns 500
// GUEST_USER_NULL. Its CORS allowlist only includes the Vite origin on port 5173,
// which is why vite.config.ts sets strictPort.
export const CHECKOUT_ENDPOINT = 'http://localhost:3001/api/checkout';

export interface CheckoutRequest {
  guest: boolean;
  items: { id: string; quantity: number }[];
}

/**
 * Places the order. Resolves true for a 2xx response and false for any other
 * status or a network failure. The response body is never shown to customers.
 */
export async function submitCheckout(order: CheckoutRequest): Promise<boolean> {
  let response: Response;
  try {
    response = await fetch(CHECKOUT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order),
    });
  } catch {
    return false;
  }

  // Only the network call is guarded. Anything thrown from here on (e.g. while
  // reading the response) escapes as an unhandled rejection that DevTools and
  // REPRO can observe; the page still shows its generic failure message.
  return response.ok;
}
