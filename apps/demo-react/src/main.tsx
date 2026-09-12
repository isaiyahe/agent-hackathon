import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CheckoutPage } from './checkout/CheckoutPage';
import './styles.css';

const CHECKOUT_PATH = '/checkout';

// Single-route app: "/" forwards to /checkout so every session starts on the same URL.
let path = window.location.pathname.replace(/\/+$/, '') || '/';
if (path === '/') {
  window.history.replaceState(null, '', CHECKOUT_PATH);
  path = CHECKOUT_PATH;
}

function NotFound() {
  return (
    <main className="not-found" data-testid="not-found">
      <h1>Page not found</h1>
      <p>This demo store only has a checkout page.</p>
      <a className="btn btn--primary" href={CHECKOUT_PATH}>
        Go to checkout
      </a>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>{path === CHECKOUT_PATH ? <CheckoutPage /> : <NotFound />}</StrictMode>,
);
