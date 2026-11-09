import {
  createBrowserRouter,
  RouterProvider,
} from "react-router-dom";
import "./App.css";
import Home from "./Components/Home/home";
import ProductDetail from "./Components/Product/product";
import Cart from "./Components/Cart/cart";
import Shopall from "./Components/Shopall/shop";
import Contact from "./Components/Contact/Contact";
import About from "./Components/About/about";
import Elegant from "./Components/Elegant/elegant";
import OrderPage from "./Components/Orders/OrderPage";
import TrackOrder from "./Components/Orders/TrackOrder";
import Account from "./Components/Account/Account";
import Landing from "./Components/Landing/Landing";
import Layout from "./Components/Layout/Layout";
import { ProductProvider } from "./context/productContext";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Landing />,
  },
  {
    element: <Layout />,
    children: [
      { path: "/home", element: <Home /> },
      { path: "/clothes", element: <Shopall /> },
      { path: "/shopall", element: <Shopall /> },
      { path: "/shopall/:collectionId", element: <Shopall /> },
      { path: "/product/:collectionName/:id", element: <ProductDetail /> },
      { path: "/cart", element: <Cart /> },
      { path: "/orders/:number/:token", element: <OrderPage /> },
      { path: "/orders/:number", element: <OrderPage /> },
      { path: "/track", element: <TrackOrder /> },
      { path: "/account", element: <Account /> },
      { path: "/elegant", element: <Elegant /> },
      { path: "/contact", element: <Contact /> },
      { path: "/about", element: <About /> },
    ],
  },
]);

function App() {
  return (
    <ProductProvider>
      <div className="app-wrapper">
        <RouterProvider router={router} />
      </div>
    </ProductProvider>
  );
}

export default App;
