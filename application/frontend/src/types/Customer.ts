export interface Customer {
  id?: number
  userid?: string
  name: string
  email: string
  phone?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  createdAt?: string
}
