import { createBrowserRouter } from "react-router";

import Home from "../Home.tsx";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Home />,
  },
]);

export default router;
