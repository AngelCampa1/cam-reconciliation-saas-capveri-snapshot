import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const TEST_USER_EMAIL = 'e2e-test@capveri.com'
const TEST_USER_PASSWORD = 'TestPassword123!'

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

console.log('Finding test user...')
const { data: allUsers } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
const testUser = allUsers?.users?.find((u) => u.email === TEST_USER_EMAIL)

if (!testUser) {
  console.log('Test user not found!')
  process.exit(1)
}

console.log(`Found user: ${testUser.id}`)
console.log('Updating password...')

const { error } = await adminClient.auth.admin.updateUserById(testUser.id, {
  password: TEST_USER_PASSWORD,
})

if (error) {
  console.error('Error updating password:', error)
  process.exit(1)
}

console.log('✅ Password updated successfully!')
console.log(`Email: ${TEST_USER_EMAIL}`)
console.log(`Password: ${TEST_USER_PASSWORD}`)
