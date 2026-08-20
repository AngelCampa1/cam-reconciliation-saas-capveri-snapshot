-- Add platform admin flag to users table
-- Platform admins can access all organizations' data (bounty dashboard, audit requests)
-- This is separate from organization-level admin roles (owner/admin)

-- Add the is_platform_admin column with default FALSE
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- Set platform admin for specific user(s)
-- This grants the platform admin account platform admin privileges
UPDATE public.users
SET is_platform_admin = TRUE
WHERE email = 'platform-admin@example.com';

-- Create partial index for efficient lookups (only indexes TRUE values)
CREATE INDEX IF NOT EXISTS idx_users_platform_admin
ON public.users(is_platform_admin)
WHERE is_platform_admin = TRUE;

-- Add comment for documentation
COMMENT ON COLUMN public.users.is_platform_admin IS
'Platform-level admin flag. Users with this flag can access all organizations data including bounty dashboard and audit requests.';
