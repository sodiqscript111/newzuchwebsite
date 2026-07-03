// src/context/ProductContext.jsx
import React, { createContext, useState, useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../utils/firebase";

export const ProductContext = createContext();

export const ProductProvider = ({ children }) => {
  const [products, setProducts] = useState([]);
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAllData = () => {
      setLoading(true);
      console.log("Setting up real-time listeners...");

      // Listen to collections
      const collectionsRef = collection(db, "collections");
      const unsubscribeCollections = onSnapshot(collectionsRef, (collectionsSnapshot) => {
        if (collectionsSnapshot.empty) {
          console.log("No collections found in Firestore.");
          setCollections([]);
          setProducts([]);
          setLoading(false);
          return;
        }

        const productsList = [];
        let defaultImage = "https://placehold.co/150"; // Final fallback

        // Fetch all products in real-time
        const collectionPromises = collectionsSnapshot.docs.map((doc) => {
          const collectionId = doc.id;
          const productsRef = collection(db, "collections", collectionId, "products");
          return new Promise((resolve) => {
            onSnapshot(productsRef, (productsSnapshot) => {
              productsSnapshot.forEach((productDoc) => {
                const data = productDoc.data();
                const imageUrl = Array.isArray(data.imageUrl) && data.imageUrl.length > 0
                  ? data.imageUrl[0]
                  : data.imageUrl;
                const product = {
                  id: productDoc.id,
                  collectionId: collectionId,
                  name: data.name || "Unknown",
                  price: data.price || 0,
                  imageUrl: imageUrl || defaultImage, // Use default if empty
                };
                productsList.push(product);
                // Update defaultImage if valid
                if (imageUrl && !defaultImage.startsWith("https://placehold.co")) {
                  defaultImage = imageUrl;
                  console.log(`Found valid product image for fallback: ${defaultImage}`);
                }
              });
              resolve();
            }, (error) => {
              console.error(`Error fetching products for ${collectionId}:`, error);
              resolve();
            });
          });
        });

        // Wait for all product fetches to complete
        Promise.all(collectionPromises).then(() => {
          // Inject Y-Cut Kaftan manually
          productsList.push({
            id: "ycutkaftan",
            collectionId: "customnative",
            name: "Y-Cut Kaftan",
            price: 80000,
            imageUrl: [
              "/images/y-cut-kaftan/1.jpeg",
              "/images/y-cut-kaftan/2.jpeg",
              "/images/y-cut-kaftan/3.jpeg",
              "/images/y-cut-kaftan/4.jpeg",
              "/images/y-cut-kaftan/5.jpeg"
            ]
          });

          // Inject Jogger Set products manually
          const joggerColors = [
            { id: "jogger-ash", name: "Ash", file: "ash.png" },
            { id: "jogger-brown", name: "Brown", file: "brown.png" },
            { id: "jogger-navy", name: "Navy Blue", file: "navyblue.png" },
            { id: "jogger-beige", name: "Beige", file: "beige.png" },
            { id: "jogger-black", name: "Black", file: "black.png" },
            { id: "jogger-green", name: "Green", file: "green.png" }
          ];

          joggerColors.forEach(color => {
            productsList.push({
              id: color.id,
              collectionId: "joggerset",
              name: color.name,
              price: 45000, // Placeholder price
              imageUrl: `/images/joggerset/${color.file}`
            });
          });

          const collectionsData = collectionsSnapshot.docs.map((doc) => {
            const collectionId = doc.id;
            return {
              id: collectionId,
              name: `${collectionId.replace(/collection/i, "").replace(/^\w/, (c) => c.toUpperCase())} Collection`,
              image: defaultImage, // Use a valid product image as default
            };
          });

          // Inject Joggerset collection
          collectionsData.push({
            id: "joggerset",
            name: "Jogger Set",
            image: "/images/joggerset/black.png"
          });

          console.log("Real-time Collections:", collectionsData);
          console.log("Real-time Products:", productsList);
          console.log("Default Image Used:", defaultImage);

          setCollections(collectionsData);
          setProducts(productsList);
          setLoading(false);
        });
      }, (error) => {
        console.error("Error fetching collections:", error);
        setLoading(false);
      });

      // Cleanup listener on unmount
      return () => unsubscribeCollections();
    };

    fetchAllData();
  }, []);

  return (
    <ProductContext.Provider value={{ products, collections, loading }}>
      {children}
    </ProductContext.Provider>
  );
};