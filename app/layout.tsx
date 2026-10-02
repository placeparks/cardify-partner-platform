import type { Metadata } from "next"
import { Navigation } from "@/components/navigation"
import "./globals.css"


export const metadata: Metadata = {
  title: "TCGPlaytest Partner Platform - Manufacturing REST API",
  description: "Connect your store to TCGPlaytest for custom card printing and fulfillment with our checkout widget and REST API.",
  icons: {
    icon: { url: "/pwa-icons/favicon.svg", type: "image/svg+xml", sizes: "any" },
    shortcut: "/pwa-icons/favicon.svg",
    apple: "/pwa-icons/icon-192-v3.png",
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">
        <Navigation />
        <main>{children}</main>
      </body>
    </html>
  )
}
