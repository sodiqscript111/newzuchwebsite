import React from "react";
import { Outlet } from "react-router-dom";
import Header from "../Header/Header";

const Layout = () => {
  return (
    <>
      <Header />
      <main style={{ paddingTop: '80px', minHeight: '100vh' }}>
        <Outlet />
      </main>
    </>
  );
};

export default Layout;
