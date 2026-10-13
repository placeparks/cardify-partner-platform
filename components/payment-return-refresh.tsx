'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function PaymentReturnRefresh() {
  const router = useRouter()
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 4000)
    const stop = setTimeout(() => clearInterval(timer), 120000)
    return () => { clearInterval(timer); clearTimeout(stop) }
  }, [router])
  return null
}
