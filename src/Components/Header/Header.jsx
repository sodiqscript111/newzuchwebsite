import React, { useContext } from 'react';
import { Link } from 'react-router-dom';
import ShoppingBagOutlinedIcon from '@mui/icons-material/ShoppingBagOutlined';
import { CartContext } from '../../context/cart';
import './Header.css';

const Header = () => {
  const { cartItems } = useContext(CartContext);

  return (
    <header className="header">
      <div className="leftSection">
        {/* Placeholder for balance */}
      </div>
      <div className="logoContainer">
        <Link to="/" className="logoLink">
          <img src="https://i.ibb.co/Fq362M1t/Whats-App-Image-2025-02-16-at-10-54-10-65e00f92.jpg" alt="ZUCH Logo" className="logo" />
        </Link>
      </div>
      <div className="rightSection">
        <Link to="/cart" className="iconButton" aria-label="Cart">
          <ShoppingBagOutlinedIcon style={{ fontSize: 28 }} />
          {cartItems.length > 0 && (
            <span className="cart-count">{cartItems.length}</span>
          )}
        </Link>
      </div>
    </header>
  );
};

export default Header;
