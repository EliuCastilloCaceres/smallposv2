// src/components/Purchases/modals/PurchaseFormModal.test.jsx
// Formulario de nueva compra con la API simulada (spec 14, T7): el buscador,
// el SKU exacto del lector de códigos de barras, las variantes, la suma de la
// cantidad al repetir, el costo inicial, subtotales y total, "Pagado desde
// caja" solo con Efectivo y con la caja, y lo que se manda.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../../services/api'
import { todayInAppTimezone } from '../../../utils/dateRanges'
import PurchaseFormModal from './PurchaseFormModal'

vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }))

const money = (n) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

const OPTIONS = {
  payment_methods: [{ payment_method_id: 8, code: 'cash', name: 'Efectivo' }, { payment_method_id: 10, code: 'transfer', name: 'Transferencia Bancaria' }],
  providers:       [{ provider_id: 4, name: 'Pepsi' }, { provider_id: 1, name: 'Proveedor generico' }],
  registers:       [
    { cash_register_id: 1, name: 'Caja 1', branch_id: 1 },
    { cash_register_id: 5, name: 'Caja Norte', branch_id: 2 },
  ],
  branches:        [{ branch_id: 1, name: 'Sucursal Central' }, { branch_id: 2, name: 'Sucursal Norte' }],
}
const BRANCH_OPTIONS = { ...OPTIONS, registers: [OPTIONS.registers[0]], branches: undefined }

const SODA = {
  product_id: 20, name: 'Coca-Cola 600 ml', sku: 'COC-600', uom: 'pza', purchase_price: 12.5,
  is_variable: false, stock: 30, variants: [],
}
const NEW_ITEM = {
  product_id: 21, name: 'Agua mineral', sku: 'AGU-1', uom: 'pza', purchase_price: 0,
  is_variable: false, stock: 0, variants: [],
}
const SHIRT = {
  product_id: 30, name: 'Playera básica', sku: 'PLY', uom: 'pza', purchase_price: 50, is_variable: true, stock: null,
  variants: [
    { variant_id: 301, label: 'CH', sku: 'PLY-CH', stock: 4 },
    { variant_id: 302, label: 'M',  sku: 'PLY-M',  stock: 6 },
  ],
}

// GET /purchases/products: lo que encuentra cada búsqueda
const mockProducts = (bySearch) => {
  api.get.mockImplementation((url, { params }) => Promise.resolve({ data: { data: bySearch[params.search] ?? [] } }))
}

const renderForm = ({ options = BRANCH_OPTIONS, isCentralAdmin = false, posRegister } = {}) => {
  const onSaved = vi.fn()
  render(
    <PurchaseFormModal options={options} isCentralAdmin={isCentralAdmin} posRegister={posRegister}
      onSaved={onSaved} onClose={vi.fn()} />
  )
  return { onSaved }
}

const change = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const searchBox = () => screen.getByLabelText('Buscar producto')

// Escribe en el buscador y elige la opción del desplegable
const pickProduct = async (search, option) => {
  fireEvent.change(searchBox(), { target: { value: search } })
  const results = await screen.findByRole('listbox', { name: 'Productos encontrados' })
  fireEvent.click(within(results).getByRole('option', { name: option }))
}

// Enter en el buscador, como el lector de códigos de barras
const scan = (code) => {
  fireEvent.change(searchBox(), { target: { value: code } })
  fireEvent.keyDown(searchBox(), { key: 'Enter' })
}

const lines = () => screen.queryByRole('list', { name: 'Productos de la compra' })

// FormData de la última llamada a POST /purchases, como objeto
const sentForm = () => {
  const [url, form] = api.post.mock.calls.at(-1)
  expect(url).toBe('purchases')
  const fields = Object.fromEntries(form.entries())
  return { ...fields, items: JSON.parse(fields.items) }
}

describe('PurchaseFormModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.post.mockResolvedValue({ data: { data: { purchase_id: 9 } } })
    mockProducts({ coca: [SODA], 'COC-600': [SODA], agua: [NEW_ITEM], 'PLY-M': [SHIRT], PLY: [SHIRT] })
  })

  it('searches products and adds the chosen one with its current cost as the unit cost', async () => {
    renderForm()

    await pickProduct('coca', /Coca-Cola 600 ml/)

    expect(api.get).toHaveBeenCalledWith('purchases/products', { params: { search: 'coca' } })
    expect(within(lines()).getByText('Coca-Cola 600 ml')).toBeInTheDocument()
    expect(screen.getByLabelText('Cantidad de Coca-Cola 600 ml')).toHaveValue(1)
    expect(screen.getByLabelText('Costo unitario de Coca-Cola 600 ml')).toHaveValue(12.5)
    expect(searchBox()).toHaveValue('')
  })

  it('leaves the unit cost empty for a product without cost', async () => {
    renderForm()

    await pickProduct('agua', /Agua mineral/)

    expect(screen.getByLabelText('Costo unitario de Agua mineral')).toHaveValue(null)
  })

  it('adds a product by its exact SKU on Enter, and adds 1 when it is scanned again', async () => {
    renderForm()

    scan('COC-600')
    await screen.findByLabelText('Cantidad de Coca-Cola 600 ml')
    scan('COC-600')

    await waitFor(() => expect(screen.getByLabelText('Cantidad de Coca-Cola 600 ml')).toHaveValue(2))
    expect(within(lines()).getAllByRole('listitem')).toHaveLength(1)
  })

  it('adds a variant by its SKU, and shows the variants for the SKU of a variable product', async () => {
    renderForm()

    scan('PLY-M')
    expect(await screen.findByLabelText('Cantidad de Playera básica (M)')).toHaveValue(1)

    scan('PLY')
    const results = await screen.findByRole('listbox', { name: 'Productos encontrados' })
    expect(within(results).getAllByRole('option').map(o => o.textContent)).toEqual([
      expect.stringContaining('· CH'), expect.stringContaining('· M'),
    ])
    expect(within(lines()).getAllByRole('listitem')).toHaveLength(1)
  })

  it('shows the subtotal of each line and the total of the purchase, and removes a line', async () => {
    renderForm()
    await pickProduct('coca', /Coca-Cola 600 ml/)
    await pickProduct('PLY', /· CH/)

    change('Cantidad de Coca-Cola 600 ml', '24')
    change('Costo unitario de Coca-Cola 600 ml', '9.5')
    change('Cantidad de Playera básica (CH)', '2')

    expect(screen.getByLabelText('Subtotal de Coca-Cola 600 ml')).toHaveTextContent(money(228))
    expect(screen.getByLabelText('Subtotal de Playera básica (CH)')).toHaveTextContent(money(100))
    expect(screen.getByLabelText('Total de la compra')).toHaveTextContent(money(328))

    fireEvent.click(screen.getByRole('button', { name: 'Quitar Playera básica (CH)' }))
    expect(screen.getByLabelText('Total de la compra')).toHaveTextContent(money(228))
  })

  it('offers "Pagado desde caja" only with Efectivo, and then asks for the register', () => {
    renderForm()

    change(/Método de pago/, '10')
    expect(screen.queryByRole('checkbox', { name: /Pagado desde caja/ })).not.toBeInTheDocument()

    change(/Método de pago/, '8')
    fireEvent.click(screen.getByRole('checkbox', { name: /Pagado desde caja/ }))

    // Con una sola caja abierta, ya viene elegida; la fecha queda en hoy
    expect(screen.getByLabelText(/^Caja/)).toHaveValue('1')
    expect(screen.getByLabelText(/Fecha de la compra/)).toBeDisabled()
    expect(screen.getByLabelText(/Fecha de la compra/)).toHaveValue(todayInAppTimezone())
  })

  it('sends the header and the lines', async () => {
    const { onSaved } = renderForm()
    await pickProduct('coca', /Coca-Cola 600 ml/)
    await pickProduct('PLY', /· CH/)
    change(/Proveedor/, '4')
    change(/Método de pago/, '10')
    change('Cantidad de Coca-Cola 600 ml', '24')
    change('Costo unitario de Coca-Cola 600 ml', '9.5')
    change(/Folio/, ' F-100 ')
    change(/Notas/, ' Faltó una caja ')

    fireEvent.click(screen.getByRole('button', { name: /Registrar compra/ }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ purchase_id: 9 }))
    expect(sentForm()).toEqual({
      purchase_date: todayInAppTimezone(), provider_id: '4', payment_method_id: '10',
      folio: 'F-100', notes: 'Faltó una caja',
      items: [
        { product_id: 20, variant_id: null, quantity: 24, unit_cost: 9.5 },
        { product_id: 30, variant_id: 301,  quantity: 1,  unit_cost: 50 },
      ],
    })
  })

  it('sends the register of a purchase paid from it', async () => {
    renderForm()
    await pickProduct('coca', /Coca-Cola 600 ml/)
    change(/Proveedor/, '4')
    change(/Método de pago/, '8')
    fireEvent.click(screen.getByRole('checkbox', { name: /Pagado desde caja/ }))

    fireEvent.click(screen.getByRole('button', { name: /Registrar compra/ }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(sentForm()).toMatchObject({ payment_method_id: '8', paid_from_register: 'true', cash_register_id: '1' })
  })

  it('asks the central admin for the branch, and searches the stock of that branch', async () => {
    renderForm({ options: OPTIONS, isCentralAdmin: true })

    change(/Sucursal/, '2')
    await pickProduct('coca', /Coca-Cola 600 ml/)

    expect(api.get).toHaveBeenCalledWith('purchases/products', { params: { search: 'coca', branch_id: '2' } })
  })

  it.each([
    ['without provider', async () => { await pickProduct('coca', /Coca-Cola 600 ml/) }, 'Elige el proveedor'],
    ['without products', async () => { change(/Proveedor/, '4') }, 'Agrega al menos un producto a la compra'],
    ['with a line without cost', async () => {
      change(/Proveedor/, '4')
      await pickProduct('agua', /Agua mineral/)
    }, 'Línea 1: el costo unitario debe ser mayor a 0'],
  ])('does not send a purchase %s', async (_, fill, message) => {
    renderForm()
    await fill()
    change(/Método de pago/, '10')

    fireEvent.submit(screen.getByRole('dialog', { name: 'Nueva compra' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(api.post).not.toHaveBeenCalled()
  })

  it('shows the error of the backend', async () => {
    api.post.mockRejectedValue({ response: { data: { message: 'Línea 1: el producto no existe o está inactivo' } } })
    renderForm()
    await pickProduct('coca', /Coca-Cola 600 ml/)
    change(/Proveedor/, '4')
    change(/Método de pago/, '10')

    fireEvent.click(screen.getByRole('button', { name: /Registrar compra/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Línea 1: el producto no existe o está inactivo')
  })
})
