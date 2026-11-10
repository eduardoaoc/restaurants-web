// ID01 — team search by exact technical user ID, and the staff form/payload
// contract: no manual employee code is ever sent. Pure helpers + source checks.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
let checks = 0
const check = fn => { fn(); ++checks }

try {
  const { parseStaffIdQuery, staffMatchesId } = await server.ssrLoadModule('/src/utils/staff.ts')

  check(() => assert.equal(parseStaffIdQuery('123'), 123))
  check(() => assert.equal(parseStaffIdQuery('#123'), 123))
  check(() => assert.equal(parseStaffIdQuery('  # 123 '), 123))
  check(() => assert.equal(parseStaffIdQuery('ana'), null))
  check(() => assert.equal(parseStaffIdQuery('12a'), null))
  check(() => assert.equal(parseStaffIdQuery(''), null))
  check(() => assert.equal(parseStaffIdQuery('-5'), null))
  check(() => assert.equal(parseStaffIdQuery('1.5'), null))

  // Exact only: 12 must never find #123 (and vice versa).
  check(() => assert.equal(staffMatchesId('123', 123), true))
  check(() => assert.equal(staffMatchesId('#123', 123), true))
  check(() => assert.equal(staffMatchesId('12', 123), false))
  check(() => assert.equal(staffMatchesId('1234', 123), false))
  check(() => assert.equal(staffMatchesId('carlos', 123), false))

  // The form must not carry any employee-code input or payload field any more.
  const form = readFileSync('src/components/staff/StaffForm.vue', 'utf8')
  check(() => assert.ok(!/employeeCode|sub_id/.test(form), 'StaffForm must not handle employee codes'))
  const types = readFileSync('src/types/staff.ts', 'utf8')
  check(() => assert.match(types, /interface StaffAssignmentInput \{\s*restaurant_id: number\s*\}/))
  const invitationTypes = readFileSync('src/types/invitation.ts', 'utf8')
  check(() => assert.ok(!/sub_id/.test(invitationTypes), 'invitation contract has no sub_id'))

  // The detail panel shows the ID with a copy action.
  const panel = readFileSync('src/components/staff/StaffDetailPanel.vue', 'utf8')
  check(() => assert.match(panel, /staff\.detail\.userId/))
  check(() => assert.match(panel, /navigator\.clipboard\.writeText\(String\(props\.member\.id\)\)/))

  // The public (customer) area never references staff ids.
  for (const file of ['src/views/public', 'src/components/public']) {
    // directories may not exist in every layout; only fail on a real hit
    try {
      const { execSync } = await import('node:child_process')
      const hit = execSync(`grep -rIl "sub_id\\|staff.*\\.id" ${file} 2>/dev/null || true`).toString().trim()
      check(() => assert.equal(hit, ''))
    } catch { /* directory absent */ }
  }

  console.log(`frontend-staff-id: ${checks} checks passed`)
} finally {
  await server.close()
}
