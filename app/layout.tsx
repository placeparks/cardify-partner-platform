import type { Metadata } from "next"
import { Navigation } from "@/components/navigation"
import "./globals.css"


export const metadata: Metadata = {
  title: "TCGPlaytest Partner Platform - Manufacturing REST API",
  description: "Server-side cart handoff for client-supplied artwork, affiliate attribution, and TCGPlaytest manufacturing and fulfillment.",
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
