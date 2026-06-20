// src/App.jsx
import {
  createBrowserRouter,
  RouterProvider,
} from "react-router-dom";
import "./App.css";
import Home from "./Components/Home/home";
import Allclothes from "./Components/Shopall/shop";
import ProductDetail from "./Components/Product/product";
import Cart from "./Components/Cart/cart";
import Shopall from "./Components/Shopall/shop";
import Contact from "./Components/Contact/Contact";
import About from "./Components/About/about";
import Elegant from "./Components/Elegant/elegant";

import { ProductProvider } from "./context/productContext"; // Import ProductProvider

import Layout from "./Components/Layout/Layout";

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      {
        path: "/",
        element: <Home />,
      },
      {
        path: "/clothes",
        element: <Allclothes />,
      },
      {
        path: "/product/:collectionName/:id",
        element: <ProductDetail />,
      },
      {
        path: "/cart",
        element: <Cart />,
      },
      {
        path: "/shopall/:collectionId",
        element: <Shopall />,
      },
      {
        path: "/elegant",
        element: <Elegant/>,
      },
      {
        path: "/shopall",
        element: <Shopall />,
      },
      {
        path: "/contact",
        element: <Contact />,
      },
      {
        path: "/about",
        element: <About />,
      }
    ]
  }
]);


function App({ user }) {
  return (
    <ProductProvider>
      <div className="app-wrapper">
        <RouterProvider router={router} />
      </div>
    </ProductProvider>
  );
}

export default App;