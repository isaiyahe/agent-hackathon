// The demo app does not implement this endpoint. In dev, Vite proxies /api/* to
// DEMO_API_TARGET (see vite.config.ts); without it the request 404s.
export const CHECKOUT_ENDPOINT = '/api/checkout';

export interface CheckoutRequest {
  items: { sku: string; quantity: number }[];
  checkoutMode: 'guest';
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
