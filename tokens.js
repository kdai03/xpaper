/* Tokenized-stock universe for xPaper.
   All tokens are xStocks (Backed Finance) on Solana, priced from live
   on-chain DEX markets. Mints verified via DexScreener 2026-09-16. */
const TOKENS = [
  { symbol: "AAPLx", name: "Apple",          mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp" },
  { symbol: "NVDAx", name: "NVIDIA",         mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh" },
  { symbol: "MSFTx", name: "Microsoft",      mint: "XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX" },
  { symbol: "GOOGLx",name: "Alphabet",       mint: "XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN" },
  { symbol: "AMZNx", name: "Amazon",         mint: "Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg" },
  { symbol: "METAx", name: "Meta",           mint: "Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu" },
  { symbol: "TSLAx", name: "Tesla",          mint: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB" },
  { symbol: "NFLXx", name: "Netflix",        mint: "XsEH7wWfJJu2ZT3UCFeVfALnVA6CP5ur7Ee11KmzVpL" },
  { symbol: "AMDx",  name: "AMD",            mint: "XsXcJ6GZ9kVnjqGsjBnktRcuwMBmvKWh8S93RefZ1rF" },
  { symbol: "COINx", name: "Coinbase",       mint: "Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu" },
  { symbol: "MSTRx", name: "Strategy",       mint: "XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ" },
  { symbol: "SPYx",  name: "S&P 500 ETF",    mint: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W" },
  { symbol: "QQQx",  name: "Nasdaq 100 ETF", mint: "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ" },
];
const STARTING_CASH = 100000;
const PRICE_POLL_MS = 30000;
