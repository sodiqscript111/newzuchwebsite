import { useContext, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../api";
import { CartContext } from "../../context/cart";
import OrderDetails from "./OrderDetails";
import "../../styles/shop-pages.css";

const POLL_MS = 3000;
const POLL_LIMIT = 40;

const OrderPage = () => {
  const { number, token } = useParams();
  const [searchParams] = useSearchParams();
  const { clearCart } = useContext(CartContext);
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  const returnedFromPayment = searchParams.has("reference") || searchParams.has("trxref");

  useEffect(() => {
    if (returnedFromPayment) clearCart();
    // Only on arrival from the payment page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnedFromPayment]);

  useEffect(() => {
    let active = true;
    let attempts = 0;
    let timer;
    const path = token ? `/orders/${number}/${token}` : `/account/orders/${number}`;
    const load = async () => {
      try {
        const data = await api(path);
        if (!active) return;
        setOrder(data);
        attempts++;
        if (data.status === "awaiting_payment" && attempts < POLL_LIMIT) timer = setTimeout(load, POLL_MS);
      } catch (err) {
        if (active) setError(err.status === 401 ? "Sign in to see this order." : err.message);
      }
    };
    load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [number, token]);

  return (
    <div className="shop-page">
      {error ? (
        <div className="shop-center">
          <p className="shop-error">{error}</p>
          <p>
            <Link to="/track">Find an order</Link>
          </p>
        </div>
      ) : order ? (
        <>
          <OrderDetails order={order} />
          {token && (
            <p className="shop-muted order-keep">
              Bookmark this page to check your order later, or find it any time with your order number and email on{" "}
              <Link to="/track">Track order</Link>.
            </p>
          )}
        </>
      ) : (
        <p className="shop-center shop-muted">Loading your order…</p>
      )}
    </div>
  );
};

export default OrderPage;
