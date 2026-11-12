import { useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, describeItemSize, formatNaira } from "../../api";
import { AccountContext } from "../../context/account";
import { CartContext, cartLineKey } from "../../context/cart";
import "../../styles/shop-pages.css";
import "./cart.css";

const Cart = () => {
  const { cartItems, cartTotal, increaseQuantity, decreaseQuantity, removeItemFromCart } = useContext(CartContext);
  const { customer } = useContext(AccountContext);
  const [contact, setContact] = useState({ name: "", email: "", phone: "", address: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!customer) return;
    setContact((current) => ({
      ...current,
      name: current.name || customer.name,
      email: current.email || customer.email,
      phone: current.phone || customer.phone,
    }));
  }, [customer]);

  const update = (event) => setContact((current) => ({ ...current, [event.target.name]: event.target.value }));

  const checkout = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await api("/checkout", {
        method: "POST",
        body: {
          contact,
          items: cartItems.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            ...(item.size ? { size: item.size } : { measurements: item.measurements }),
          })),
        },
      });
      window.location.assign(result.checkoutUrl);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  if (cartItems.length === 0) {
    return (
      <div className="cart-page">
        <h1 className="cart-title">Shopping Cart</h1>
        <p className="cart-empty">Your cart is empty.</p>
        <p className="shop-center">
          <Link to="/shopall" className="shop-button">Start shopping</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="cart-page">
      <h1 className="cart-title">Shopping Cart</h1>
      <ul className="cart-list">
        {cartItems.map((item) => (
          <li key={cartLineKey(item)} className="cart-card">
            {item.imageUrl && <img className="cart-thumb" src={item.imageUrl} alt="" />}
            <div className="cart-details">
              <h3 className="cart-item-name">{item.name}</h3>
              <p className="cart-item-size">{describeItemSize(item)}</p>
              <p className="cart-item-price">{formatNaira(item.price)}</p>
              <div className="cart-controls">
                <button onClick={() => decreaseQuantity(item)} aria-label={`One less ${item.name}`}>-</button>
                <span aria-label="Quantity">{item.quantity}</span>
                <button onClick={() => increaseQuantity(item)} aria-label={`One more ${item.name}`}>+</button>
                <button className="remove-btn" onClick={() => removeItemFromCart(item)}>Remove</button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <form className="shop-form checkout-form" onSubmit={checkout}>
        <h2>Delivery details</h2>
        {!customer && (
          <p className="shop-muted">
            Checking out as a guest. <Link to="/account">Sign in</Link> to keep your orders in one place.
          </p>
        )}
        <label>
          Full name
          <input name="name" autoComplete="name" required value={contact.name} onChange={update} />
        </label>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required value={contact.email} onChange={update} />
        </label>
        <label>
          Phone
          <input name="phone" type="tel" autoComplete="tel" required minLength={5} value={contact.phone} onChange={update} />
        </label>
        <label>
          Delivery address
          <textarea name="address" autoComplete="street-address" required minLength={5} rows={3} value={contact.address} onChange={update} />
        </label>

        <div className="checkout-total">
          <span>Total</span>
          <strong>{formatNaira(cartTotal)}</strong>
        </div>
        {error && <p className="shop-error" role="alert">{error}</p>}
        <button type="submit" className="shop-button" disabled={submitting}>
          {submitting ? "Taking you to payment…" : "Pay securely with Paystack"}
        </button>
        <p className="shop-muted">{"You'll pay on Paystack's secure page by card, bank transfer or USSD, then come back here."}</p>
      </form>
    </div>
  );
};

export default Cart;
