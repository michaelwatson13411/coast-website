document.addEventListener("DOMContentLoaded", function () {

    /* ==========================
       COAST STICKER CAROUSEL
       ========================== */

    const carousel = document.getElementById("stickerCarousel");
    const prev = document.querySelector(".carousel-arrow.prev");
    const next = document.querySelector(".carousel-arrow.next");

    if (carousel && prev && next) {

        function moveCarousel(direction) {
            const card = carousel.querySelector(".product-card");

            if (!card) return;

            const gap = parseFloat(
                getComputedStyle(carousel).gap
            ) || 0;

            const distance = card.getBoundingClientRect().width + gap;

            carousel.scrollBy({
                left: distance * direction,
                behavior: "smooth"
            });
        }

        next.addEventListener("click", function () {
            moveCarousel(1);
        });

        prev.addEventListener("click", function () {
            moveCarousel(-1);
        });

        function updateButtons() {
            const maxScroll = carousel.scrollWidth - carousel.clientWidth;

            prev.disabled = carousel.scrollLeft <= 2;
            next.disabled = carousel.scrollLeft >= maxScroll - 2;
        }

        carousel.addEventListener("scroll", updateButtons);
        window.addEventListener("resize", updateButtons);

        updateButtons();
    }

    /* ==========================
       COAST SHOPPING CART
       ========================== */

    const CART_KEY = "coastCart";
    const PRODUCTS = Object.fromEntries([1, 2, 3, 4, 5].map(n => [
        "sticker" + n, { name: "Sticker " + n, price: 4 }
    ]));

    function normalizeCart(saved) {
        const result = [];
        let count = 0;
        if (!Array.isArray(saved)) return result;
        for (const item of saved) {
            if (!item || !Object.hasOwn(PRODUCTS, item.id) ||
                !Number.isSafeInteger(item.quantity) || item.quantity < 1) continue;
            const existing = result.find(row => row.id === item.id);
            const quantity = Math.min(item.quantity, 20 - (existing?.quantity || 0), 50 - count);
            if (quantity < 1) continue;
            if (existing) existing.quantity += quantity;
            else result.push({ id: item.id, ...PRODUCTS[item.id], quantity });
            count += quantity;
        }
        return result;
    }

    // Load saved shopping cart
    let cart;

    try {
        const saved = JSON.parse(
            localStorage.getItem(CART_KEY) || "[]"
        );

        cart = normalizeCart(saved);
    } catch {
        cart = [];
    }

    // Save cart and update the page
    function saveCart() {
        try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
        catch { alert("Please enable browser storage to save your cart."); }
        updateCart();
        window.dispatchEvent(new Event("coast-cart-change"));
    }

    function updateCart() {

        const cartCount = document.getElementById("cart-count");
        const cartItems = document.getElementById("cart-items");
        const cartTotal = document.getElementById("cart-total");

        const count = cart.reduce(
            (sum, item) => sum + item.quantity, 0
        );

        if (cartCount) {
            cartCount.textContent = count;
        }

        // Only render cart on the cart page
        if (!cartItems || !cartTotal) return;

        cartItems.replaceChildren();

        let total = 0;

        if (cart.length === 0) {
            const empty = document.createElement("p");
            empty.textContent = "Your beach bag is empty!";
            cartItems.appendChild(empty);
        }

        cart.forEach((item, index) => {

            total += item.price * item.quantity;

            const row = document.createElement("div");
            row.className = "cart-item";

            const details = document.createElement("div");

            const name = document.createElement("h3");
            name.textContent = item.name;

            const price = document.createElement("p");
            price.textContent =
                "$" + (item.price * item.quantity).toFixed(2);

            details.append(name, price);

            const controls = document.createElement("div");
            controls.className = "cart-controls";

            const minus = document.createElement("button");
            minus.type = "button";
            minus.textContent = "−";
            minus.setAttribute(
                "aria-label",
                "Remove one " + item.name
            );

            const quantity = document.createElement("span");
            quantity.textContent = item.quantity;

            const plus = document.createElement("button");
            plus.type = "button";
            plus.textContent = "+";
            plus.setAttribute(
                "aria-label",
                "Add one " + item.name
            );

            minus.addEventListener("click", () => {
                cart[index].quantity--;

                if (cart[index].quantity <= 0) {
                    cart.splice(index, 1);
                }

                saveCart();
            });

            plus.addEventListener("click", () => {
                if (cart[index].quantity >= 20 || cart.reduce((sum, row) => sum + row.quantity, 0) >= 50) return;
                cart[index].quantity++;
                saveCart();
            });

            controls.append(minus, quantity, plus);
            row.append(details, controls);
            cartItems.appendChild(row);
        });

        cartTotal.textContent = "$" + total.toFixed(2);

        const checkout = document.querySelector(".checkout-button");

        if (checkout) {
            checkout.disabled = cart.length === 0;
        }
    }

    /* ADD TO CART BUTTONS */

    document.querySelectorAll(".cart-button").forEach(button => {

        button.addEventListener("click", function () {

            const id = this.dataset.id;
            const product = PRODUCTS[id];
            const name = product?.name;
            const price = product?.price;

            if (!id || !name ||
                !Number.isFinite(price) || price < 0) {
                console.error("Missing product information");
                return;
            }

            const existingItem = cart.find(item => item.id === id);

            if ((existingItem && existingItem.quantity >= 20) || cart.reduce((sum, row) => sum + row.quantity, 0) >= 50) return;

            if (existingItem) {
                existingItem.quantity++;
            } else {
                cart.push({
                    id: id,
                    name: name,
                    price: price,
                    quantity: 1
                });
            }

            saveCart();

            // Visual feedback
            this.textContent = "ADDED!";

            setTimeout(() => {
                this.textContent = "ADD TO CART";
            }, 1200);
        });
    });

    /* OPEN CHECKOUT PAGE */

    const checkoutButton =
        document.querySelector(".checkout-button");

    if (checkoutButton) {
        checkoutButton.addEventListener("click", function () {
            window.location.href = "checkout.html";
        });
    }

    /* ================================
       COAST CHECKOUT SUMMARY
       ================================ */

    const checkoutItems =
        document.getElementById("checkout-items");

    const checkoutTotal =
        document.getElementById("checkout-total");

    /* CHECKOUT PAGE */

if (checkoutItems && checkoutTotal) {

    checkoutItems.replaceChildren();

    let total = 0;

    if (cart.length === 0) {
        const empty = document.createElement("p");
        empty.textContent = "Your beach bag is empty!";
        checkoutItems.appendChild(empty);
    }

    cart.forEach(function (item) {

        const price = Number(item.price);
        const quantity = Number(item.quantity);

        if (!Number.isFinite(price) ||
            !Number.isInteger(quantity) ||
            price < 0 ||
            quantity <= 0) {
            return;
        }

        const row = document.createElement("div");
        row.className = "checkout-item";

        const details = document.createElement("div");

        const name = document.createElement("h3");
        name.textContent = item.name;

        const qty = document.createElement("p");
        qty.textContent = "Quantity: " + quantity;

        details.append(name, qty);

        const amount = document.createElement("span");
        amount.className = "checkout-item-price";
        amount.textContent = "$" + (price * quantity).toFixed(2);

        row.append(details, amount);
        checkoutItems.appendChild(row);

        total += price * quantity;
    });

    checkoutTotal.textContent = "$" + total.toFixed(2);
}
// Display the saved cart on every page
updateCart();
window.addEventListener("storage", event => {
    if (event.key !== CART_KEY) return;
    try { cart = normalizeCart(JSON.parse(event.newValue || "[]")); } catch { cart = []; }
    updateCart();
    window.dispatchEvent(new Event("coast-cart-change"));
});
window.addEventListener("coast-cart-refresh", () => {
    try { cart = normalizeCart(JSON.parse(localStorage.getItem(CART_KEY) || "[]")); } catch { cart = []; }
    updateCart();
});
});
