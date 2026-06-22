import React, { useState, useEffect, useContext } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../../utils/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { CartContext } from '../../context/cart';
import StoreNavigation from '../StoreNavigation/StoreNavigation';
import MenuOutlinedIcon from '@mui/icons-material/MenuOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import './product.css';

const ProductDetail = () => {
  const { collectionName, id } = useParams();
  const { addItemToCart } = useContext(CartContext);
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [customSize, setCustomSize] = useState({
    chest: '',
    waist: '',
    hips: '',
    length: '',
  });
  const [selectedStandardSize, setSelectedStandardSize] = useState(null);
  const [isCustomSize, setIsCustomSize] = useState(false);
  const [notification, setNotification] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        if (!collectionName || !id) {
          setError("Invalid product request.");
          setLoading(false);
          return;
        }

        const productRef = doc(db, "collections", collectionName, "products", id);
        const productSnap = await getDoc(productRef);

        if (!productSnap.exists()) {
          setError("Product not found.");
          setLoading(false);
          return;
        }

        const data = productSnap.data();

        let images = [];
        if (Array.isArray(data.imageUrl)) {
          images = data.imageUrl;
        } else if (typeof data.imageUrl === 'string' && data.imageUrl.includes(',')) {
          images = data.imageUrl.split(',').map(url => url.trim());
        } else if (typeof data.imageUrl === 'string') {
          images = [data.imageUrl];
        }

        const priceRaw = data.price;
        const price = typeof priceRaw === "number" && !isNaN(priceRaw)
          ? priceRaw
          : parseFloat(priceRaw) && !isNaN(parseFloat(priceRaw))
          ? parseFloat(priceRaw)
          : 0;

        setProduct({
          id: productSnap.id,
          name: data.name || "Unknown",
          price,
          description: data.description || "No description available.",
          imageUrls: images,
          standardSizes: data.standardSizes || ["XS", "S", "M", "L", "XL"],
        });
        setLoading(false);
      } catch (error) {
        setError("Failed to load product details.");
        setLoading(false);
      }
    };

    fetchProduct();
  }, [collectionName, id]);

  const showNotification = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleImageClick = (url) => {
    setSelectedImage(url);
  };

  const closeModal = () => {
    setSelectedImage(null);
  };

  const handleAddToCart = () => {
    if (!isCustomSize && !selectedStandardSize) {
      showNotification('Please select a standard size.');
      return;
    }

    if (isCustomSize && (!customSize.chest || !customSize.waist || !customSize.hips || !customSize.length)) {
      showNotification('Please fill in all custom measurements.');
      return;
    }

    addItemToCart({
      id: product.id,
      name: product.name,
      price: product.price,
      imageUrls: product.imageUrls,
      quantity: 1,
      options: {
        size: isCustomSize ? customSize : selectedStandardSize,
      },
    });
    showNotification('Added to Cart');
  };

  const handleBuyNow = () => {
    showNotification('Purchase Feature Coming Soon!');
  };

  const handleCustomSizeChange = (e) => {
    const { name, value } = e.target;
    setCustomSize((prevSize) => ({
      ...prevSize,
      [name]: value,
    }));
  };

  if (loading) return <div className="product-loading">Loading...</div>;
  if (error) return <div className="product-error">{error}</div>;
  if (!product) return <div className="product-error">Product not found</div>;

  return (
    <div className="product-detail-container">
      {notification && (
        <div className="notification">
          {notification}
        </div>
      )}

      <div className="gallerySection">
        <div className="galleryContainer">
          {product.imageUrls.length > 0 ? (
            product.imageUrls.map((url, index) => (
              <div key={index} className="imageWrapper">
                <img
                  src={url}
                  alt={`${product.name} - View ${index + 1}`}
                  className="gallery-image"
                  onClick={() => handleImageClick(url)}
                  style={{ cursor: 'pointer' }}
                />
              </div>
            ))
          ) : (
            <div className="no-image-placeholder">No Images Available</div>
          )}
        </div>
      </div>

      <div className="infoSection">
        <div className="product-info-header">
          <h1 className="name">{product.name}</h1>
          <p className="price">₦{product.price.toLocaleString('en-NG', { minimumFractionDigits: 2 })}</p>
        </div>

        <div className="description">
          <p>{product.description}</p>
        </div>

        {collectionName === "zuchclassics" ? (
          <div className="appointment-section">
            <h3 className="sectionTitle">Custom Order</h3>
            <p className="appointment-text">This is a ZUCH Classics item. Book an appointment to customize your order.</p>
            <a href="https://instagram.com/Zuch_Collection" target="_blank" rel="noopener noreferrer">
              <button className="book-appointment-button">Book Appointment</button>
            </a>
          </div>
        ) : (
          <div className="section">
            <div className="size-toggle">
              <button
                className={`toggle-button ${!isCustomSize ? 'active' : ''}`}
                onClick={() => setIsCustomSize(false)}
              >
                Standard Sizes
              </button>
              <button
                className={`toggle-button ${isCustomSize ? 'active' : ''}`}
                onClick={() => setIsCustomSize(true)}
              >
                Custom Size
              </button>
            </div>

            {!isCustomSize ? (
              <>
                <h3 className="sectionTitle">Select Size</h3>
                <div className="sizeGrid">
                  {product.standardSizes.map((size, index) => (
                    <button
                      key={index}
                      className={`sizeButton ${selectedStandardSize === size ? 'selected' : ''}`}
                      onClick={() => setSelectedStandardSize(size)}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <h3 className="sectionTitle">Measurements (cm)</h3>
                <div className="custom-size-inputs">
                  <input type="number" name="chest" placeholder="Chest" value={customSize.chest} onChange={handleCustomSizeChange} />
                  <input type="number" name="waist" placeholder="Waist" value={customSize.waist} onChange={handleCustomSizeChange} />
                  <input type="number" name="hips" placeholder="Hips" value={customSize.hips} onChange={handleCustomSizeChange} />
                  <input type="number" name="length" placeholder="Length" value={customSize.length} onChange={handleCustomSizeChange} />
                </div>
              </>
            )}

            <div className="actions">
              <button className="button buyButton" onClick={handleBuyNow}>
                Buy Now
              </button>
              <button className="button cartButton" onClick={handleAddToCart}>
                Add to Cart
              </button>
            </div>
          </div>
        )}
      </div>

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

      {/* Image Modal */}
      {selectedImage && (
        <div className="image-modal-overlay" onClick={closeModal}>
          <div className="image-modal-content" onClick={(e) => e.stopPropagation()}>
            <img src={selectedImage} alt="Enlarged product view" className="enlarged-image" />
            <button className="close-modal-btn" onClick={closeModal}>×</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductDetail;