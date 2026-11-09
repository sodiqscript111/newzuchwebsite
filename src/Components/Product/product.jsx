import { useContext, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, formatNaira } from '../../api';
import { CartContext } from '../../context/cart';
import StoreNavigation from '../StoreNavigation/StoreNavigation';
import MenuOutlinedIcon from '@mui/icons-material/MenuOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import './product.css';

const MEASUREMENTS = ['chest', 'waist', 'hips', 'length'];

const ProductDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addItemToCart } = useContext(CartContext);
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [customSize, setCustomSize] = useState({ chest: '', waist: '', hips: '', length: '' });
  const [selectedStandardSize, setSelectedStandardSize] = useState(null);
  const [isCustomSize, setIsCustomSize] = useState(false);
  const [notification, setNotification] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api(`/products/${encodeURIComponent(id)}`)
      .then((data) => {
        if (!active) return;
        setProduct(data);
        setError(null);
      })
      .catch((err) => active && setError(err.status === 404 ? 'Product not found.' : err.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id]);

  const showNotification = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const addToCart = () => {
    if (!isCustomSize && !selectedStandardSize) {
      showNotification('Please select a size.');
      return false;
    }
    const measurements = Object.fromEntries(MEASUREMENTS.map((key) => [key, Number(customSize[key])]));
    if (isCustomSize && Object.values(measurements).some((value) => !(value > 0))) {
      showNotification('Please fill in all custom measurements.');
      return false;
    }
    addItemToCart({
      productId: product.id,
      collectionSlug: product.collectionSlug,
      name: product.name,
      price: product.price,
      imageUrl: product.images[0]?.url ?? null,
      quantity: 1,
      ...(isCustomSize ? { measurements } : { size: selectedStandardSize }),
    });
    return true;
  };

  const handleAddToCart = () => {
    if (addToCart()) showNotification('Added to Cart');
  };

  const handleBuyNow = () => {
    if (addToCart()) navigate('/cart');
  };

  const handleCustomSizeChange = (e) => {
    const { name, value } = e.target;
    setCustomSize((prevSize) => ({ ...prevSize, [name]: value }));
  };

  if (loading) return <div className="product-loading">Loading...</div>;
  if (error) return <div className="product-error">{error}</div>;
  if (!product) return <div className="product-error">Product not found</div>;

  const imageUrls = product.images.map((image) => image.url);
  const sizes = product.sizes.length > 0 ? product.sizes : ['S', 'M', 'L', 'XL'];

  return (
    <div className="product-detail-container">
      {notification && <div className="notification" role="status">{notification}</div>}

      <div className="gallerySection">
        <div className="galleryContainer">
          {imageUrls.length > 0 ? (
            imageUrls.map((url, index) => (
              <div key={url} className="imageWrapper">
                <img
                  src={url}
                  alt={`${product.name} - View ${index + 1}`}
                  className="gallery-image"
                  onClick={() => setSelectedImage(url)}
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
          <p className="price">{product.price === null ? product.priceNote || 'Price on request' : formatNaira(product.price)}</p>
        </div>

        {product.description && (
          <div className="description">
            <p>{product.description}</p>
          </div>
        )}

        {product.price === null ? (
          <div className="appointment-section">
            <h3 className="sectionTitle">Custom Order</h3>
            <p className="appointment-text">Book an appointment to customize this piece.</p>
            <a href="https://instagram.com/Zuch_Collection" target="_blank" rel="noopener noreferrer">
              <button className="book-appointment-button">Book Appointment</button>
            </a>
          </div>
        ) : (
          <div className="section">
            <div className="size-toggle">
              <button className={`toggle-button ${!isCustomSize ? 'active' : ''}`} onClick={() => setIsCustomSize(false)}>
                Standard Sizes
              </button>
              <button className={`toggle-button ${isCustomSize ? 'active' : ''}`} onClick={() => setIsCustomSize(true)}>
                Custom Size
              </button>
            </div>

            {!isCustomSize ? (
              <>
                <h3 className="sectionTitle">Select Size</h3>
                <div className="sizeGrid">
                  {sizes.map((size) => (
                    <button
                      key={size}
                      className={`sizeButton ${selectedStandardSize === size ? 'selected' : ''}`}
                      aria-pressed={selectedStandardSize === size}
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
                  {MEASUREMENTS.map((key) => (
                    <input
                      key={key}
                      type="number"
                      min="1"
                      inputMode="decimal"
                      name={key}
                      aria-label={`${key} in cm`}
                      placeholder={key[0].toUpperCase() + key.slice(1)}
                      value={customSize[key]}
                      onChange={handleCustomSizeChange}
                    />
                  ))}
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

      {selectedImage && (
        <div className="image-modal-overlay" onClick={() => setSelectedImage(null)}>
          <div className="image-modal-content" onClick={(e) => e.stopPropagation()}>
            <img src={selectedImage} alt="Enlarged product view" className="enlarged-image" />
            <button className="close-modal-btn" onClick={() => setSelectedImage(null)} aria-label="Close">×</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductDetail;
