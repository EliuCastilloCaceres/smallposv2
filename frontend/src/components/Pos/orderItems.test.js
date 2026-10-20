// src/components/Pos/orderItems.test.js
import { describe, expect, it } from 'vitest'
import { toOrderItems } from './orderItems'

describe('toOrderItems', () => {
  it('maps cart items to order lines without purchase_price', () => {
    const cart = [
      { product_id: 7, variant_id: 3, name: 'Tenis — 26', sku: 'TEN-26', unit_price: 70, original_price: 70, quantity: 2, stock: 5 },
      { product_id: 9, name: 'Gorra', unit_price: 20, quantity: 1 },
    ]

    expect(toOrderItems(cart)).toEqual([
      { product_id: 7, variant_id: 3,    quantity: 2, unit_price: 70, discount: 0 },
      { product_id: 9, variant_id: null, quantity: 1, unit_price: 20, discount: 0 },
    ])
  })

  it('drops the purchase_price of a cart saved before the server took the cost', () => {
    const savedCart = [{ product_id: 7, variant_id: null, unit_price: 70, purchase_price: 30, quantity: 1 }]

    expect(toOrderItems(savedCart)[0]).not.toHaveProperty('purchase_price')
  })
})
