import { useState } from 'react'
import { QueryErrorResetBoundary } from '@tanstack/react-query'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  Navigate,
  useNavigate,
  useLocation,
} from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Spinner } from '@/components/ui/spinner'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { useBillingActivation } from '@/hooks/use-billing-activation'
import { usePageTracking } from '@/hooks/usePageTracking'
import { AuthCallback } from '@/pages/auth/AuthCallback'
import {
  LoginPage,
  RegisterPage,
  ForgotPasswordPage,
  ResetPasswordPage,
} from '@/pages/auth'
import { InvoicesPage } from '@/pages/settings/Invoices'
import { BillingPage } from '@/pages/settings/Billing'
import { FeedbackPage } from '@/pages/admin/Feedback'
import { CrmFeedbackWidget } from '@/components/CrmFeedbackWidget'
import { AiCsHelpWidget } from '@/components/AiCsHelpWidget'
import {
  ExtractionsPage,
  VerificationPage,
  IngestionPage,
  RentRollUploadPage,
} from '@/pages'
import {
  TenantDashboard,
  TenantLoginPage,
  TenantSignupPage,
  DisputeDetailPage,
  CreateDisputePage,
  TenantPreferencesPage,
  TenantNotificationsPage,
  TenantDisputesPage,
  TenantHelpPage,
} from '@/features/tenant-portal/pages'
import { TenantLayout } from '@/features/tenant-portal/layouts/TenantLayout'
import {
  DisputesListPage,
  LandlordDisputeDetailPage,
} from '@/features/disputes/pages'
import { Header } from '@/components/layout/Header'
import { BottomNav } from '@/components/layout/BottomNav'
import { Sidebar } from '@/components/layout/Sidebar'
import { HelpDrawer } from '@/features/help/components'
import { OfflineIndicator } from '@/components/pwa'
import { cn } from '@/lib/utils'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { UserRole } from '@/types/enums'
import { ProfilePage } from '@/pages/settings/ProfilePage'
import { OrganizationPage } from '@/pages/settings/OrganizationPage'
import { TeamMembersPage } from '@/pages/settings/TeamMembersPage'
import { TeamSignupPage } from '@/pages/team'
import { ReconciliationPage } from '@/pages/reconciliation/ReconciliationPage'
import { PortfolioPipelinePage } from '@/pages/portfolio/PortfolioPipelinePage'
import { PoolsPage } from '@/pages/pools/PoolsPage'
import { ReconciliationsListPage } from '@/pages/reconciliation/ReconciliationsListPage'
import { YearOverYearPage } from '@/pages/analysis/YearOverYearPage'
import { TrendAnalysisPage } from '@/pages/analysis/TrendAnalysisPage'
import { ComparePage } from '@/pages/comparison/ComparePage'
import { PropertyListPage } from '@/pages/properties/PropertyListPage'
import { PropertyFormPage } from '@/pages/properties/PropertyFormPage'
import { PropertyDetailPage } from '@/pages/properties/PropertyDetailPage'
import { LeaseFormPage, LeaseDetailPage, LeaseUploadPage } from '@/pages/leases'
import { DashboardPage } from '@/pages/DashboardPage'
import { TaxProtestPage } from '@/pages/tax-protest/TaxProtestPage'
import { PortfolioPage } from '@/pages/portfolio/PortfolioPage'
import { OnboardPage } from '@/pages/onboard/OnboardPage'
import { NotFoundPage } from '@/pages/NotFound'
import { PricingPage } from '@/pages/Pricing'
import { CheckoutSuccessPage } from '@/pages/CheckoutSuccess'
import { PermissionDeniedPage } from '@/pages/PermissionDenied'
import { ScrollToTop } from '@/components/layout/ScrollToTop'
import { PrivacyPolicyPage } from '@/pages/legal/PrivacyPolicy'
import { TermsOfServicePage } from '@/pages/legal/TermsOfService'
import { CookiePolicyPage } from '@/pages/legal/CookiePolicy'
import { AiTransparencyPage } from '@/pages/legal/AiTransparency'
import { ContactPage } from '@/pages/company/Contact'
import { AboutPage } from '@/pages/company/About'
import { LandingPage } from '@/pages/LandingPage'
import { SampleReportPage } from '@/pages/SampleReport'
import { YardiComparisonPage } from '@/pages/vs/YardiComparison'
import { MriComparisonPage } from '@/pages/vs/MriComparison'
import { AppFolioComparisonPage } from '@/pages/vs/AppFolioComparison'
import { ResourcesHub } from '@/pages/resources/ResourcesHub'
import { WhatIsCamReconciliationPage } from '@/pages/resources/WhatIsCamReconciliation'
import { Boma2024ChangesPage } from '@/pages/resources/Boma2024Changes'
import { CamPresendChecklistPage } from '@/pages/resources/CamPresendChecklist'
import { CamReconciliationErrorsPage } from '@/pages/resources/CamReconciliationErrors'
import { DeterministicVsAiCamPage } from '@/pages/resources/DeterministicVsAiCam'
import { DocumentationPage } from '@/pages/resources/Documentation'
import { ExportGuidePage } from '@/pages/resources/ExportGuide'
import { GlCodingGuidePage } from '@/pages/resources/GlCodingGuide'
import { HarrisCountyGrossUpPage } from '@/pages/resources/HarrisCountyGrossUp'
import { HelpCenterPage } from '@/pages/resources/HelpCenter'
import { Sb1103CompliancePage } from '@/pages/resources/Sb1103Compliance'
import { TenantAuditorGuidePage } from '@/pages/resources/TenantAuditorGuide'
import { ToolsHub } from '@/pages/tools/ToolsHub'
import { AuditRiskQuizPage } from '@/pages/tools/AuditRiskQuiz'
import { Boma2024CalculatorPage } from '@/pages/tools/Boma2024Calculator'
import { CamGrossUpCalculator } from '@/pages/tools/CamGrossUpCalculator'
import { CamLeakageEstimatorPage } from '@/pages/tools/CamLeakageEstimator'
import { DownloadThankYou } from '@/pages/tools/DownloadThankYou'
import { HcadTaxNormalizerPage } from '@/pages/tools/HcadTaxNormalizer'
import { LeaseAbstractMatrix } from '@/pages/tools/LeaseAbstractMatrix'
import { PaywallStep } from '@/features/plg/steps/PaywallStep'
import { HelpPage } from '@/pages/help'
import { getTrialBannerVariant } from '@/lib/trial-banner'

function AppContent() {
  const { user, userRole, isLoading, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const isTenantUser = userRole === UserRole.TENANT

  // Track page views for analytics
  usePageTracking()

  // '/tenant' covers the whole tenant portal, which renders its own layout.
  // Path-based (not role-based) so the landlord shell never flashes — and its
  // billing call never fires a 403 — during the brief window after a tenant
  // reload before userRole resolves.
  const shelllessPrefixes = ['/resources', '/tools', '/vs/', '/tenant']
  const shelllessRoutes = new Set([
    '/onboarding',
    '/onboard',
    '/onboard/unlock',
    '/pricing',
    '/privacy',
    '/terms',
    '/cookies',
    '/contact',
    '/compliance/ai-transparency',
    '/sample-report',
    '/tenant/login',
    '/tenant/signup',
    '/tenant/forgot-password',
  ])
  const isShelllessRoute =
    shelllessRoutes.has(location.pathname) ||
    shelllessPrefixes.some((prefix) => location.pathname.startsWith(prefix))

  // Only show app shell for authenticated landlord users
  const showAppShell = user && !isTenantUser && !isShelllessRoute

  const handleLogout = async () => {
    await logout()
    navigate('/auth/login')
  }

  const handleSettings = () => {
    navigate('/settings/profile')
  }

  const handleLogoClick = () => {
    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Skip navigation link for keyboard/screen reader users */}
      <a
        href="#main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:z-[9999] focus-visible:top-2 focus-visible:left-2 focus-visible:px-4 focus-visible:py-2 focus-visible:rounded-full focus-visible:bg-background focus-visible:text-foreground focus-visible:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        Skip to main content
      </a>
      {/* Scroll to top on route change */}
      <ScrollToTop />

      {/* Sidebar - Desktop persistent, Mobile slide-in drawer (landlord only) */}
      {showAppShell && (
        <Sidebar
          mobileOpen={isMobileNavOpen}
          onMobileClose={() => setIsMobileNavOpen(false)}
        />
      )}

      {/* Content area wrapper - includes header and main content */}
      <div className={cn(showAppShell ? 'md:ml-64' : '')}>
        {/* Header - only show for landlord users on non-public pages */}
        {showAppShell && (
          <Header
            userName={user.email?.split('@')[0] || 'User'}
            userEmail={user.email || ''}
            onLogout={handleLogout}
            onSettings={handleSettings}
            onLogoClick={handleLogoClick}
            onMenuClick={() => setIsMobileNavOpen(true)}
            mobileMenuOpen={isMobileNavOpen}
            onHelp={() => setIsHelpOpen(true)}
          />
        )}

        {showAppShell && <TrialBillingBanner />}

        <div className="sr-only" aria-hidden="true">
          CapVeri
        </div>

        {/* Main content area with bottom nav padding on mobile (landlord only).
            The fixed BottomNav is 56px (h-14) PLUS the device safe-area inset,
            so pad by both to keep the last content row clear of the bar on
            notched devices. Desktop resets to 0 (no bottom nav). */}
        <main
          id="main-content"
          className={cn(
            showAppShell
              ? 'pb-[calc(3.5rem_+_env(safe-area-inset-bottom))] md:pb-0'
              : ''
          )}
        >
          <QueryErrorResetBoundary>
            {({ reset }) => (
              <ErrorBoundary
                onReset={reset}
                context="Routes"
                resetKey={location.pathname}
              >
                <Routes>
                  {/* Root - landing page for unauthenticated users, dashboard for authenticated */}
                  <Route
                    path="/"
                    element={
                      user ? (
                        // Wait for the async role fetch before redirecting.
                        // Redirecting while userRole is still null would send a
                        // tenant to /dashboard (landlord-only) and bounce them
                        // to /403 on a cold page load.
                        isLoading || userRole === null ? (
                          <div className="flex h-screen items-center justify-center">
                            <Spinner size="lg" />
                          </div>
                        ) : (
                          <Navigate
                            to={
                              isTenantUser ? '/tenant/dashboard' : '/dashboard'
                            }
                            replace
                          />
                        )
                      ) : (
                        <LandingPage />
                      )
                    }
                  />

                  {/* Dashboard Route */}
                  <Route
                    path="/dashboard"
                    element={
                      <ProtectedRoute
                        requiredRoles={[
                          UserRole.OWNER,
                          UserRole.ADMIN,
                          UserRole.MEMBER,
                          UserRole.VIEWER,
                        ]}
                      >
                        <DashboardPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Portfolio Summary Route */}
                  <Route
                    path="/portfolio"
                    element={
                      <ProtectedRoute
                        requiredRoles={[
                          UserRole.OWNER,
                          UserRole.ADMIN,
                          UserRole.MEMBER,
                          UserRole.VIEWER,
                        ]}
                      >
                        <PortfolioPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Reconciliations Route */}
                  <Route
                    path="/reconciliations"
                    element={
                      <ProtectedRoute>
                        <ReconciliationsListPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/reconciliation"
                    element={<Navigate to="/reconciliations" replace />}
                  />
                  <Route
                    path="/reconciliation/current"
                    element={<Navigate to="/reconciliations" replace />}
                  />
                  <Route
                    path="/reconciliation/history"
                    element={<Navigate to="/reconciliations" replace />}
                  />

                  {/* Portfolio Pipeline */}
                  <Route
                    path="/portfolio/pipeline"
                    element={
                      <ProtectedRoute>
                        <PortfolioPipelinePage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Auth Pages */}
                  <Route
                    path="/login"
                    element={<Navigate to="/auth/login" replace />}
                  />
                  <Route
                    path="/register"
                    element={<Navigate to="/auth/register" replace />}
                  />
                  <Route
                    path="/forgot-password"
                    element={<Navigate to="/auth/forgot-password" replace />}
                  />
                  <Route path="/auth/login" element={<LoginPage />} />
                  <Route path="/auth/register" element={<RegisterPage />} />
                  <Route
                    path="/auth/forgot-password"
                    element={<ForgotPasswordPage />}
                  />
                  <Route
                    path="/auth/reset-password"
                    element={<ResetPasswordPage />}
                  />
                  <Route path="/auth/callback" element={<AuthCallback />} />
                  {/* Pricing page, public */}
                  <Route path="/pricing" element={<PricingPage />} />
                  <Route
                    path="/checkout"
                    element={
                      <Navigate
                        to="/settings/billing?intent=select-plan"
                        replace
                      />
                    }
                  />
                  <Route
                    path="/checkout/success"
                    element={<CheckoutSuccessPage />}
                  />
                  <Route path="/contact" element={<ContactPage />} />
                  <Route path="/about" element={<AboutPage />} />
                  <Route path="/privacy" element={<PrivacyPolicyPage />} />
                  <Route path="/terms" element={<TermsOfServicePage />} />
                  <Route path="/cookies" element={<CookiePolicyPage />} />
                  <Route
                    path="/compliance/ai-transparency"
                    element={<AiTransparencyPage />}
                  />
                  <Route path="/sample-report" element={<SampleReportPage />} />
                  {/* PLG onboarding, public, no auth required */}
                  <Route path="/onboard" element={<OnboardPage />} />
                  <Route path="/onboard/unlock" element={<PaywallStep />} />
                  {/* Legacy onboarding → PLG flow */}
                  <Route
                    path="/onboarding"
                    element={<Navigate to="/onboard" replace />}
                  />
                  {/* Bare /settings has no index page; send it to the first
                      Settings sub-item instead of rendering a 404. */}
                  <Route
                    path="/settings"
                    element={<Navigate to="/settings/profile" replace />}
                  />
                  {/* Legacy Settings URLs kept as redirects so old links and
                      bookmarks still resolve after canonicalizing the whole
                      Settings group under /settings/* (F-200). */}
                  <Route
                    path="/profile"
                    element={<Navigate to="/settings/profile" replace />}
                  />
                  <Route
                    path="/organization/settings"
                    element={<Navigate to="/settings/organization" replace />}
                  />
                  <Route
                    path="/settings/billing"
                    element={
                      <ProtectedRoute>
                        <BillingPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/settings/billing/invoices"
                    element={
                      <ProtectedRoute>
                        <InvoicesPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin"
                    element={<Navigate to="/admin/feedback" replace />}
                  />
                  {/* Bare nav-group parents have no index page; send them to
                      their first child instead of rendering a 404, matching the
                      /admin and /settings redirects (F-266). */}
                  <Route
                    path="/documents"
                    element={<Navigate to="/ingestion" replace />}
                  />
                  <Route
                    path="/analysis"
                    element={<Navigate to="/analysis/year-over-year" replace />}
                  />
                  <Route
                    path="/admin/feedback"
                    element={
                      <ProtectedRoute
                        requiredRoles={[UserRole.OWNER, UserRole.ADMIN]}
                      >
                        <FeedbackPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/help"
                    element={
                      <ProtectedRoute>
                        <HelpPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/extractions"
                    element={
                      <ProtectedRoute>
                        <ExtractionsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/rent-roll/upload"
                    element={
                      <ProtectedRoute>
                        <RentRollUploadPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/ingestion"
                    element={
                      <ProtectedRoute>
                        <IngestionPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/verify/:documentId"
                    element={
                      <ProtectedRoute>
                        <VerificationPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/settings/profile"
                    element={
                      <ProtectedRoute>
                        <ProfilePage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/settings/organization"
                    element={
                      <ProtectedRoute
                        requiredRoles={[UserRole.OWNER, UserRole.ADMIN]}
                      >
                        <OrganizationPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/settings/team"
                    element={
                      <ProtectedRoute
                        requiredRoles={[UserRole.OWNER, UserRole.ADMIN]}
                      >
                        <TeamMembersPage />
                      </ProtectedRoute>
                    }
                  />
                  {/* Team Signup - Public (invitation only) */}
                  <Route path="/team/signup" element={<TeamSignupPage />} />
                  <Route
                    path="/properties/:propertyId/reconciliations"
                    element={
                      <ProtectedRoute>
                        <ReconciliationPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/pools"
                    element={
                      <ProtectedRoute>
                        <PoolsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/analysis/year-over-year"
                    element={
                      <ProtectedRoute>
                        <YearOverYearPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/compare"
                    element={
                      <ProtectedRoute>
                        <ComparePage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/analysis/trends"
                    element={
                      <ProtectedRoute>
                        <TrendAnalysisPage />
                      </ProtectedRoute>
                    }
                  />
                  {/* Property Management Routes */}
                  <Route
                    path="/properties"
                    element={
                      <ProtectedRoute>
                        <PropertyListPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/properties/new"
                    element={
                      <ProtectedRoute
                        requiredRoles={[
                          UserRole.OWNER,
                          UserRole.ADMIN,
                          UserRole.MEMBER,
                        ]}
                      >
                        <PropertyFormPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/properties/:propertyId/edit"
                    element={
                      <ProtectedRoute
                        requiredRoles={[
                          UserRole.OWNER,
                          UserRole.ADMIN,
                          UserRole.MEMBER,
                        ]}
                      >
                        <PropertyFormPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/properties/:propertyId"
                    element={
                      <ProtectedRoute>
                        <PropertyDetailPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/properties/:propertyId/leases/new"
                    element={
                      <ProtectedRoute>
                        <LeaseFormPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/properties/:propertyId/leases/:leaseId/edit"
                    element={
                      <ProtectedRoute>
                        <LeaseFormPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/properties/:propertyId/leases/:leaseId"
                    element={
                      <ProtectedRoute>
                        <LeaseDetailPage />
                      </ProtectedRoute>
                    }
                  />
                  {/* Lease Upload Route */}
                  <Route
                    path="/leases/upload"
                    element={
                      <ProtectedRoute>
                        <LeaseUploadPage />
                      </ProtectedRoute>
                    }
                  />
                  {/* Tax Protest Route */}
                  <Route
                    path="/tax-protest"
                    element={
                      <ProtectedRoute>
                        <TaxProtestPage />
                      </ProtectedRoute>
                    }
                  />
                  {/* Dispute Management Routes (Landlord) */}
                  <Route
                    path="/disputes"
                    element={
                      <ProtectedRoute>
                        <DisputesListPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/disputes/:disputeId"
                    element={
                      <ProtectedRoute>
                        <LandlordDisputeDetailPage />
                      </ProtectedRoute>
                    }
                  />
                  {/* Tenant Portal Routes - Public (no auth required) */}
                  <Route path="/tenant/login" element={<TenantLoginPage />} />
                  <Route
                    path="/tenant/forgot-password"
                    element={<ForgotPasswordPage loginPath="/tenant/login" />}
                  />
                  <Route path="/tenant/signup" element={<TenantSignupPage />} />

                  {/* Tenant Portal Routes - Protected (with sidebar layout) */}
                  <Route
                    path="/tenant"
                    element={
                      <ProtectedRoute requiredRoles={[UserRole.TENANT]}>
                        <TenantLayout />
                      </ProtectedRoute>
                    }
                  >
                    <Route
                      index
                      element={<Navigate to="/tenant/dashboard" replace />}
                    />
                    <Route path="dashboard" element={<TenantDashboard />} />
                    <Route
                      path="preferences"
                      element={<TenantPreferencesPage />}
                    />
                    <Route
                      path="notifications"
                      element={<TenantNotificationsPage />}
                    />
                    <Route path="help" element={<TenantHelpPage />} />
                    <Route path="disputes" element={<TenantDisputesPage />} />
                    <Route
                      path="disputes/new"
                      element={<CreateDisputePage />}
                    />
                    <Route
                      path="disputes/:disputeId"
                      element={<DisputeDetailPage />}
                    />
                  </Route>

                  {/* Competitor Comparison Pages - Public */}
                  <Route path="/vs/yardi" element={<YardiComparisonPage />} />
                  <Route path="/vs/mri" element={<MriComparisonPage />} />
                  <Route
                    path="/vs/appfolio"
                    element={<AppFolioComparisonPage />}
                  />

                  {/* Resources Pages - Public */}
                  <Route path="/resources" element={<ResourcesHub />} />
                  <Route
                    path="/resources/what-is-cam-reconciliation"
                    element={<WhatIsCamReconciliationPage />}
                  />
                  <Route
                    path="/resources/boma-2024-changes"
                    element={<Boma2024ChangesPage />}
                  />
                  <Route
                    path="/resources/cam-presend-checklist"
                    element={<CamPresendChecklistPage />}
                  />
                  <Route
                    path="/resources/cam-reconciliation-errors"
                    element={<CamReconciliationErrorsPage />}
                  />
                  <Route
                    path="/resources/deterministic-vs-ai-cam"
                    element={<DeterministicVsAiCamPage />}
                  />
                  <Route
                    path="/resources/documentation"
                    element={<DocumentationPage />}
                  />
                  <Route
                    path="/resources/export-guide"
                    element={<ExportGuidePage />}
                  />
                  <Route
                    path="/resources/gl-coding-guide"
                    element={<GlCodingGuidePage />}
                  />
                  <Route
                    path="/resources/harris-county-gross-up"
                    element={<HarrisCountyGrossUpPage />}
                  />
                  <Route
                    path="/resources/help-center"
                    element={<HelpCenterPage />}
                  />
                  <Route
                    path="/resources/sb-1103-compliance"
                    element={<Sb1103CompliancePage />}
                  />
                  <Route
                    path="/resources/tenant-auditor-guide"
                    element={<TenantAuditorGuidePage />}
                  />

                  {/* Tools Pages - Public */}
                  <Route path="/tools" element={<ToolsHub />} />
                  <Route
                    path="/tools/audit-risk-quiz"
                    element={<AuditRiskQuizPage />}
                  />
                  <Route
                    path="/tools/boma-2024-calculator"
                    element={<Boma2024CalculatorPage />}
                  />
                  <Route
                    path="/tools/cam-gross-up-calculator"
                    element={<CamGrossUpCalculator />}
                  />
                  <Route
                    path="/tools/cam-leakage-estimator"
                    element={<CamLeakageEstimatorPage />}
                  />
                  <Route
                    path="/tools/hcad-tax-normalizer"
                    element={<HcadTaxNormalizerPage />}
                  />
                  <Route
                    path="/tools/lease-abstract-matrix"
                    element={<LeaseAbstractMatrix />}
                  />
                  <Route
                    path="/tools/:slug/thank-you"
                    element={<DownloadThankYou />}
                  />

                  {/* 403 Permission Denied */}
                  <Route path="/403" element={<PermissionDeniedPage />} />

                  {/* 404 Catch-all - Must be last route */}
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </ErrorBoundary>
            )}
          </QueryErrorResetBoundary>
        </main>
      </div>

      {/* Bottom Navigation - only show for landlord users on non-public pages */}
      {showAppShell && (
        <BottomNav onMoreClick={() => setIsMobileNavOpen(true)} />
      )}

      {/* PWA Components */}
      <OfflineIndicator />

      {showAppShell && (
        <HelpDrawer open={isHelpOpen} onOpenChange={setIsHelpOpen} />
      )}

      <Toaster />
      {/* CRM feedback widget, authenticated landlord surface only */}
      {showAppShell && <CrmFeedbackWidget />}
      {/* AI-CS product help chat, authenticated landlord surface only */}
      {showAppShell && <AiCsHelpWidget />}
    </div>
  )
}

function TrialBillingBanner() {
  const { data: billing, isLoading } = useBillingActivation()
  const [dismissed, setDismissed] = useState(false)

  if (isLoading || !billing) {
    return null
  }

  const variant = getTrialBannerVariant(
    billing.subscription_status,
    billing.trial_days_remaining,
    billing.has_paused_subscription
  )

  if (variant === null) {
    return null
  }

  // Early trial banner can be dismissed for the session
  if (variant === 'early' && dismissed) {
    return null
  }

  const planSelectionHref = '/settings/billing?intent=select-plan'

  if (variant === 'paused') {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="border-b border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-foreground md:px-6 lg:px-8"
      >
        <div className="mx-auto flex max-w-screen-2xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="font-medium">
            Your trial has ended. Pick a plan to keep going.
          </span>
          <Button
            asChild
            size="sm"
            variant="destructive"
            className="w-fit rounded-full text-xs"
          >
            <Link to={planSelectionHref}>Pick a plan</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (variant === 'urgent') {
    const days = billing.trial_days_remaining ?? 0
    const dayWord = days === 1 ? 'day' : 'days'
    const message =
      days <= 0
        ? 'Your free trial ends today. Add billing to keep going.'
        : `Your free trial ends in ${days} ${dayWord}. Add billing to keep going.`
    return (
      <div
        role="alert"
        aria-live="polite"
        className="border-b border-warning/40 bg-warning/15 px-4 py-3 text-sm text-foreground md:px-6 lg:px-8"
      >
        <div className="mx-auto flex max-w-screen-2xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="font-medium">{message}</span>
          <Button
            asChild
            size="sm"
            variant="default"
            className="w-fit rounded-full text-xs"
          >
            <Link to={planSelectionHref}>Add billing</Link>
          </Button>
        </div>
      </div>
    )
  }

  // variant === 'early'
  const days = billing.trial_days_remaining ?? 0
  const dayWord = days === 1 ? 'day' : 'days'
  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-muted-foreground/15 bg-muted/40 px-4 py-2 text-sm text-muted-foreground md:px-6 lg:px-8"
    >
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span>
          You're on a free trial. {days} {dayWord} left.
        </span>
        <div className="flex items-center gap-2">
          <Button
            asChild
            size="sm"
            variant="outline"
            className="w-fit rounded-full text-xs"
          >
            <Link to={planSelectionHref}>Add billing</Link>
          </Button>
          <button
            type="button"
            aria-label="Dismiss trial notice"
            onClick={() => setDismissed(true)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-surface-hover hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}

function App() {
  return (
    <TooltipProvider>
      <AuthProvider>
        <Router>
          <AppContent />
        </Router>
      </AuthProvider>
    </TooltipProvider>
  )
}

export default App
