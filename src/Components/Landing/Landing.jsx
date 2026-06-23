import React, { useState, useEffect, useContext } from 'react';
import { Link } from 'react-router-dom';
import { ProductContext } from '../../context/productContext';
import './Landing.css';

const Landing = () => {
  const { products } = useContext(ProductContext);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Collect all product images into a flat array
  const allImages = products.reduce((acc, product) => {
    if (Array.isArray(product.imageUrl)) {
      return [...acc, ...product.imageUrl];
    } else if (typeof product.imageUrl === 'string' && product.imageUrl.includes(',')) {
      return [...acc, ...product.imageUrl.split(',').map(url => url.trim())];
    } else if (typeof product.imageUrl === 'string') {
      return [...acc, product.imageUrl];
    }
    return acc;
  }, []);

  // Cycle through images
  useEffect(() => {
    if (allImages.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % allImages.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [allImages.length]);

  return (
    <div className="landing-page">
      {/* Image slideshow */}
      {allImages.map((img, index) => (
        <img
          key={index}
          src={img}
          alt=""
          className={`landing-image ${index === currentIndex ? 'active' : ''}`}
        />
      ))}

      {/* Content overlay */}
      <div className="landing-content">
        <h1 className="welcome-text">WELCOME TO ZUCH</h1>
        <Link to="/shopall" className="shop-now-btn">
          SHOP NOW
        </Link>
      </div>
    </div>
  );
};

export default Landing;
