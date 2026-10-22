import { renderToString } from "react-dom/server"

import App from "./App"
import { TooltipProvider } from "@/components/ui/tooltip"
import { FAQ } from "@/lib/faq"

/** Pre-renders the page at build time so search engines get real HTML. */
export function render() {
  return renderToString(
    <TooltipProvider>
      <App />
    </TooltipProvider>,
  )
}

export { FAQ }
