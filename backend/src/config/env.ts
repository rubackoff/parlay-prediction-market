export const env = {
  port: Number(process.env.PORT || 3001),
  rpcUrl: process.env.RPC_URL || 'https://sepolia.base.org',
  polymarketApi: process.env.POLYMARKET_API || 'https://clob.polymarket.com',
  polyrouterBase: process.env.POLYROUTER_BASE || 'https://api.polyrouter.io/functions/v1',
  polyrouterKey: process.env.POLYROUTER_API_KEY || '',
};
