document.addEventListener('DOMContentLoaded', async () => {
    const pay = document.getElementById('pay-button');
    if (!pay) return;
    const status = document.getElementById('payment-status');
    const check = document.getElementById('check-payment');
    const thankYou = document.body.dataset.page === 'thank-you';
    const CART = 'coastCart';
    const ATTEMPT = 'coastCheckout';
    const local = ['localhost', '127.0.0.1'].includes(location.hostname);
    // Hosted deployments must expose these API routes on the website's own origin.
    const api = local && location.port !== '4242' ? 'http://127.0.0.1:4242' : location.origin;
    let catalog;
    let items = [];
    let busy = false;
    let returning = new URLSearchParams(location.search).has('session_id');
    const money = amount => '$' + (amount / 100).toFixed(2);

    function cartItems() {
        const saved = JSON.parse(localStorage.getItem(CART) || '[]');
        if (!Array.isArray(saved)) throw new Error('Your saved cart needs review. Return to the cart and update it.');
        const rows = saved.map(row => {
            if (!row || !catalog.products.some(p => p.id === row.id) || !Number.isSafeInteger(row.quantity) || row.quantity < 1 || row.quantity > 20) {
                throw new Error('Your saved cart needs review. Return to the cart and update it.');
            }
            return { id: row.id, quantity: row.quantity };
        }).sort((a, b) => a.id.localeCompare(b.id));
        if (new Set(rows.map(row => row.id)).size !== rows.length || rows.reduce((sum, row) => sum + row.quantity, 0) > 50) {
            throw new Error('Your saved cart needs review. Return to the cart and update it.');
        }
        return rows;
    }

    async function request(path, options = {}) {
        const response = await fetch(api + path, { ...options, cache: 'no-store', signal: AbortSignal.timeout(25000) });
        const data = await response.json();
        if (!response.ok) {
            const error = new Error(data.error || 'Checkout is unavailable. Please try again.');
            error.status = response.status;
            throw error;
        }
        return data;
    }

    function render() {
        const container = document.getElementById('checkout-items');
        container.replaceChildren();
        let total = 0;
        try { items = cartItems(); }
        catch (error) { items = []; status.textContent = error.message; }
        for (const item of items) {
            const product = catalog.products.find(p => p.id === item.id);
            const row = document.createElement('div');
            row.className = 'checkout-item';
            const details = document.createElement('div');
            const name = document.createElement('h3');
            name.textContent = product.name;
            const quantity = document.createElement('p');
            quantity.textContent = 'Quantity: ' + item.quantity;
            details.append(name, quantity);
            const amount = document.createElement('span');
            amount.className = 'checkout-item-price';
            amount.textContent = money(product.amount * item.quantity);
            row.append(details, amount);
            container.append(row);
            total += product.amount * item.quantity;
        }
        if (!items.length) {
            const empty = document.createElement('p');
            empty.textContent = 'Your beach bag is empty!';
            container.append(empty);
        }
        document.getElementById('checkout-total').textContent = money(total);
        pay.disabled = busy || returning || !catalog.ready || !items.length;
    }

    async function paymentStatus() {
        let attempt;
        try { attempt = JSON.parse(sessionStorage.getItem(ATTEMPT) || 'null'); }
        catch { attempt = null; }
        const sessionId = new URLSearchParams(location.search).get('session_id');
        if (!attempt?.orderId || attempt.sessionId !== sessionId) {
            status.textContent = 'We cannot verify this order in this tab. Check the Stripe Dashboard for payment details. Your cart has been kept.';
            return false;
        }
        const order = await request('/api/orders/' + encodeURIComponent(attempt.orderId), {
            headers: { Authorization: 'Bearer ' + attempt.token }
        });
        if (order.sessionId !== sessionId) throw new Error('Order confirmation does not match this checkout.');
        if (order.status === 'paid') {
            let kept = false;
            if (!attempt.confirmed) {
                // Clear only the exact cart that was paid for. Preserve any later cart changes.
                try {
                    if (JSON.stringify(cartItems()) === JSON.stringify(attempt.items)) localStorage.setItem(CART, '[]');
                    else kept = true;
                } catch { kept = true; }
                attempt.confirmed = true;
                attempt.cartKept = kept;
                sessionStorage.setItem(ATTEMPT, JSON.stringify(attempt));
                window.dispatchEvent(new Event('coast-cart-refresh'));
                render();
            }
            if (!thankYou) {
                location.replace('thank-you.html?session_id=' + encodeURIComponent(sessionId));
                return true;
            }
            document.getElementById('thank-you-title').textContent = 'THANK YOU FOR SHOPPING WITH COAST!';
            document.getElementById('thank-you-description').textContent = 'Your test payment went through. We’re happy you joined the COAST crew!';
            status.textContent = (thankYou ? 'Your test order is confirmed.' : 'Test payment confirmed! Your test order is ready to pack.') +
                (attempt.cartKept ? ' Your cart changed after checkout, so it has been kept.' : ' Your purchased cart has been cleared.');
            check.hidden = true;
            pay.hidden = true;
            return true;
        }
        if (order.status === 'failed' || order.status === 'expired') {
            status.textContent = 'Payment was not completed. Your cart has been kept; you can try again.';
            sessionStorage.removeItem(ATTEMPT);
            returning = false;
            check.hidden = true;
            render();
            return true;
        }
        status.textContent = 'Waiting for Stripe to confirm your test payment. Please keep this page open. Your cart is saved.';
        check.hidden = false;
        return false;
    }

    check.addEventListener('click', async () => {
        check.disabled = true;
        try { await paymentStatus(); }
        catch { status.textContent = 'Payment confirmation is unavailable right now. Your cart has been kept. Please check again.'; }
        finally { check.disabled = false; }
    });

    pay.addEventListener('click', async () => {
        if (busy || pay.disabled) return;
        busy = true;
        render();
        pay.textContent = 'OPENING SECURE CHECKOUT…';
        try {
            items = cartItems();
            let attempt = JSON.parse(sessionStorage.getItem(ATTEMPT) || 'null');
            if (!attempt || attempt.confirmed || Date.now() - attempt.createdAt > 28 * 60000 || JSON.stringify(attempt.items) !== JSON.stringify(items)) {
                attempt = { requestId: crypto.randomUUID(), token: crypto.randomUUID(), items, createdAt: Date.now() };
            }
            // Save before the request so a network retry reuses the same Stripe Session.
            sessionStorage.setItem(ATTEMPT, JSON.stringify(attempt));
            const result = await request('/api/checkout', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items, requestId: attempt.requestId, token: attempt.token })
            });
            const url = new URL(result.url);
            if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') throw new Error('Invalid secure checkout address.');
            Object.assign(attempt, { orderId: result.orderId, sessionId: result.sessionId });
            sessionStorage.setItem(ATTEMPT, JSON.stringify(attempt));
            location.assign(url.href);
        } catch (error) {
            if (error.status === 409) sessionStorage.removeItem(ATTEMPT);
            status.textContent = error.message || 'Checkout could not open. Your cart has been kept.';
            busy = false;
            pay.textContent = 'CONTINUE TO SECURE CHECKOUT';
            render();
        }
    });

    try {
        catalog = await request('/api/catalog');
        render();
        if (thankYou && !returning) {
            status.textContent = 'No order to confirm in this tab. Visit the shop to start a new order.';
            return;
        }
        status.textContent = catalog.ready ? 'Ready for a test payment. Enter payment and shipping details securely on Stripe.' : catalog.message;
        if (new URLSearchParams(location.search).has('canceled')) status.textContent = 'Checkout canceled. Your cart has been kept.';
        if (returning) {
            for (let n = 0; n < 30; n++) {
                if (await paymentStatus()) break;
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    } catch {
        status.textContent = 'Secure checkout is unavailable. Your cart is saved. Please try again when the checkout service is running.';
        pay.disabled = true;
        if (returning) check.hidden = false;
    }
    window.addEventListener('coast-cart-change', () => { if (catalog) render(); });
});
