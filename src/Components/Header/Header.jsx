import { useContext } from 'react';
import { Link } from 'react-router-dom';
import ShoppingBagOutlinedIcon from '@mui/icons-material/ShoppingBagOutlined';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
import { CartContext } from '../../context/cart';
import { AccountContext } from '../../context/account';
import './Header.css';

const Header = () => {
  const { cartCount } = useContext(CartContext);
  const { customer } = useContext(AccountContext);

  return (
    <header className="header">
      <div className="leftSection" />
      <div className="logoContainer">
        <Link to="/" className="logoLink">
          <img src="https://i.ibb.co/Fq362M1t/Whats-App-Image-2025-02-16-at-10-54-10-65e00f92.jpg" alt="ZUCH Logo" className="logo" />
        </Link>
      </div>
      <div className="rightSection">
        <Link to="/account" className="iconButton" aria-label={customer ? 'My orders' : 'Sign in'}>
          <PersonOutlineOutlinedIcon style={{ fontSize: 28 }} />
        </Link>
        <Link to="/cart" className="iconButton" aria-label={`Cart, ${cartCount} items`}>
          <ShoppingBagOutlinedIcon style={{ fontSize: 28 }} />
          {cartCount > 0 && <span className="cart-count">{cartCount}</span>}
        </Link>
      </div>
    </header>
  );
};

export default Header;
