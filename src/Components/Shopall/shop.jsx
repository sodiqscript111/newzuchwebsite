import React, { useState, useContext } from "react";
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
    "custom-wear": ["customnative", "zuchclassics"],
    "classic-wear": ["lumincolection", "poisecollection", "amorcollection"],
    "casual-wear": ["nudecolection", "streetvouge", "beachtimecollection"],
  };

  const filteredProducts = collectionId
    ? categoryMap[collectionId]
      ? products.filter(product =>
          categoryMap[collectionId].includes(product.collectionId)
        )
      : products.filter(product => product.collectionId === collectionId)
    : products;

  if (loading) {
    return <div className="home-loading">Loading products...</div>;
  }

  return (
    <div className="home-container">
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
