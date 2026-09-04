import axios from 'axios'

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
  // The API origin (http://localhost:8080) differs from the SPA origin
  // (http://localhost:5173), so this is a cross-origin request. Axios only
  // reads the XSRF-TOKEN cookie into the X-XSRF-TOKEN header automatically
  // for same-origin requests unless this is set explicitly — required for
  // Sanctum's CSRF check on POST /api/v1/auth/login and /logout.
  withXSRFToken: true,
  headers: {
    Accept: 'application/json',
  },
})
