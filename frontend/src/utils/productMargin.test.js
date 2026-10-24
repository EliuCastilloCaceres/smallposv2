// src/utils/productMargin.test.js
// Margen de producto compartido por la tabla y el detalle (spec 06, T2).
import { describe, expect, it } from 'vitest'
import { fmtMargin, productMargin } from './productMargin'

const margin = (purchase_price, sale_price) => productMargin({ purchase_price, sale_price })

describe('productMargin', () => {
  it('computes (price − cost) ÷ price as a percentage', () => {
    expect(margin(60, 100)).toBe(40)
    expect(margin(2, 3)).toBe(33.3)
    expect(margin(100, 100)).toBe(0)
  })

  it('is negative when the cost is above the price', () => {
    expect(margin(112.5, 100)).toBe(-12.5)
  })

  it('has no margin without cost or with a sale price of 0', () => {
    expect(margin(0, 100)).toBeNull()
    expect(margin(10, 0)).toBeNull()
    expect(margin(0, 0)).toBeNull()
  })

  it('rounds to one decimal, half away from zero, without floating point drift', () => {
    // 12.35% exacto: en punto flotante (100 − 87.65) / 100 da 0.12349999…
    expect(margin(87.65, 100)).toBe(12.4)
    expect(margin(112.35, 100)).toBe(-12.4)
    expect(margin(87.66, 100)).toBe(12.3)
  })

  it('accepts the amounts as strings', () => {
    expect(margin('87.65', '100.00')).toBe(12.4)
    expect(margin('0.00', '25.00')).toBeNull()
  })
})

describe('fmtMargin', () => {
  it('shows one decimal with the % sign, or "—" without margin', () => {
    expect(fmtMargin(40)).toBe('40.0%')
    expect(fmtMargin(-12.5)).toBe('-12.5%')
    expect(fmtMargin(null)).toBe('—')
  })
})
