export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'

export type PaymentMethod = 'PAY_ON_DELIVERY' | 'ONLINE_PAYMENT'

export interface OrderItem {
  id?: number
  productId?: number
  productNameSnapshot?: string
  quantity: number
  unitPrice: number
  subtotal: number
}

export interface Order {
  id?: number
  orderNumber?: string
  status: OrderStatus
  paymentMethod: PaymentMethod
  orderDate?: string
  customer?: {
    id?: number
    userid?: string
    name: string
    email: string
  }
  deliveryAddress?: string
  deliveryCity?: string
  deliveryState?: string
  deliveryPostalCode?: string
  subtotal?: number
  total?: number
  items?: OrderItem[]
}
