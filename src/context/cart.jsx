import { createContext, useEffect, useState } from "react";
import PropTypes from "prop-types";

const STORAGE_KEY = "zuch-cart";

const lineKey = (item) =>
  `${item.productId}|${item.size ?? ""}|${item.measurements ? JSON.stringify(item.measurements) : ""}`;

const loadCart = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(saved) ? saved.filter((item) => item && item.productId && item.quantity > 0) : [];
  } catch {
    return [];
  }
};

export const CartContext = createContext({
  cartItems: [],
  cartCount: 0,
  cartTotal: 0,
  addItemToCart: () => {},
  removeItemFromCart: () => {},
  increaseQuantity: () => {},
  decreaseQuantity: () => {},
  clearCart: () => {},
});

export const CartProvider = ({ children }) => {
  const [cartItems, setCartItems] = useState(loadCart);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cartItems));
    } catch {
      // Private browsing can block storage; the cart still works for this visit.
    }
  }, [cartItems]);

  const addItemToCart = (item) =>
    setCartItems((items) => {
      const key = lineKey(item);
      const existing = items.find((line) => lineKey(line) === key);
      if (existing) {
        return items.map((line) =>
          lineKey(line) === key ? { ...line, quantity: Math.min(line.quantity + (item.quantity ?? 1), 20) } : line
        );
      }
      return [...items, { ...item, quantity: item.quantity ?? 1 }];
    });

  const removeItemFromCart = (item) => setCartItems((items) => items.filter((line) => lineKey(line) !== lineKey(item)));

  const increaseQuantity = (item) =>
    setCartItems((items) =>
      items.map((line) => (lineKey(line) === lineKey(item) ? { ...line, quantity: Math.min(line.quantity + 1, 20) } : line))
    );

  const decreaseQuantity = (item) =>
    setCartItems((items) =>
      items.map((line) => (lineKey(line) === lineKey(item) ? { ...line, quantity: Math.max(line.quantity - 1, 1) } : line))
    );

  const clearCart = () => setCartItems([]);

  const value = {
    cartItems,
    cartCount: cartItems.reduce((total, item) => total + item.quantity, 0),
    cartTotal: cartItems.reduce((total, item) => total + item.quantity * (item.price ?? 0), 0),
    addItemToCart,
    removeItemFromCart,
    increaseQuantity,
    decreaseQuantity,
    clearCart,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

CartProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export const cartLineKey = lineKey;

export default CartProvider;
