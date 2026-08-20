/**
 * E2E Test Setup Script
 *
 * Creates test user and test data before running E2E tests.
 * This script is run automatically by Playwright before tests execute.
 */
import { chromium } from '@playwright/test'
import { createClient, type User } from '@supabase/supabase-js'
import { execSync } from 'child_process'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = join(fileURLToPath(import.meta.url), '..')

// Supabase configuration - must match .env.test
const SUPABASE_URL = 'http://127.0.0.1:54321'
// HS256-signed keys matching the local Supabase instance (from backend/.env)
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

// Service role key for admin operations (HS256-signed, from backend/.env)
const SUPABASE_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

// Test user credentials - must match .env.test
const TEST_USER_EMAIL = 'e2e-test@capveri.com'
const TEST_USER_PASSWORD = 'TestPassword123!'
const TEST_ORG_NAME = 'E2E Test Organization'

/**
 * Setup test environment
 */
async function setup() {
  console.log('🔧 Setting up E2E test environment...')

  // Note: Cache clearing disabled to prevent Vite 504 errors during E2E tests
  // The Playwright webServer config already waits for Vite to be ready
  console.log('✅ Proceeding with test setup (Vite cache preserved)')

  // Create Supabase client (using anon key for regular signup)
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  // Create Supabase admin client to create user records
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  try {
    // Check if user exists using admin client (no session creation)
    console.log(`Checking for existing test user: ${TEST_USER_EMAIL}`)

    let userId: string
    let organizationId: string
    let existingUser: User | null = null

    // Try to find user via admin client (doesn't create session)
    try {
      const { data: allUsers } = await adminClient.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      })

      existingUser = allUsers?.users?.find((u: User) => u.email === TEST_USER_EMAIL) ?? null

      if (existingUser) {
        console.log(`Found existing test user: ${existingUser.id}`)

        // Update password and confirm email to ensure it matches test credentials
        const { error: updateError } = await adminClient.auth.admin.updateUserById(
          existingUser.id,
          {
            password: TEST_USER_PASSWORD,
            email_confirm: true, // Ensure email is confirmed
          }
        )

        if (updateError) {
          console.error('Failed to update password:', updateError)
          throw updateError
        }

        console.log('✅ Test user password updated and email confirmed')
        userId = existingUser.id

        // Get organization from existing user record
        const { data: userRecord } = await adminClient
          .from('users')
          .select('organization_id')
          .eq('id', userId)
          .single()

        if (userRecord) {
          organizationId = userRecord.organization_id
          console.log(`✅ Using existing organization: ${organizationId}`)
        } else {
          // User exists in auth but not in database - create records
          const { data: org } = await adminClient
            .from('organizations')
            .insert({ name: 'Test Organization' })
            .select()
            .single()

          organizationId = org!.id
          console.log(`✅ Test organization created: ${organizationId}`)

          await adminClient.from('users').insert({
            id: userId,
            organization_id: organizationId,
            email: TEST_USER_EMAIL,
            full_name: 'Test User',
            role: 'owner',
          })

          console.log('✅ Test user record created in database')
        }
      }
    } catch (error) {
      console.warn('Could not find/update existing user:', error)
    }

    if (!existingUser) {
      // User doesn't exist - create fresh
      console.log('Test user does not exist - creating fresh')

      // Try to find and update password for any existing user with this email
      try {
        // Try to sign in - if it works, user exists with correct password
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: TEST_USER_EMAIL,
          password: TEST_USER_PASSWORD,
        })

        if (!signInError && signInData.user) {
          console.log(`✅ Test user already exists with correct credentials: ${signInData.user.id}`)
          userId = signInData.user.id

          // Get organization from existing user record (using supabase client with user's session)
          const { data: userRecord } = await supabase
            .from('users')
            .select('organization_id')
            .eq('id', userId)
            .single()

          if (userRecord) {
            organizationId = userRecord.organization_id
            console.log(`✅ Using existing organization: ${organizationId}`)

            console.log('✅ E2E test environment ready')
            console.log('🌱 Seeding test data...')
            const seedTestData = (await import('./seed-test-data')).default
            await seedTestData()

            // Save auth state for test fixtures
            console.log('💾 Saving auth state for test fixtures...')
            const browser = await chromium.launch()
            const ctx = await browser.newContext()
            const authPage = await ctx.newPage()
            const baseUrl = process.env.E2E_BASE_URL || 'http://localhost:5173'
            await authPage.goto(`${baseUrl}/auth/login`)
            await authPage.fill('[name="email"]', TEST_USER_EMAIL)
            await authPage.fill('[name="password"]', TEST_USER_PASSWORD)
            await authPage.click('button[type="submit"]')
            await authPage.waitForURL('**/dashboard', { timeout: 15000 })
            mkdirSync(join(__dirname, '.auth'), { recursive: true })
            await ctx.storageState({ path: join(__dirname, '.auth/user.json') })
            await browser.close()
            console.log('✅ Auth state saved to e2e/.auth/user.json')
            return
          }
        }
      } catch (error) {
        console.log('User does not exist or sign-in failed, will create new user')
      }

      // User not found in list - create using regular signup (triggers handle_new_user_signup)
      console.log(`Creating test user via signup: ${TEST_USER_EMAIL}`)

      const { data, error: createError } = await supabase.auth.signUp({
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD,
        options: {
          emailRedirectTo: 'http://localhost:5173',
          data: {
            organization_name: TEST_ORG_NAME || 'E2E Test Organization'
          }
        }
      })

      if (createError) {
        // user_already_exists: admin listUsers failed but user exists — force-confirm via admin API
        if ((createError as { code?: string }).code === 'user_already_exists') {
          console.log('User exists but admin list failed — forcing email confirm via admin API')
          const { data: adminListData } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
          const foundUser = adminListData?.users?.find((u: User) => u.email === TEST_USER_EMAIL)
          if (foundUser) {
            userId = foundUser.id
            await adminClient.auth.admin.updateUserById(userId, {
              password: TEST_USER_PASSWORD,
              email_confirm: true,
            })
            console.log(`✅ Forced email confirm for existing user: ${userId}`)
          } else {
            const { data: created } = await adminClient.auth.admin.createUser({
              email: TEST_USER_EMAIL,
              password: TEST_USER_PASSWORD,
              email_confirm: true,
            })
            if (created?.user) {
              userId = created.user.id
              console.log(`✅ Created user via admin API: ${userId}`)
            } else {
              throw createError
            }
          }
        } else {
          console.error('Error creating test user:', createError)
          throw createError
        }
      }

      if (data?.user) {
        console.log('✅ Test user created via signup:', data.user.id)
        userId = data.user.id
      } else if (!userId) {
        throw new Error('User signup failed - no user returned')
      }

      // Wait for database trigger to create organization and user records
      // The handle_new_user_signup() trigger should have created these automatically
      console.log('⏳ Waiting for trigger to create organization and user records...')
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // Verify organization and user record were created by trigger
      // Sign in to get access to query the users table
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD,
      })

      if (signInError) {
        console.error('Error signing in after signup:', signInError)
        throw signInError
      }

      const { data: userRecord, error: userError } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', userId)
        .single()

      if (userError) {
        console.error('Error fetching user record (trigger may have failed):', userError)
        throw userError
      }

      organizationId = userRecord.organization_id
      console.log(`✅ Organization created by trigger: ${organizationId}`)
      console.log('✅ Test user record created in database')
    }

    console.log('✅ E2E test environment ready')

    // NOTE: Do NOT sign out here - it invalidates the session globally
    // and can cause auth issues during E2E tests
    // await supabase.auth.signOut()

    // Seed test data for E2E tests
    console.log('🌱 Seeding test data...')
    const seedTestData = (await import('./seed-test-data')).default
    await seedTestData()

    // Save auth state for test fixtures (storageState pattern)
    console.log('💾 Saving auth state for test fixtures...')
    const browser = await chromium.launch()
    const context = await browser.newContext()
    const authPage = await context.newPage()
    const baseUrl = process.env.E2E_BASE_URL || 'http://localhost:5173'
    const loginUrl = `${baseUrl}/auth/login`

    // globalSetup runs concurrently with the frontend Vite webServer's cold
    // start, so the dev server may not be reachable on the first attempt. A
    // single best-effort goto would time out before Vite finishes compiling and
    // abort the entire E2E run (F-130). Poll until the login page renders the
    // email field, retrying navigation up to a generous deadline.
    const readinessDeadlineMs = Date.now() + 150000
    let lastReadinessError: unknown
    for (;;) {
      try {
        await authPage.goto(loginUrl, { waitUntil: 'load', timeout: 20000 })
        await authPage.waitForSelector('[name="email"]', { timeout: 20000 })
        break
      } catch (readinessError) {
        lastReadinessError = readinessError
        if (Date.now() >= readinessDeadlineMs) {
          throw new Error(
            `Frontend dev server at ${loginUrl} did not become ready within 150s: ${String(
              lastReadinessError
            )}`
          )
        }
        await new Promise((resolve) => setTimeout(resolve, 3000))
      }
    }
    await authPage.fill('[name="email"]', TEST_USER_EMAIL)
    await authPage.fill('[name="password"]', TEST_USER_PASSWORD)
    await authPage.click('button[type="submit"]')
    await authPage.waitForURL('**/dashboard', { timeout: 15000 })
    mkdirSync(join(__dirname, '.auth'), { recursive: true })
    await context.storageState({ path: join(__dirname, '.auth/user.json') })
    await browser.close()
    console.log('✅ Auth state saved to e2e/.auth/user.json')
  } catch (error) {
    console.error('❌ Failed to setup E2E test environment:', error)
    throw error
  }
}

// Export setup function for Playwright globalSetup
export default setup
