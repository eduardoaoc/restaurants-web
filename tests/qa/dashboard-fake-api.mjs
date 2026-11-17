// Local QA stand-in for restaurants-api (:8080) and Reverb (:8081, Pusher protocol). Fixture data only, nothing real.
// Run: node tests/qa/dashboard-fake-api.mjs   (QA controls under /__qa/*: state, emit, control, log, reset, sockets)
// Used for the Dashboard 3D validation in docs/3d/DASHBOARD_3D_FIRST_DELIVERY_PLAN.md; never used by the build or the app.
import http from 'node:http'
import crypto from 'node:crypto'

const NOW = () => new Date().toISOString()
const iso = (minutesAgo) => new Date(Date.now() - minutesAgo * 60000).toISOString()

// ---- data ------------------------------------------------------------------------------------------------------------
const restaurants = [
  { id: 1, organization_id: 1, name: 'Bistró de Prueba', slug: 'bistro-prueba', status: 'active', created_at: iso(9999), updated_at: iso(9999) },
  { id: 2, organization_id: 1, name: 'Sin Salón 3D', slug: 'sin-salon', status: 'active', created_at: iso(9999), updated_at: iso(9999) },
  { id: 3, organization_id: 1, name: 'Terraza Prueba', slug: 'terraza', status: 'active', created_at: iso(9999), updated_at: iso(9999) },
]
const PERMS = ['view_operations', 'manage_floor_plan', 'view_activity', 'view_reports', 'assign_waiters', 'handle_table_requests', 'record_payments', 'close_bill', 'transfer_tables', 'create_orders']
const authContext = {
  user: { id: 7, name: 'QA Local', email: 'qa@example.invalid', status: 'active' },
  platform: { is_platform_admin: false, roles: [], permissions: [] },
  organizations: [{ id: 1, name: 'Org QA', slug: 'org-qa', status: 'active', roles: ['owner'], permissions: PERMS,
    restaurants: restaurants.map(r => ({ id: r.id, name: r.name, slug: r.slug, status: 'active', roles: ['owner'], permissions: PERMS, can_manage_table_structure: true })) }],
  active_organization_id: 1,
}
const FLOOR = { width: 20, depth: 16, gridStep: 0.25 }
// restaurant 1: five layout tables linked to 101..105, one layout table WITHOUT backend id; operational table 106 is not placed.
// ids and positions follow the Ultimate demo room.
const layouts = {
  1: { revision: 4, tables: [
    { id: 'table-1', number: 1, shape: 'square', seats: 2, position: { x: 0, z: 0 }, rotation: 0, backendTableId: 101 },
    { id: 'table-2', number: 2, shape: 'square', seats: 2, position: { x: 4, z: 0 }, rotation: 0, backendTableId: 102 },
    { id: 'table-3', number: 3, shape: 'square', seats: 2, position: { x: -2, z: 4 }, rotation: 0, backendTableId: 103 },
    { id: 'table-4', number: 4, shape: 'square', seats: 2, position: { x: 2, z: 4 }, rotation: 0, backendTableId: 104 },
    { id: 'table-5', number: 5, shape: 'square', seats: 2, position: { x: 6, z: 4 }, rotation: 0, backendTableId: 105 },
    { id: 'table-9', number: 9, shape: 'square', seats: 2, position: { x: 8, z: 0 }, rotation: 0 },
  ] },
  2: null,
  3: { revision: 1, tables: [
    { id: 'terrace-1', number: 1, shape: 'square', seats: 2, position: { x: 0, z: 0 }, rotation: 0, backendTableId: 301 },
    { id: 'terrace-2', number: 2, shape: 'square', seats: 2, position: { x: 4, z: 2 }, rotation: 0, backendTableId: 302 },
  ] },
}
const tables = {
  1: [101, 102, 103, 104, 105, 106].map(id => ({ id, name: id === 106 ? 'Barra 6' : `Mesa ${id - 100}`, number: id - 100, capacity: 2 })),
  2: [201, 202].map(id => ({ id, name: `Mesa ${id - 200}`, number: id - 200, capacity: 4 })),
  3: [301, 302].map(id => ({ id, name: `Terraza ${id - 300}`, number: id - 300, capacity: 2 })),
}
const tableState = {}   // `${restaurant}:${tableId}` → { status, flags, guests, openedMinutesAgo }
const seed = (r, id, status = 'free', flags = [], guests = 0, openedMinutesAgo = 20) => { tableState[`${r}:${id}`] = { status, flags, guests, openedMinutesAgo } }
const resetState = () => {
  for (const k of Object.keys(tableState)) delete tableState[k]
  seed(1, 101, 'occupied', [], 2, 35); seed(1, 102); seed(1, 103, 'preparing', ['preparing_order'], 2, 8)
  seed(1, 104, 'bill_requested', ['bill_requested'], 1, 50); seed(1, 105); seed(1, 106, 'occupied', [], 1, 12)
  seed(2, 201); seed(2, 202, 'occupied', [], 2, 10); seed(3, 301, 'occupied', [], 2, 15); seed(3, 302)
}
resetState()
const alertsFor = (r) => tables[r].filter(t => tableState[`${r}:${t.id}`].flags.length).map(t => ({
  id: `alert-${r}-${t.id}`, type: tableState[`${r}:${t.id}`].flags[0], severity: 'warning', table_id: t.id, table_session_id: t.id * 10, user_id: null, age_seconds: 120 }))
const control = { floorLayout: {}, floorDelay: 0, opsDelay: 0, opsFail: false }

function snapshot(r) {
  const rows = tables[r].map(t => {
    const s = tableState[`${r}:${t.id}`]
    return { id: t.id, name: t.name, number: t.number, capacity: t.capacity, zone_id: null, layout: {}, primary_status: s.status, flags: s.flags,
      session: s.status === 'free' ? null : { id: t.id * 10, status: 'occupied', opened_at: iso(s.openedMinutesAgo), started_at: iso(s.openedMinutesAgo), elapsed_seconds: s.openedMinutesAgo * 60,
        guest_count: s.guests, guest_count_version: 1, assigned_waiter: null },
      orders: { open_count: 0, waiting_approval: 0, preparing: 0, ready: 0 }, billing: null }
  })
  const occupied = rows.filter(t => t.primary_status !== 'free').length
  return {
    restaurant: { id: r, name: restaurants.find(x => x.id === r).name, timezone: 'Europe/Madrid', currency: 'EUR' },
    generated_at: NOW(),
    summary: { tables: { total: rows.length, free: rows.length - occupied, occupied, occupancy_rate: occupied / rows.length }, active_sessions: occupied,
      active_guests: rows.reduce((n, t) => n + (t.session?.guest_count ?? 0), 0), orders: { active: 0, waiting_approval: 0, preparing: 0, ready: 0 }, staff: { active: 1 },
      requests: { pending: alertsFor(r).length }, sales: { received_today: '0.00', operation: { state: 'none' } } },
    daily_operation: { id: 'op-1', status: 'open', business_date: new Date().toISOString().slice(0, 10), timezone: 'Europe/Madrid', opened_at: iso(300), opened_by: { name: 'QA' }, closed_at: null, closed_by: null },
    operation: { health_score: 90, health_level: 'healthy', bottleneck: null },
    floors: [{ id: 1, name: 'Sala', sort_order: 1, is_active: true, zones: [{ id: 1, name: 'Principal', sort_order: 1, is_active: true, tables: rows }] }],
    unassigned_tables: [],
    kitchen: { counts_by_status: { waiting_approval: 0, confirmed: 0, accepted: 0, preparing: 0, ready: 0 }, active_orders: 0, oldest_active_order_age_seconds: null },
    staff: [],
    alerts: alertsFor(r),
  }
}

// ---- http ------------------------------------------------------------------------------------------------------------
const log = []
const json = (res, status, body, extra = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', ...extra }); res.end(JSON.stringify(body)) }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin ?? '*'
  const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'content-type,x-xsrf-token,x-requested-with,accept', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', Vary: 'Origin' }
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end() }
  const url = new URL(req.url, 'http://x')
  const path = url.pathname
  let body = ''
  for await (const chunk of req) body += chunk
  let m
  const reply = (status, data) => json(res, status, data, cors)
  if (!path.startsWith('/__qa')) log.push({ t: Date.now(), method: req.method, path })

  // QA controls
  if (path === '/__qa/log') return reply(200, log)
  if (path === '/__qa/clear-log') { log.length = 0; return reply(200, {}) }
  if (path === '/__qa/reset') { resetState(); Object.assign(control, { floorLayout: {}, floorDelay: 0, opsDelay: 0, opsFail: false }); log.length = 0; return reply(200, {}) }
  if (path === '/__qa/state') { const b = JSON.parse(body); const k = `${b.restaurant}:${b.table}`; Object.assign(tableState[k], b.patch); return reply(200, tableState[k]) }
  if (path === '/__qa/control') { Object.assign(control, JSON.parse(body)); return reply(200, control) }
  if (path === '/__qa/emit') { const b = JSON.parse(body); emit(b.restaurant_id, b.name, b.payload ?? {}); return reply(200, { sockets: sockets.size }) }
  if (path === '/__qa/sockets') return reply(200, { sockets: sockets.size, channels: [...channelsSeen] })

  if (path === '/sanctum/csrf-cookie') { res.writeHead(204, { ...cors, 'Set-Cookie': 'XSRF-TOKEN=qa; Path=/' }); return res.end() }
  if (path === '/api/v1/auth/me') return reply(200, { data: { user: { id: 7, name: 'QA Local', email: 'qa@example.invalid', email_verified_at: iso(9999), created_at: iso(9999), updated_at: iso(9999) } } })
  if (path === '/api/v1/auth/context') return reply(200, { data: authContext })
  if (path === '/api/v1/restaurants' && req.method === 'GET') return reply(200, { data: { restaurants } })
  if ((m = path.match(/^\/api\/v1\/restaurants\/(\d+)\/settings$/))) return reply(200, { data: { settings: { default_locale: 'es-ES', enabled_locales: ['es-ES'], currency: 'EUR', timezone: 'Europe/Madrid', customer_ordering_enabled: true, customer_order_requires_approval: false, waiter_call_enabled: true } } })
  if ((m = path.match(/^\/api\/v1\/restaurants\/(\d+)\/operations\/live$/))) {
    if (control.opsDelay) await sleep(control.opsDelay)
    if (control.opsFail) return reply(500, { message: 'boom' })
    return reply(200, { data: snapshot(Number(m[1])) })
  }
  if ((m = path.match(/^\/api\/v1\/restaurants\/(\d+)\/floor-layout$/)) && req.method === 'GET') {
    const r = Number(m[1])
    if (control.floorDelay) await sleep(control.floorDelay)
    const forced = control.floorLayout[r]
    if (forced) return reply(forced, { message: 'forced failure' })
    const doc = layouts[r]
    return reply(200, { data: { floor_layout: doc ? { version: 1, revision: doc.revision, floor: FLOOR, tables: doc.tables, updated_at: iso(60), entrance: { x: -5.5, z: 7.6 } } : null } })
  }
  if (path === '/broadcasting/auth') return reply(200, { auth: 'qa:qa' })
  if (path.endsWith('/activity/unread-count')) return reply(200, { data: { last_read_event_id: 0, unread_count: 0 } })
  if (path.endsWith('/activity')) return reply(200, { data: { activity: [] }, meta: { per_page: 30, next_cursor: null, prev_cursor: null, last_read_event_id: 0, unread_count: 0 } })
  if (path === '/api/v1/analytics' || path.includes('/analytics')) return reply(403, { message: 'Forbidden' })
  reply(404, { message: `fake api: ${req.method} ${path} not implemented` })
})

// ---- minimal RFC6455 + Pusher protocol -------------------------------------------------------------------------------
const sockets = new Set()
const channelsSeen = new Set()
function frame(text) {
  const payload = Buffer.from(text)
  const header = payload.length < 126 ? Buffer.from([0x81, payload.length]) : Buffer.from([0x81, 126, payload.length >> 8, payload.length & 255])
  return Buffer.concat([header, payload])
}
function emit(restaurantId, name, payload) {
  const message = JSON.stringify({ event: name, channel: `private-restaurant.${restaurantId}`, data: JSON.stringify({ event_id: crypto.randomUUID(), schema_version: 1, occurred_at: NOW(), restaurant_id: restaurantId, ...payload }) })
  for (const s of sockets) if (s.subscribed.has(`private-restaurant.${restaurantId}`)) s.write(frame(message))
}
server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key']
  const accept = crypto.createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64')
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)
  socket.subscribed = new Set()
  sockets.add(socket)
  socket.write(frame(JSON.stringify({ event: 'pusher:connection_established', data: JSON.stringify({ socket_id: `${Math.floor(Math.random() * 1e6)}.${Math.floor(Math.random() * 1e6)}`, activity_timeout: 120 }) })))
  let buffer = Buffer.alloc(0)
  socket.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk])
    while (buffer.length >= 2) {
      const opcode = buffer[0] & 15
      let length = buffer[1] & 127, offset = 2
      if (length === 126) { if (buffer.length < 4) return; length = buffer.readUInt16BE(2); offset = 4 }
      const masked = (buffer[1] & 128) !== 0
      if (buffer.length < offset + (masked ? 4 : 0) + length) return
      const mask = masked ? buffer.subarray(offset, offset + 4) : null
      if (masked) offset += 4
      const data = Buffer.from(buffer.subarray(offset, offset + length))
      if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4]
      buffer = buffer.subarray(offset + length)
      if (opcode === 8) { socket.end(); return }
      if (opcode !== 1) continue
      try {
        const message = JSON.parse(data.toString())
        if (message.event === 'pusher:subscribe') {
          const channel = message.data.channel
          socket.subscribed.add(channel); channelsSeen.add(channel)
          socket.write(frame(JSON.stringify({ event: 'pusher_internal:subscription_succeeded', channel, data: '{}' })))
        } else if (message.event === 'pusher:unsubscribe') socket.subscribed.delete(message.data.channel)
        else if (message.event === 'pusher:ping') socket.write(frame(JSON.stringify({ event: 'pusher:pong', data: '{}' })))
      } catch { /* ignore */ }
    }
  })
  socket.on('close', () => sockets.delete(socket))
  socket.on('error', () => sockets.delete(socket))
})
server.listen(8080, '127.0.0.1', () => console.log('fake api :8080 (+ ws upgrade on the same port)'))
// Reverb is configured on :8081 in .env.local: answer there as well.
const ws = http.createServer((req, res) => { res.writeHead(404); res.end() })
ws.on('upgrade', (req, socket) => server.emit('upgrade', req, socket))
ws.listen(8081, '127.0.0.1', () => console.log('fake reverb :8081'))
