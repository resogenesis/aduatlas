import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { applyTitle } from "../lib/pageTitles";

// Sets document.title from the current route. Mount once per layout.
export const usePageTitle = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    applyTitle(pathname);
  }, [pathname]);
};
