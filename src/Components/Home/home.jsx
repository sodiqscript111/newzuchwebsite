import React, { useState, useContext, useRef, useEffect } from 'react';
import StoreNavigation from '../StoreNavigation/StoreNavigation';
import { ProductContext } from '../../context/productContext';
import MenuOutlinedIcon from '@mui/icons-material/MenuOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import ProductCard from '../ProductCard/ProductCard';
import './home.css';

const Home = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { products, loading } = useContext(ProductContext);
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = 1.25;
    }
  }, []);

  if (loading) {
    return <div className="home-loading">Loading products...</div>;
  }

  return (
    <div className="home-container">
      {/* Fullscreen Video Background */}
      <video
        ref={videoRef}
        className="video-background"
        autoPlay
        loop
        muted
        playsInline
      >
        <source src="/zuchwebsitevideo.mp4" type="video/mp4" />
      </video>
      <div className="video-overlay" />

      <aside className="sidebar">
        <StoreNavigation />
      </aside>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="mobileMenuOverlay">
          <StoreNavigation />
        </div>
      )}

      {/* Mobile Menu Button */}
      <button
        className="mobileMenuButton"
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        aria-label="Toggle Menu"
      >
        {isMobileMenuOpen ? <CloseOutlinedIcon /> : <MenuOutlinedIcon />}
      </button>

      <main className="mainContent">
        <div className="productGrid">
          {products.map((product) => (
            <ProductCard
              key={`${product.collectionId}-${product.id}`}
              id={product.id}
              collectionId={product.collectionId}
              name={product.name}
              price={product.price}
              imageUrl={product.imageUrl}
            />
          ))}
        </div>
      </main>
    </div>
  );
};

export default Home;