import React from 'react';
import { Link } from 'react-router-dom';
import './StoreNavigation.css';

const StoreNavigation = () => {
    return (
        <nav className="navContainer">
            <ul className="navList">
                <li className="navItem">
                    <Link to="/shopall" className="navLink">All Products</Link>
                </li>

                <li className="categoryTitle">Collections</li>
                <li className="navItem">
                    <Link to="/shopall/poisecollection" className="navLink">Poise</Link>
                </li>
                <li className="navItem">
                    <Link to="/shopall/customnative" className="navLink">Custom Native</Link>
                </li>
                <li className="navItem">
                    <Link to="/shopall/joggerset" className="navLink">Jogger Set</Link>
                </li>
                <li className="navItem">
                    <Link to="/shopall/alpha" className="navLink">Alpha</Link>
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
