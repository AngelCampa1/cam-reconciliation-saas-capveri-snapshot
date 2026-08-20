/**
 * Pool Mappings Dialog Component
 *
 * Dialog for viewing and managing GL account mappings for an expense pool.
 * Features:
 * - List of existing mappings with pattern, allocation, and priority
 * - Inline add new mapping form
 * - Edit and delete existing mappings
 * - Pattern validation (digits, *, %, ?, -, .)
 */
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Plus, Pencil, Trash2, X, Check } from 'lucide-react'
import { GlPatternHelp } from '@/components/help/GlPatternHelp'

import {
  usePoolMappings,
  useCreatePoolMapping,
  useUpdatePoolMapping,
  useDeletePoolMapping,
} from '@/api/hooks'
import type {
  PoolMapping,
  ExpensePoolWithChildren,
  ApiError,
} from '@/api/client'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { decimalToPercentString, percentToDecimalString } from '@/lib/percent'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { getErrorMessage } from '@/api/errors'

// GL pattern validation mirrors backend/app/models/pool_mapping.py.
const GL_PATTERN_REGEX = /^[\d*%?\-.]+$/
const isValidGLPattern = (pattern: string) => GL_PATTERN_REGEX.test(pattern)

const mappingFormSchema = z.object({
  gl_account_pattern: z
    .string()
    .min(1, 'Pattern is required')
    .refine(isValidGLPattern, 'Use digits, *, %, ?, -, or . only'),
  allocation_percentage: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val || val === '') return true
        const num = parseFloat(val)
        return !isNaN(num) && num > 0 && num <= 100
      },
      { message: 'Must be 1-100' }
    ),
  priority: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val || val === '') return true
        const num = parseInt(val, 10)
        return !isNaN(num) && num >= 0
      },
      { message: 'Must be 0 or greater' }
    ),
})

type MappingFormData = z.infer<typeof mappingFormSchema>

interface PoolMappingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  propertyId: string
  pool: ExpensePoolWithChildren
}

export function PoolMappingsDialog({
  open,
  onOpenChange,
  propertyId,
  pool,
}: PoolMappingsDialogProps) {
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Fetch mappings for this pool
  const {
    data: mappingsData,
    isLoading,
    isError,
    isPaused,
    refetch,
  } = usePoolMappings(propertyId, { poolId: pool.id }, { enabled: open })
  const mappings = mappingsData?.data || []
  const isOffline = isPaused && !mappingsData

  // Mutations
  const createMutation = useCreatePoolMapping(propertyId, {
    onSuccess: () => {
      toast.success('Mapping created successfully')
      setIsAdding(false)
      addForm.reset()
    },
    onError: (error: ApiError) => {
      toast.error('Failed to create mapping', {
        description: getErrorMessage(error),
      })
    },
  })

  const updateMutation = useUpdatePoolMapping(propertyId, editingId || '', {
    onSuccess: () => {
      toast.success('Mapping updated successfully')
      setEditingId(null)
      editForm.reset()
    },
    onError: (error: ApiError) => {
      toast.error('Failed to update mapping', {
        description: getErrorMessage(error),
      })
    },
  })

  const deleteMutation = useDeletePoolMapping(propertyId, {
    onSuccess: () => {
      toast.success('Mapping deleted successfully')
      setDeleteId(null)
    },
    onError: (error: ApiError) => {
      toast.error('Failed to delete mapping', {
        description: getErrorMessage(error),
      })
    },
  })

  // Forms
  const addForm = useForm<MappingFormData>({
    resolver: zodResolver(mappingFormSchema),
    defaultValues: {
      gl_account_pattern: '',
      allocation_percentage: '100',
      priority: '0',
    },
  })

  const editForm = useForm<MappingFormData>({
    resolver: zodResolver(mappingFormSchema),
    defaultValues: {
      gl_account_pattern: '',
      allocation_percentage: '100',
      priority: '0',
    },
  })

  const handleAdd = (data: MappingFormData) => {
    // Guard against a double-submit when Enter is pressed while a save is already
    // in flight. The disabled button blocks clicks, but not a keyboard submit that
    // fires before the disabled state has propagated.
    if (createMutation.isPending) {
      return
    }

    createMutation.mutate({
      expense_pool_id: pool.id,
      gl_account_pattern: data.gl_account_pattern,
      allocation_percentage: data.allocation_percentage
        ? percentToDecimalString(data.allocation_percentage)
        : 1,
      priority: data.priority ? parseInt(data.priority, 10) : 0,
    })
  }

  const handleEdit = (mapping: PoolMapping) => {
    setEditingId(mapping.id)
    editForm.reset({
      gl_account_pattern: mapping.gl_account_pattern,
      allocation_percentage: mapping.allocation_percentage
        ? decimalToPercentString(mapping.allocation_percentage)
        : '100',
      priority: mapping.priority?.toString() || '0',
    })
  }

  const handleUpdate = (data: MappingFormData) => {
    // Same double-submit guard as handleAdd: an Enter keypress can race ahead of
    // the disabled save button while the update is already in flight.
    if (updateMutation.isPending) {
      return
    }

    updateMutation.mutate({
      gl_account_pattern: data.gl_account_pattern,
      allocation_percentage: data.allocation_percentage
        ? percentToDecimalString(data.allocation_percentage)
        : 1,
      priority: data.priority ? parseInt(data.priority, 10) : 0,
    })
  }

  const handleDelete = () => {
    // Guard against a repeated confirm-click firing a second delete before the
    // first resolves and clears deleteId.
    if (deleteMutation.isPending) {
      return
    }

    if (deleteId) {
      deleteMutation.mutate(deleteId)
    }
  }

  const cancelEdit = () => {
    setEditingId(null)
    editForm.reset()
  }

  const cancelAdd = () => {
    setIsAdding(false)
    addForm.reset()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>GL Account Mappings</DialogTitle>
            <DialogDescription>
              Manage GL account patterns for "{pool.name}"
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Add button */}
            {!isAdding && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAdding(true)}
                data-testid="add-mapping-button"
              >
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                Add Mapping
              </Button>
            )}

            {/* Add form */}
            {isAdding && (
              <Form {...addForm}>
                <form
                  onSubmit={addForm.handleSubmit(handleAdd)}
                  className="flex items-start gap-2 rounded-md border p-3"
                  data-testid="add-mapping-form"
                  noValidate
                >
                  <FormField
                    control={addForm.control}
                    name="gl_account_pattern"
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormControl>
                          <Input
                            placeholder="e.g., 51* or 5100-5199"
                            {...field}
                            data-testid="new-pattern-input"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={addForm.control}
                    name="allocation_percentage"
                    render={({ field }) => (
                      <FormItem className="w-20">
                        <FormControl>
                          <Input
                            placeholder="%"
                            {...field}
                            data-testid="new-allocation-input"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={addForm.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem className="w-16">
                        <FormControl>
                          <Input
                            placeholder="Pri"
                            {...field}
                            data-testid="new-priority-input"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={createMutation.isPending}
                    aria-label="Save mapping"
                    data-testid="save-new-mapping-button"
                  >
                    {createMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={cancelAdd}
                    aria-label="Cancel"
                    data-testid="cancel-new-mapping-button"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </form>
              </Form>
            )}

            {/* Mappings table */}
            <div className="rounded-md border">
              <Table aria-label={`GL account mappings for ${pool.name}`}>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <span className="flex items-center gap-1">
                        GL Pattern
                        <GlPatternHelp />
                      </span>
                    </TableHead>
                    <TableHead className="w-24">Allocation</TableHead>
                    <TableHead className="w-20">Priority</TableHead>
                    <TableHead className="w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : isOffline || isError ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8">
                        <div className="flex flex-col items-center gap-3 text-center">
                          <p className="text-sm text-destructive-strong">
                            {isOffline
                              ? "Can't reach the server. Check your connection and try again."
                              : 'We could not load the mappings.'}
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => refetch()}
                          >
                            Try again
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : mappings.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center text-muted-foreground py-8"
                      >
                        No mappings configured. Add one to start categorizing GL
                        entries.
                      </TableCell>
                    </TableRow>
                  ) : (
                    mappings.map((mapping) =>
                      editingId === mapping.id ? (
                        <TableRow
                          key={mapping.id}
                          data-testid={`mapping-row-${mapping.id}`}
                        >
                          <TableCell colSpan={4}>
                            <Form {...editForm}>
                              <form
                                onSubmit={editForm.handleSubmit(handleUpdate)}
                                className="flex items-start gap-2"
                                data-testid="edit-mapping-form"
                                noValidate
                              >
                                <FormField
                                  control={editForm.control}
                                  name="gl_account_pattern"
                                  render={({ field }) => (
                                    <FormItem className="flex-1">
                                      <FormControl>
                                        <Input
                                          {...field}
                                          data-testid="edit-pattern-input"
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={editForm.control}
                                  name="allocation_percentage"
                                  render={({ field }) => (
                                    <FormItem className="w-20">
                                      <FormControl>
                                        <Input
                                          {...field}
                                          data-testid="edit-allocation-input"
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={editForm.control}
                                  name="priority"
                                  render={({ field }) => (
                                    <FormItem className="w-16">
                                      <FormControl>
                                        <Input
                                          {...field}
                                          data-testid="edit-priority-input"
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <Button
                                  type="submit"
                                  size="icon"
                                  disabled={updateMutation.isPending}
                                  aria-label="Save changes"
                                  data-testid="save-edit-button"
                                >
                                  {updateMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Check className="h-4 w-4" />
                                  )}
                                </Button>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  onClick={cancelEdit}
                                  aria-label="Cancel editing"
                                  data-testid="cancel-edit-button"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </form>
                            </Form>
                          </TableCell>
                        </TableRow>
                      ) : (
                        <TableRow
                          key={mapping.id}
                          data-testid={`mapping-row-${mapping.id}`}
                        >
                          <TableCell className="font-mono">
                            {mapping.gl_account_pattern}
                          </TableCell>
                          <TableCell>
                            {mapping.allocation_percentage
                              ? `${decimalToPercentString(mapping.allocation_percentage)}%`
                              : '100%'}
                          </TableCell>
                          <TableCell>{mapping.priority ?? 0}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEdit(mapping)}
                                aria-label={`Edit mapping ${mapping.gl_account_pattern}`}
                                data-testid={`edit-mapping-${mapping.id}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeleteId(mapping.id)}
                                aria-label={`Delete mapping ${mapping.gl_account_pattern}`}
                                data-testid={`delete-mapping-${mapping.id}`}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    )
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Mapping</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this GL account mapping? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className={buttonVariants({ variant: 'destructive' })}
              data-testid="confirm-delete-button"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
