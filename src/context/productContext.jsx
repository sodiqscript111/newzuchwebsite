import { createContext, useEffect, useState } from "react";
import PropTypes from "prop-types";
import { api } from "../api";

export const ProductContext = createContext({ products: [], collections: [], loading: true, error: null });

const toShopProduct = (product) => ({
  ...product,
  collectionId: product.collectionSlug,
  imageUrl: product.images.map((image) => image.url),
});

export const ProductProvider = ({ children }) => {
  const [state, setState] = useState({ products: [], collections: [], loading: true, error: null });

  useEffect(() => {
    let active = true;
    Promise.all([api("/products"), api("/collections")])
      .then(([products, collections]) => {
        if (active) setState({ products: products.map(toShopProduct), collections, loading: false, error: null });
      })
      .catch((error) => {
        if (active) setState((current) => ({ ...current, loading: false, error: error.message }));
      });
    return () => {
      active = false;
    };
  }, []);

  return <ProductContext.Provider value={state}>{children}</ProductContext.Provider>;
};

ProductProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
