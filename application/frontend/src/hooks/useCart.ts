import { useState, useEffect } from 'react'
import { Product } from '../types/Product'
import { useAuth } from '../context/AuthContext'

export interface CartItem {
  product: Product
  quantity: number
}

const CART_STORAGE_PREFIX = 'devshop_cart:'

function cartKeyFor(userid?: string): string {
  // Isolate carts per authenticated user; anonymous shoppers share a guest cart.
  return CART_STORAGE_PREFIX + (userid ? userid : 'guest')
}

function loadCart(key: string): CartItem[] {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as CartItem[]) : []
  } catch {
    return []
  }
}

function saveCart(key: string, items: CartItem[]): void {
  localStorage.setItem(key, JSON.stringify(items))
}

export function useCart() {
  const { user } = useAuth()
  const [key, setKey] = useState<string>(() => cartKeyFor(user?.userid))
  const [items, setItems] = useState<CartItem[]>(() => loadCart(cartKeyFor(user?.userid)))

  // When the authenticated identity changes (login/logout), switch to that
  // user's isolated cart instead of leaking the previous shopper's items.
  useEffect(() => {
    const nextKey = cartKeyFor(user?.userid)
    if (nextKey !== key) {
      setKey(nextKey)
      setItems(loadCart(nextKey))
    }
  }, [user, key])

  // Persist to localStorage whenever the cart changes
  useEffect(() => {
    saveCart(key, items)
  }, [items, key])

  function addToCart(product: Product): void {
    setItems(prev => {
      const existing = prev.find(i => i.product.id === product.id)
      if (existing) {
        // Don't exceed available stock
        if (existing.quantity >= product.stock) return prev
        return prev.map(i =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        )
      }
      if (product.stock === 0) return prev
      return [...prev, { product, quantity: 1 }]
    })
  }

  function removeFromCart(productId: number): void {
    setItems(prev => prev.filter(i => i.product.id !== productId))
  }

  function increaseQuantity(productId: number, maxStock: number): void {
    setItems(prev =>
      prev.map(i =>
        i.product.id === productId && i.quantity < maxStock
          ? { ...i, quantity: i.quantity + 1 }
          : i
      )
    )
  }

  function decreaseQuantity(productId: number): void {
    setItems(prev =>
      prev
        .map(i =>
          i.product.id === productId ? { ...i, quantity: i.quantity - 1 } : i
        )
        .filter(i => i.quantity > 0)
    )
  }

  function clearCart(): void {
    setItems([])
  }

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0)
  const subtotal = items.reduce(
    (sum, i) => sum + i.product.price * i.quantity,
    0
  )

  return {
    items,
    totalItems,
    subtotal,
    addToCart,
    removeFromCart,
    increaseQuantity,
    decreaseQuantity,
    clearCart,
  }
}
