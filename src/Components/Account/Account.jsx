import { useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatNaira, ORDER_STATUS_LABELS } from "../../api";
import { AccountContext } from "../../context/account";
import "../../styles/shop-pages.css";

const SignIn = () => {
  const { login, register } = useContext(AccountContext);
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") await login({ email: form.email, password: form.password });
      else await register(form);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="shop-form" onSubmit={submit}>
      <div className="shop-tabs" role="group" aria-label="Sign in or create an account">
        <button type="button" aria-pressed={mode === "login"} onClick={() => setMode("login")}>Sign in</button>
        <button type="button" aria-pressed={mode === "register"} onClick={() => setMode("register")}>Create account</button>
      </div>
      {mode === "register" && (
        <>
          <label>
            Full name
            <input name="name" autoComplete="name" required value={form.name} onChange={update} />
          </label>
          <label>
            Phone <span className="shop-muted">(optional)</span>
            <input name="phone" type="tel" autoComplete="tel" value={form.phone} onChange={update} />
          </label>
        </>
      )}
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required value={form.email} onChange={update} />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
          minLength={mode === "register" ? 8 : 1}
          value={form.password}
          onChange={update}
        />
      </label>
      {error && <p className="shop-error" role="alert">{error}</p>}
      <button type="submit" className="shop-button" disabled={busy}>
        {busy ? "One moment…" : mode === "login" ? "Sign in" : "Create account"}
      </button>
      {mode === "login" && (
        <p className="shop-muted">
          <Link to="/forgot-password">Forgot your password?</Link>
        </p>
      )}
      <p className="shop-muted">
        Ordered as a guest? <Link to="/track">Track an order</Link> with its number and email.
      </p>
    </form>
  );
};

const MyOrders = () => {
  const { customer, logout } = useContext(AccountContext);
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api("/account/orders").then(setOrders).catch((err) => setError(err.message));
  }, []);

  return (
    <div className="account">
      <header className="order-header">
        <div>
          <p className="shop-muted">Signed in as {customer.email}</p>
          <h1>My orders</h1>
        </div>
        <button className="shop-button secondary" onClick={logout}>Sign out</button>
      </header>
      {error && <p className="shop-error">{error}</p>}
      {orders === null && !error && <p className="shop-muted">Loading…</p>}
      {orders?.length === 0 && (
        <p className="shop-muted">
          No orders yet. <Link to="/shopall">Start shopping</Link>.
        </p>
      )}
      <ul className="account-orders">
        {orders?.map((order) => (
          <li key={order.number}>
            <Link to={`/orders/${order.number}`}>
              <span>
                <strong>{order.number}</strong>
                <span className="shop-muted">
                  {new Date(order.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                  {" · "}
                  {order.items.reduce((n, item) => n + item.quantity, 0)} item(s)
                </span>
              </span>
              <span>{formatNaira(order.total)}</span>
              <span className={`order-status status-${order.status}`}>{ORDER_STATUS_LABELS[order.status]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
};

const Account = () => {
  const { customer, loading } = useContext(AccountContext);
  return (
    <div className="shop-page">
      {loading ? <p className="shop-center shop-muted">Loading…</p> : customer ? <MyOrders /> : <SignIn />}
    </div>
  );
};

export default Account;
