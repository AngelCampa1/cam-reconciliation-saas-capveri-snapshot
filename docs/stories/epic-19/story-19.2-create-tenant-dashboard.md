# Story 19.2: Create Tenant Dashboard

## Story Info
- **Epic**: Tenant Portal
- **Estimated Hours**: 4
- **Dependencies**: Story 19.1
- **Status**: `pending`

## User Story
Build read-only dashboard for tenants to view their lease details and reconciliation history.

## Acceptance Criteria
- [ ] Dashboard shows tenant's property/unit at a glance
- [ ] Current lease details (dates, terms summary)
- [ ] List of CAM reconciliation bills with amounts
- [ ] Status badges (paid, pending, disputed)
- [ ] Quick link to download latest statement PDF
- [ ] Notification badge for new statements
- [ ] Mobile-responsive layout
- [ ] No edit capabilities (read-only)

## Technical Specifications

Read-only tenant dashboard with lease details, reconciliation statements, and notification support.

**Reference**: See `docs/architecture/tenant-portal-architecture.md` for full dashboard patterns.

### Dashboard API Endpoint

```python
# backend/app/api/v1/tenant/dashboard.py
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

router = APIRouter(prefix="/tenant", tags=["tenant"])

@router.get("/dashboard")
async def get_tenant_dashboard(
    current_user: User = Depends(get_current_tenant_user),
    db: AsyncSession = Depends(get_db),
) -> TenantDashboardResponse:
    """Get dashboard data for authenticated tenant."""
    # Get tenant's linked leases
    tenant_user = await db.execute(
        select(TenantUser)
        .options(selectinload(TenantUser.lease_links))
        .where(TenantUser.user_id == current_user.id)
    )
    tenant = tenant_user.scalar_one()

    lease_ids = [link.lease_id for link in tenant.lease_links]

    # Get lease details with property info
    leases = await db.execute(
        select(Lease)
        .options(selectinload(Lease.property), selectinload(Lease.unit))
        .where(Lease.id.in_(lease_ids))
    )

    # Get reconciliation statements for these leases
    statements = await db.execute(
        select(ReconciliationSnapshot)
        .where(
            ReconciliationSnapshot.property_id.in_(
                select(Lease.property_id).where(Lease.id.in_(lease_ids))
            ),
            ReconciliationSnapshot.is_finalized == True,
            ReconciliationSnapshot.visible_to_tenants == True,
        )
        .order_by(ReconciliationSnapshot.period_end.desc())
    )

    # Get unread notification count
    unread_count = await db.execute(
        select(func.count(TenantNotification.id))
        .where(
            TenantNotification.tenant_user_id == tenant.id,
            TenantNotification.read_at.is_(None),
        )
    )

    return TenantDashboardResponse(
        leases=[LeaseDetailDTO.from_orm(l) for l in leases.scalars()],
        statements=[StatementSummaryDTO.from_orm(s) for s in statements.scalars()],
        unread_notifications=unread_count.scalar() or 0,
    )
```

### Response DTOs

```python
# backend/app/schemas/tenant.py
from pydantic import BaseModel
from decimal import Decimal
from datetime import date
from uuid import UUID
from enum import Enum

class StatementStatus(str, Enum):
    PENDING = "pending"
    PAID = "paid"
    DISPUTED = "disputed"
    OVERDUE = "overdue"

class PropertySummaryDTO(BaseModel):
    id: UUID
    name: str
    address: str

class UnitSummaryDTO(BaseModel):
    id: UUID
    unit_number: str
    rentable_sqft: Decimal

class LeaseDetailDTO(BaseModel):
    id: UUID
    property: PropertySummaryDTO
    unit: UnitSummaryDTO
    start_date: date
    end_date: date
    pro_rata_share: Decimal
    base_year: int | None

    class Config:
        from_attributes = True

class StatementSummaryDTO(BaseModel):
    id: UUID
    property_name: str
    period_start: date
    period_end: date
    tenant_share: Decimal
    status: StatementStatus
    pdf_url: str | None
    created_at: date

    class Config:
        from_attributes = True

class TenantDashboardResponse(BaseModel):
    leases: list[LeaseDetailDTO]
    statements: list[StatementSummaryDTO]
    unread_notifications: int
```

### Dashboard Component (Frontend)

```typescript
// frontend/src/features/tenant-portal/pages/TenantDashboard.tsx
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download, Bell } from 'lucide-react';

interface TenantDashboardData {
  leases: LeaseDetail[];
  statements: StatementSummary[];
  unread_notifications: number;
}

export function TenantDashboard() {
  const { data, isLoading, error } = useQuery<TenantDashboardData>({
    queryKey: ['tenant-dashboard'],
    queryFn: () => api.get('/api/v1/tenant/dashboard').then(res => res.data),
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error loading dashboard</div>;
  if (!data) return null;

  return (
    <div className="p-6 space-y-6">
      {/* Header with notification badge */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Tenant Dashboard</h1>
        <Button variant="outline" className="relative">
          <Bell className="h-4 w-4" />
          {data.unread_notifications > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
              {data.unread_notifications}
            </span>
          )}
        </Button>
      </div>

      {/* Property/Lease Summary */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Your Leases</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {data.leases.map((lease) => (
            <LeaseCard key={lease.id} lease={lease} />
          ))}
        </div>
      </section>

      {/* Reconciliation Statements */}
      <section>
        <h2 className="text-lg font-semibold mb-4">CAM Reconciliation Statements</h2>
        <div className="space-y-2">
          {data.statements.map((statement) => (
            <StatementRow key={statement.id} statement={statement} />
          ))}
          {data.statements.length === 0 && (
            <p className="text-gray-500">No statements available yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function LeaseCard({ lease }: { lease: LeaseDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{lease.property.name}</CardTitle>
        <p className="text-sm text-gray-500">{lease.property.address}</p>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-gray-500">Unit</dt>
          <dd>{lease.unit.unit_number}</dd>
          <dt className="text-gray-500">Lease Period</dt>
          <dd>{lease.start_date} - {lease.end_date}</dd>
          <dt className="text-gray-500">Pro-Rata Share</dt>
          <dd>{(lease.pro_rata_share * 100).toFixed(2)}%</dd>
          {lease.base_year && (
            <>
              <dt className="text-gray-500">Base Year</dt>
              <dd>{lease.base_year}</dd>
            </>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}

function StatementRow({ statement }: { statement: StatementSummary }) {
  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    paid: 'bg-green-100 text-green-800',
    disputed: 'bg-red-100 text-red-800',
    overdue: 'bg-red-100 text-red-800',
  };

  return (
    <div className="flex items-center justify-between p-4 border rounded-lg">
      <div>
        <p className="font-medium">{statement.property_name}</p>
        <p className="text-sm text-gray-500">
          {statement.period_start} - {statement.period_end}
        </p>
      </div>
      <div className="flex items-center gap-4">
        <span className="font-semibold">
          ${statement.tenant_share.toLocaleString()}
        </span>
        <Badge className={statusColors[statement.status]}>
          {statement.status}
        </Badge>
        {statement.pdf_url && (
          <Button variant="ghost" size="sm" asChild>
            <a href={statement.pdf_url} target="_blank" rel="noopener">
              <Download className="h-4 w-4" />
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
```

### Mobile-Responsive Layout

```typescript
// frontend/src/features/tenant-portal/layouts/TenantLayout.tsx
import { Outlet } from 'react-router-dom';

export function TenantLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile-first navigation */}
      <nav className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex justify-between items-center">
          <span className="font-semibold">Tenant Portal</span>
          <button className="md:hidden">Menu</button>
        </div>
      </nav>

      {/* Main content area */}
      <main className="max-w-4xl mx-auto">
        <Outlet />
      </main>
    </div>
  );
}
```

## Test Cases

Test tenant dashboard functionality including:
- Dashboard loads all linked leases correctly
- Reconciliation statements filtered to tenant's properties only
- Status badges display correct colors
- PDF download links work
- Notification badge shows unread count
- Mobile responsive layout works (test at 375px, 768px, 1024px)
- Empty states display correctly (no statements yet)
- RLS enforces data isolation (tenant cannot see other tenants' data)

## Definition of Done
- [ ] Dashboard renders correctly
- [ ] All lease details display
- [ ] Reconciliation list shows
- [ ] Status badges work
- [ ] Download PDF works
- [ ] Unit tests passing with 95%+ coverage
