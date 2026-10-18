// vitest.setup.js
// Corre antes de cada archivo de tests (ver test.setupFiles en vite.config.js).
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Sin globals de Vitest, Testing Library no desmonta solo entre tests.
afterEach(() => {
  cleanup()
})
