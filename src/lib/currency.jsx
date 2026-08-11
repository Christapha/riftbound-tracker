import { createContext, useContext, useMemo, useState } from 'react'

const CurrencyContext = createContext(null)

const USD = (n) =>
  n == null ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Yen has no minor unit in practice, so decimals here would be noise, not precision.
const JPY = (n, rate) =>
  n == null || !rate ? '—' : `¥${Math.round(n * rate).toLocaleString('en-US')}`

export const CURRENCIES = [
  { id: 'USD', label: '$' },
  { id: 'JPY', label: '¥' },
]

/**
 * Prices are sourced in USD from the TCGplayer feed. Yen is a conversion of that number,
 * not a Japanese-market price — the two genuinely differ for this game — so anywhere yen
 * is shown, the rate it was converted at is shown with it.
 */
export function CurrencyProvider({ fx, initial = 'USD', children }) {
  const [currency, setCurrency] = useState(initial)
  const rate = fx?.JPY || null
  const available = Boolean(rate)
  const active = available ? currency : 'USD'

  const value = useMemo(
    () => ({
      currency: active,
      setCurrency,
      available,
      rate,
      rateDate: fx?.rateDate || null,
      rateSource: fx?.source || null,
      money: (n) => (active === 'JPY' ? JPY(n, rate) : USD(n)),
    }),
    [active, available, rate, fx?.rateDate, fx?.source],
  )

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext)
  // Falling back to plain USD keeps a component usable outside the provider (and in tests)
  // rather than throwing.
  return ctx || { currency: 'USD', setCurrency: () => {}, available: false, rate: null,
                  rateDate: null, rateSource: null, money: USD }
}

export function useMoney() {
  return useCurrency().money
}
