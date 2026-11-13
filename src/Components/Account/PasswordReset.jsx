import { useContext, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api";
import { AccountContext } from "../../context/account";
import "../../styles/shop-pages.css";

export const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setMessage((await api("/account/forgot", { method: "POST", body: { email } })).message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shop-page">
      <form className="shop-form" onSubmit={submit}>
        <h1>Forgot your password?</h1>
        <p className="shop-muted">Enter your account email and we&apos;ll send you a link to choose a new one.</p>
        <label>
          Email
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {message && <p role="status">{message}</p>}
        {error && <p className="shop-error" role="alert">{error}</p>}
        <button type="submit" className="shop-button" disabled={busy}>
          {busy ? "Sending…" : "Send reset link"}
        </button>
        <p className="shop-muted">
          <Link to="/account">Back to sign in</Link>
        </p>
      </form>
    </div>
  );
};

export const ResetPassword = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const { refresh } = useContext(AccountContext);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/account/reset", { method: "POST", body: { token, password } });
      await refresh();
      navigate("/account");
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="shop-page">
      <form className="shop-form" onSubmit={submit}>
        <h1>Choose a new password</h1>
        <label>
          New password
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p className="shop-error" role="alert">
            {error} <Link to="/forgot-password">Get a new link</Link>
          </p>
        )}
        <button type="submit" className="shop-button" disabled={busy}>
          {busy ? "Saving…" : "Save password"}
        </button>
      </form>
    </div>
  );
};
