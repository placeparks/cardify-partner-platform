import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { Navigation } from "@/components/navigation"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Cardify Partner Platform - Sell custom printed cards on your site",
  description: "Embed the Cardify checkout on your site, sell custom printed cards at your price, and get paid automatically. Printing and shipping fulfilled by TCGPlaytest.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Navigation />
        <main>{children}</main>
      </body>
    </html>
  )
}
