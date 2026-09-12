import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { DEMO_ITEM, formatMoney } from './catalog';
import { submitCheckout } from './checkoutApi';
import { AlertIcon, BagIcon, CheckCircleIcon, CheckIcon, LockIcon } from './icons';
import { ProductArt } from './ProductArt';

type CheckoutStatus = 'idle' | 'pending' | 'failed' | 'succeeded';

export function CheckoutPage() {
  const [inCart, setInCart] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [status, setStatus] = useState<CheckoutStatus>('idle');
  const submitting = useRef(false);

  const canCheckout = inCart && isGuest;
  const subtotal = inCart ? DEMO_ITEM.priceCents : 0;

  // Mirrored to data-state on the page root so replays can wait on explicit
  // transitions: initial → added → guest → checkout-pending → checkout-failed | checkout-succeeded.
  const pageState =
    status !== 'idle' ? `checkout-${status}` : isGuest ? 'guest' : inCart ? 'added' : 'initial';

  // Steps commit synchronously so a script clicking the buttons back-to-back
  // always finds the next button already enabled. Both steps are idempotent.
  function addDemoItem() {
    flushSync(() => setInCart(true));
  }

  function continueAsGuest() {
    flushSync(() => setIsGuest(true));
  }

  async function checkout() {
    if (submitting.current) return;
    submitting.current = true;
    setStatus('pending');

    let ok = false;
    try {
      ok = await submitCheckout({
        guest: true,
        items: [{ id: DEMO_ITEM.id, quantity: 1 }],
      });
    } finally {
      // No catch: unexpected errors still propagate to DevTools, while the
      // customer only ever sees the generic message.
      submitting.current = false;
      setStatus(ok ? 'succeeded' : 'failed');
    }
  }

  return (
    <div className="page" id="checkout-page" data-testid="checkout-page" data-state={pageState}>
      <header className="site-header">
        <div className="site-header__inner">
          <div className="brand">
            <span className="brand__mark" aria-hidden="true">
              <BagIcon size={16} />
            </span>
            REPRO Demo Store
          </div>
          <div className="site-header__meta">
            <span className="pill">Test mode</span>
            <span className="site-header__secure">
              <LockIcon size={14} />
              Secure checkout
            </span>
          </div>
        </div>
      </header>

      <main className="checkout">
        <div className="checkout__heading">
          <h1>Checkout</h1>
          <p>Add the demo item, continue as a guest, and place your order.</p>
        </div>

        <div className="checkout__layout">
          <div className="checkout__steps">
            <section
              className="card step"
              id="product"
              data-testid="product-card"
              aria-labelledby="product-step-title"
            >
              <StepHeader step={1} title="Your item" titleId="product-step-title" done={inCart} />
              <div className="product">
                <div className="product__media">
                  <ProductArt />
                </div>
                <div className="product__body">
                  <div className="product__heading">
                    <h3 className="product__name" data-testid="product-name">
                      {DEMO_ITEM.name}
                    </h3>
                    <p className="product__price" data-testid="product-price">
                      {formatMoney(DEMO_ITEM.priceCents)}
                    </p>
                  </div>
                  <p className="product__description">{DEMO_ITEM.description}</p>
                  <p className="product__stock">
                    <span className="product__stock-dot" aria-hidden="true" />
                    In stock · Ships within 24 hours
                  </p>
                  <div className="step__actions">
                    <button
                      type="button"
                      className={inCart ? 'btn btn--secondary' : 'btn btn--primary'}
                      data-testid="add-demo-item"
                      onClick={addDemoItem}
                    >
                      Add Demo Item
                    </button>
                    {inCart && (
                      <span className="confirmation" data-testid="item-added">
                        <CheckIcon size={16} />
                        Added to cart
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section
              className="card step"
              id="guest-checkout"
              data-testid="guest-checkout"
              aria-labelledby="guest-step-title"
            >
              <StepHeader step={2} title="Checkout method" titleId="guest-step-title" done={isGuest} />
              <p className="step__text">
                No account needed. Check out as a guest and create an account later if you like.
              </p>
              <div className="step__actions">
                <button
                  type="button"
                  className={isGuest ? 'btn btn--secondary' : 'btn btn--primary'}
                  data-testid="continue-as-guest"
                  disabled={!inCart}
                  onClick={continueAsGuest}
                >
                  Continue as Guest
                </button>
                {isGuest ? (
                  <span className="confirmation" data-testid="guest-checkout-enabled">
                    <CheckIcon size={16} />
                    Guest checkout enabled
                  </span>
                ) : (
                  !inCart && <span className="hint">Add the item to continue.</span>
                )}
              </div>
            </section>
          </div>

          <aside
            className="card summary"
            id="order-summary"
            data-testid="order-summary"
            aria-labelledby="summary-title"
          >
            <div className="summary__header">
              <h2 className="summary__title" id="summary-title">
                Order summary
              </h2>
              <span className="summary__count">{inCart ? '1 item' : '0 items'}</span>
            </div>

            <div className="summary__items">
              {inCart ? (
                <div className="line-item" data-testid="cart-item">
                  <div className="line-item__thumb">
                    <ProductArt />
                    <span className="line-item__qty" aria-hidden="true">
                      1
                    </span>
                  </div>
                  <div>
                    <p className="line-item__name">{DEMO_ITEM.name}</p>
                    <p className="line-item__meta">Qty 1</p>
                  </div>
                  <p className="line-item__price">{formatMoney(DEMO_ITEM.priceCents)}</p>
                </div>
              ) : (
                <div className="cart-empty" data-testid="cart-empty">
                  <span className="cart-empty__icon" aria-hidden="true">
                    <BagIcon size={18} />
                  </span>
                  <div>
                    <p className="cart-empty__title">Your cart is empty</p>
                    <p className="cart-empty__text">Add the demo item to get started.</p>
                  </div>
                </div>
              )}
            </div>

            <dl className="totals">
              <div className="totals__row">
                <dt>Subtotal</dt>
                <dd data-testid="order-subtotal">{formatMoney(subtotal)}</dd>
              </div>
              <div className="totals__row">
                <dt>Shipping</dt>
                <dd>{inCart ? 'Free' : '—'}</dd>
              </div>
              <div className="totals__row totals__row--total">
                <dt>Total</dt>
                <dd>
                  <span className="totals__currency">USD</span>
                  <span data-testid="order-total">{formatMoney(subtotal)}</span>
                </dd>
              </div>
            </dl>

            <button
              type="button"
              className="btn btn--primary btn--large btn--block"
              data-testid="checkout"
              disabled={!canCheckout}
              aria-busy={status === 'pending'}
              onClick={checkout}
            >
              Checkout
            </button>

            {status === 'failed' ? (
              <div className="alert alert--error" role="alert" data-testid="checkout-error">
                <AlertIcon size={16} />
                <div>
                  <p className="alert__title">Something went wrong.</p>
                  <p className="alert__text">We couldn't place your order. Please try again.</p>
                </div>
              </div>
            ) : status === 'succeeded' ? (
              <div className="alert alert--success" role="status" data-testid="checkout-success">
                <CheckCircleIcon size={16} />
                <div>
                  <p className="alert__title">Order placed</p>
                  <p className="alert__text">Thanks! Your order has been received.</p>
                </div>
              </div>
            ) : (
              !canCheckout && (
                <p className="summary__hint">
                  {inCart ? 'Continue as guest to check out.' : 'Add an item to check out.'}
                </p>
              )
            )}

            <p className="summary__note">
              <LockIcon size={12} />
              Test mode · No payment is collected
            </p>
          </aside>
        </div>
      </main>
    </div>
  );
}

interface StepHeaderProps {
  step: number;
  title: string;
  titleId: string;
  done: boolean;
}

function StepHeader({ step, title, titleId, done }: StepHeaderProps) {
  return (
    <div className="step__header">
      <span className={done ? 'step__badge step__badge--done' : 'step__badge'} aria-hidden="true">
        {done ? <CheckIcon size={14} /> : step}
      </span>
      <h2 className="step__title" id={titleId}>
        {title}
      </h2>
    </div>
  );
}
