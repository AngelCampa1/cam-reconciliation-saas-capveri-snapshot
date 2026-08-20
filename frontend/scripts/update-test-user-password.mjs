#!/usr/bin/env node
/**
 * Update test user password in Supabase
 * Uses Admin API to properly hash the password
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SUPABASE_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const TEST_USER_EMAIL = 'e2e-test@capveri.com'
const TEST_USER_PASSWORD = 'TestPassword123!'

async function main() {
  console.log('🔧 Updating test user password...')

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  try {
    // Get the user by email
    const { data: users, error: listError } = await supabase.auth.admin.listUsers()

    if (listError) {
      console.error('❌ Error listing users:', listError)
      process.exit(1)
    }

    const testUser = users.users.find((u) => u.email === TEST_USER_EMAIL)

    if (!testUser) {
      console.log('⚠️  Test user not found. Creating new user...')

      // Create user with admin API
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD,
        email_confirm: true,
        user_metadata: {
          organization_name: 'E2E Test Organization',
        },
      })

      if (createError) {
        console.error('❌ Error creating user:', createError)
        process.exit(1)
      }

      console.log('✅ Test user created:', newUser.user.id)
    } else {
      console.log('📝 Test user found:', testUser.id)
      console.log('   Updating password...')

      // Update user password
      const { data: updatedUser, error: updateError } = await supabase.auth.admin.updateUserById(
        testUser.id,
        {
          password: TEST_USER_PASSWORD,
        }
      )

      if (updateError) {
        console.error('❌ Error updating password:', updateError)
        process.exit(1)
      }

      console.log('✅ Password updated successfully')
    }

    // Verify login works
    console.log('🔍 Verifying credentials...')

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    })

    if (signInError) {
      console.error('❌ Login verification failed:', signInError)
      process.exit(1)
    }

    console.log('✅ Login verification successful!')
    console.log('✅ Test user is ready for E2E tests')
  } catch (error) {
    console.error('❌ Unexpected error:', error)
    process.exit(1)
  }
}

main()
