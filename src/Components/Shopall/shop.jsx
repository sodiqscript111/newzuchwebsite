import React, { useState, useContext, useRef, useEffect } from "react";
import { useParams } from "react-router-dom";
import StoreNavigation from '../StoreNavigation/StoreNavigation';
import ProductCard from '../ProductCard/ProductCard';
import { ProductContext } from "../../context/productContext";
import MenuOutlinedIcon from '@mui/icons-material/MenuOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import '../Home/home.css';

const AllProducts = () => {
  const { collectionId } = useParams();
  const { products, loading } = useContext(ProductContext);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const categoryMap = {
    "custom-wear": ["customnative", "voguejalabiya"],
    "classic-wear": ["poisecollection"],
    "casual-wear": ["nudecolection", "beachtimecollection", "joggerset", "alpha"],
  };

  const filteredProducts = collectionId
    ? categoryMap[collectionId]
      ? products.filter(product =>
          categoryMap[collectionId].includes(product.collectionId)
        )
      : products.filter(product => product.collectionId === collectionId)
    : products;

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

      {isMobileMenuOpen && (
        <div className="mobileMenuOverlay">
          <StoreNavigation />
        </div>
      )}

      <button
        className="mobileMenuButton"
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        aria-label="Toggle Menu"
      >
        {isMobileMenuOpen ? <CloseOutlinedIcon /> : <MenuOutlinedIcon />}
      </button>

      <main className="mainContent">
        <div className="productGrid">
          {filteredProducts.length === 0 ? (
            <p>No products available.</p>
          ) : (
            filteredProducts.map((product) => (
              <ProductCard
                key={`${product.collectionId}-${product.id}`}
                id={product.id}
                collectionId={product.collectionId}
                name={product.name}
                price={product.price}
                imageUrl={product.imageUrl}
              />
            ))
          )}
        </div>
      </main>
    </div>
  );
};

export default AllProducts;
