function required(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing required env var: ${key}`)
  return val
}

export const env = {
  PORT: parseInt(process.env['PORT'] ?? '3001', 10),
  DATABASE_URL: required('DATABASE_URL'),
  JWT_SECRET: required('JWT_SECRET'),
  JWT_REFRESH_SECRET: required('JWT_REFRESH_SECRET'),
  NODE_ENV: process.env['NODE_ENV'] ?? 'development',
  DEEPL_API_KEY: process.env['DEEPL_API_KEY'],
  GOOGLE_TRANSLATE_API_KEY: process.env['GOOGLE_TRANSLATE_API_KEY'],
  CORS_ORIGIN: process.env['CORS_ORIGIN'] ?? 'http://localhost:5173',
}
