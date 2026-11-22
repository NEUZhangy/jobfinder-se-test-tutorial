import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app";
import { Toaster } from "@/components/ui/sonner";
import "@/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <Toaster
      richColors
      closeButton
      position="top-center"
      offset={{ top: 64 }}
      mobileOffset={{ top: 64 }}
    />
  </StrictMode>,
);
