// Display-only currency list: affects how amounts are formatted throughout
// the app, not what currency Paystack actually charges in (that stays NGN
// for every business regardless of this setting, since Paystack only
// charges in currencies a merchant account is specifically enabled for).
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

function isValidCurrency(code) {
  return Object.prototype.hasOwnProperty.call(CURRENCIES, code);
}

module.exports = { CURRENCIES, isValidCurrency };
