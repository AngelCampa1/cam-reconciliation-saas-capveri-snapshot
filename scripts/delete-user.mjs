// Delete test user using admin API
const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

// First, try to login as the user to get their ID
console.log('Attempting to get user ID by trying all possible scenarios...')

// Try signup (will fail if user exists but return the error)
const signupResponse = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
  method: 'POST',
  headers: {
    'apikey': SERVICE_KEY,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'e2e-test@capveri.com',
    password: 'TEMP_PASSWORD_TO_GET_ERROR',
  }),
})

const signupResult = await signupResponse.json()
console.log('Signup attempt result:', signupResult)

// If user exists, try to get all users via admin API
const listResponse = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
  headers: {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
  },
})

const listResult = await listResponse.json()
console.log('Found users:', listResult.users?.length || 0)

// Try to find our test user
const testUser = listResult.users?.find(u => u.email === 'e2e-test@capveri.com')

if (testUser) {
  console.log(`Found test user: ${testUser.id}`)
  console.log('Deleting user...')

  const deleteResponse = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${testUser.id}`, {
    method: 'DELETE',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
  })

  if (deleteResponse.ok) {
    console.log('✅ User deleted successfully!')
  } else {
    const error = await deleteResponse.json()
    console.error('Error deleting user:', error)
  }
} else {
  console.log('❌ Test user not found in user list')
  console.log('This is a known Supabase limitation - user exists but is not returned by listUsers()')
  console.log('We will need to reset the entire database to fix this.')
}
