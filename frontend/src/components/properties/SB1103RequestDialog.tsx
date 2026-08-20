/**
 * SB1103RequestDialog
 *
 * Dialog for logging a new California SB 1103 compliance request.
 * Fields: lease_id (combobox), requested_by_name, requested_by_email,
 *         request_date, notes (optional).
 */
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { useCreateSB1103Request, useLeases } from '@/api/hooks'
import { getErrorMessage } from '@/api/errors'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const formSchema = z.object({
  lease_id: z.string().min(1, 'Lease is required'),
  requested_by_name: z.string().min(1, 'Name is required').max(255),
  requested_by_email: z
    .string()
    .min(1, 'Email is required')
    .email('Must be a valid email address'),
  request_date: z.string().min(1, 'Request date is required'),
  notes: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

interface SB1103RequestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  propertyId: string
}

export function SB1103RequestDialog({
  open,
  onOpenChange,
  propertyId,
}: SB1103RequestDialogProps) {
  const {
    data: leasesData,
    isLoading: isLoadingLeases,
    isError: leasesError,
    refetch: refetchLeases,
  } = useLeases(
    { property_id: propertyId, limit: 100 },
    { enabled: open && !!propertyId }
  )
  const leases = leasesData?.data ?? []

  const form = useForm<FormValues, unknown, FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      lease_id: '',
      requested_by_name: '',
      requested_by_email: '',
      request_date: new Date().toISOString().split('T')[0] ?? '',
      notes: '',
    },
  })

  const createMutation = useCreateSB1103Request({
    onSuccess: () => {
      toast.success('SB 1103 request logged successfully')
      form.reset()
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error('Failed to log request', {
        description: getErrorMessage(error),
      })
    },
  })

  const onSubmit = (values: FormValues) => {
    // Guard against a double-submit when Enter is pressed while a save is already
    // in flight. The disabled button blocks clicks, but not a keyboard submit that
    // fires before the disabled state has propagated.
    if (createMutation.isPending) {
      return
    }

    createMutation.mutate({
      property_id: propertyId,
      lease_id: values.lease_id,
      requested_by_name: values.requested_by_name,
      requested_by_email: values.requested_by_email,
      request_date: values.request_date,
      ...(values.notes ? { notes: values.notes } : {}),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Log SB 1103 Compliance Request</DialogTitle>
          <DialogDescription>
            Record a written CAM expense disclosure request from a Qualified
            Commercial Tenant (QCT) under California Civil Code § 1938.1.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            <FormField
              control={form.control}
              name="lease_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Tenant Lease</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            isLoadingLeases
                              ? 'Loading leases…'
                              : 'Select a lease…'
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {leases.map((lease) => (
                        <SelectItem key={lease.id} value={String(lease.id)}>
                          {lease.tenant_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {leasesError && (
                    <div
                      data-testid="sb1103-leases-error"
                      role="alert"
                      className="flex items-center gap-2 text-sm text-destructive-strong"
                    >
                      <span>
                        We couldn&apos;t load this property&apos;s leases.
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void refetchLeases()}
                      >
                        Try again
                      </Button>
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="requested_by_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Requestor Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Jane Smith" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="requested_by_email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Requestor Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="email"
                        placeholder="jane@company.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="request_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Date Request Received</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="e.g. Delivered via certified mail on…"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Logging…
                  </>
                ) : (
                  'Log Request'
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
