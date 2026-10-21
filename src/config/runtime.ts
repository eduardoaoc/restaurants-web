import { validateEnv } from './env'
export const appConfig = validateEnv(import.meta.env, import.meta.env.MODE)
