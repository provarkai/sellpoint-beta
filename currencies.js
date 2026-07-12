// Shared display-currency list, mirrors server/currencies.js. Affects only
// how amounts are formatted (invoices, reports, storefront) - Paystack
// charging currency is unaffected and stays NGN regardless of this setting.
const CURRENCIES = {
  NGN: { name: "Nigerian Naira", symbol: "₦", locale: "en-NG" },
  GHS: { name: "Ghanaian Cedi", symbol: "GH₵", locale: "en-GH" },
  KES: { name: "Kenyan Shilling", symbol: "KSh", locale: "en-KE" },
  ZAR: { name: "South African Rand", symbol: "R", locale: "en-ZA" },
  EGP: { name: "Egyptian Pound", symbol: "E£", locale: "en-EG" },
  XOF: { name: "West African CFA Franc", symbol: "CFA", locale: "fr-SN" },
  UGX: { name: "Ugandan Shilling", symbol: "USh", locale: "en-UG" },
  TZS: { name: "Tanzanian Shilling", symbol: "TSh", locale: "en-TZ" },
  RWF: { name: "Rwandan Franc", symbol: "RF", locale: "en-RW" },
  USD: { name: "US Dollar", symbol: "$", locale: "en-US" },
};
function currencyOptionsHtml(selected) {
  return Object.entries(CURRENCIES).map(([code, c]) => `<option value="${code}" ${code === selected ? "selected" : ""}>${code} - ${c.name} (${c.symbol})</option>`).join("");
}
