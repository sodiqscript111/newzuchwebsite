import { useContext } from 'react';
import { Link } from 'react-router-dom';
import { ProductContext } from '../../context/productContext';
import './StoreNavigation.css';

const StoreNavigation = () => {
    const { collections } = useContext(ProductContext);

    return (
        <nav className="navContainer">
            <ul className="navList">
                <li className="navItem">
                    <Link to="/shopall" className="navLink">All Products</Link>
                </li>

                <li className="categoryTitle">Collections</li>
                {collections.map((collection) => (
                    <li className="navItem" key={collection.slug}>
                        <Link to={`/shopall/${collection.slug}`} className="navLink">{collection.name}</Link>
                    </li>
                ))}

                <li className="categoryTitle">Orders</li>
                <li className="navItem">
                    <Link to="/account" className="navLink">My Account</Link>
                </li>
                <li className="navItem">
                    <Link to="/track" className="navLink">Track Order</Link>
                </li>

                <li className="categoryTitle">Information</li>
                <li className="navItem">
                    <Link to="/about" className="navLink">About Us</Link>
                </li>
                <li className="navItem">
                    <Link to="/contact" className="navLink">Contact</Link>
                </li>
                <li className="navItem">
                    <a href="https://instagram.com/Zuch_Collection" target="_blank" rel="noopener noreferrer" className="navLink">Book Appointment</a>
                </li>
            </ul>
        </nav>
    );
};

export default StoreNavigation;
