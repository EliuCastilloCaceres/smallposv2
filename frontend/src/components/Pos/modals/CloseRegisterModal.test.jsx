// src/components/Pos/modals/CloseRegisterModal.test.jsx
// El retiro del corte se registra como retiro (spec 12, T2).
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CloseRegisterModal from './CloseRegisterModal'

const createCashMovement = vi.fn().mockResolvedValue({ cashMovementId: 1 })
const closeRegister      = vi.fn().mockResolvedValue({ difference: 0, expectedClose: 105, cashCounted: 105, withdrawAmt: 40, closeAmount: 65 })

vi.mock('../../../context/PosContext', () => ({
  usePos: () => ({
    activeRegister: { name: 'Caja 1' },
    fetchRegisterStatus: () => Promise.resolve({
      paymentBreakdown: [{ payment_method_id: 8, code: 'cash', name: 'Efectivo', expected: 105 }],
    }),
    closeRegister,
    createCashMovement,
  }),
}))
vi.mock('../printCorteReport', () => ({ openCorteReportWindow: vi.fn() }))

describe('CloseRegisterModal', () => {
  it('registers the cash cut withdrawal as a withdrawal before closing', async () => {
    render(<CloseRegisterModal onClose={vi.fn()} />)

    fireEvent.change(await screen.findByLabelText(/Retirar efectivo/), { target: { value: '40' } })
    fireEvent.click(screen.getByRole('button', { name: /Cerrar caja/ }))

    await waitFor(() => expect(closeRegister).toHaveBeenCalledWith(105, 40))
    expect(createCashMovement).toHaveBeenCalledWith({
      movementType: 'withdrawal', amount: 40, description: 'Retiro en corte de caja',
    })
    expect(createCashMovement.mock.invocationCallOrder[0]).toBeLessThan(closeRegister.mock.invocationCallOrder[0])
  })
})
