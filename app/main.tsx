import { StrictMode } from "react"
import { createRoot, hydrateRoot } from "react-dom/client"

import App from "./App"
import { TooltipProvider } from "@/components/ui/tooltip"
import "./index.css"

// Follow the system theme, including live changes.
const dark = window.matchMedia("(prefers-color-scheme: dark)")
const applyTheme = () => document.documentElement.classList.toggle("dark", dark.matches)
applyTheme()
dark.addEventListener("change", applyTheme)

const app = (
  <StrictMode>
    <TooltipProvider>
      <App />
    </TooltipProvider>
  </StrictMode>
)
// Production pages arrive pre-rendered (see scripts/prerender.mjs); dev starts empty.
const root = document.getElementById("root")!
if (root.hasChildNodes()) hydrateRoot(root, app)
else createRoot(root).render(app)
