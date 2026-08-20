import { useNavigate } from 'react-router-dom'
import { PageContainer, PageHeader } from '@/components/layout'
import { RentRollUpload } from '@/components/rent-roll'

export function RentRollUploadPage() {
  const navigate = useNavigate()

  return (
    <PageContainer>
      <PageHeader
        title="Upload Rent Roll"
        description="Upload a rent roll to create property, units, and leases in one step."
      />

      <div className="max-w-4xl">
        <RentRollUpload
          onSuccess={(propertyId) => navigate(`/properties/${propertyId}`)}
          onCancel={() => navigate(-1)}
        />
      </div>
    </PageContainer>
  )
}
