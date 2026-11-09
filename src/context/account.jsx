import { createContext, useCallback, useEffect, useState } from "react";
import PropTypes from "prop-types";
import { api } from "../api";

export const AccountContext = createContext({
  customer: null,
  loading: true,
  register: async () => {},
  login: async () => {},
  logout: async () => {},
});

export const AccountProvider = ({ children }) => {
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/account")
      .then((data) => setCustomer(data?.customer ?? null))
      .catch(() => setCustomer(null))
      .finally(() => setLoading(false));
  }, []);

  const register = useCallback(async (details) => {
    const data = await api("/account/register", { method: "POST", body: details });
    setCustomer(data.customer);
    return data.customer;
  }, []);

  const login = useCallback(async (details) => {
    const data = await api("/account/login", { method: "POST", body: details });
    setCustomer(data.customer);
    return data.customer;
  }, []);

  const logout = useCallback(async () => {
    await api("/account/logout", { method: "POST" });
    setCustomer(null);
  }, []);

  return (
    <AccountContext.Provider value={{ customer, loading, register, login, logout }}>{children}</AccountContext.Provider>
  );
};

AccountProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
