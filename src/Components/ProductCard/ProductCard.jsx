import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import './ProductCard.css';

const ProductCard = ({ id, collectionId, name, price, imageUrl }) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  // Parse imageUrl into an array
  let images = [];
  if (Array.isArray(imageUrl)) {
    images = imageUrl;
  } else if (typeof imageUrl === 'string' && imageUrl.includes(',')) {
    images = imageUrl.split(',').map(url => url.trim());
  } else if (typeof imageUrl === 'string') {
    images = [imageUrl];
  } else {
    images = ["https://placehold.co/300"];
  }

  const nextImage = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };

  const prevImage = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  // When hovered, show the second image if available, else keep the index
  const displayIndex = isHovered && currentImageIndex === 0 && images.length > 1
    ? 1
    : currentImageIndex;

  return (
    <Link to={`/product/${collectionId}/${id}`} className="cardLink">
      <div
        className="card"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          setCurrentImageIndex(0);
        }}
      >
        <div className="imageContainer">
          <img
            src={images[displayIndex]}
            alt={name}
            className="image"
            loading="lazy"
          />

          {isHovered && images.length > 1 && (
            <>
              <button className="navButton prevButton" onClick={prevImage}>
                <ChevronLeftIcon fontSize="small" />
              </button>
              <button className="navButton nextButton" onClick={nextImage}>
                <ChevronRightIcon fontSize="small" />
              </button>
            </>
          )}
        </div>

        <div className="info">
          <span>{name}</span>
          {isHovered ? (
            <span className="colorIndicator">One Color</span>
          ) : (
            <span>
              ₦{price.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
};

export default ProductCard;
