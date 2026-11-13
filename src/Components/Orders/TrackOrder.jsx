import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../api";
import OrderDetails from "./OrderDetails";
import "../../styles/shop-pages.css";

const TrackOrder = () => {
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({ number: searchParams.get("number") ?? "", email: "" });
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setOrder(await api("/orders/lookup", { method: "POST", body: form }));
    } catch (err) {
      setOrder(null);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  return (
    <div className="shop-page">
      <form className="shop-form" onSubmit={submit}>
        <h1>Track your order</h1>
        <p className="shop-muted">Enter the order number from your confirmation page and the email you used.</p>
        <label>
          Order number
          <input name="number" required placeholder="ZC-XXXXXXX" autoCapitalize="characters" value={form.number} onChange={update} />
        </label>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required value={form.email} onChange={update} />
        </label>
        {error && <p className="shop-error" role="alert">{error}</p>}
        <button type="submit" className="shop-button" disabled={busy}>
          {busy ? "Looking…" : "Find order"}
        </button>
      </form>
      {order && <OrderDetails order={order} />}
    </div>
  );
};

export default TrackOrder;
