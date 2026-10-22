import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import App from "./App"
import { TooltipProvider } from "@/components/ui/tooltip"
import "./index.css"

// Follow the system theme, including live changes.
const dark = window.matchMedia("(prefers-color-scheme: dark)")
const applyTheme = () => document.documentElement.classList.toggle("dark", dark.matches)
applyTheme()
dark.addEventListener("change", applyTheme)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TooltipProvider>
      <App />
    </TooltipProvider>
  </StrictMode>,
)
