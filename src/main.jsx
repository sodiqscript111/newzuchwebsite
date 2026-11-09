import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AccountProvider } from './context/account';
import { CartProvider } from './context/cart';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <AccountProvider>
      <CartProvider>
        <App />
      </CartProvider>
    </AccountProvider>
  </React.StrictMode>
);
