import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import { Slot } from '@radix-ui/react-slot'
import {
  Controller,
  ControllerProps,
  FieldPath,
  FieldValues,
  FormProvider,
  useFormContext,
} from 'react-hook-form'

import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'

const Form = FormProvider

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  name: TName
}

const FormFieldContext = React.createContext<FormFieldContextValue>(
  {} as FormFieldContextValue
)

const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  )
}

const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext)
  const itemContext = React.useContext(FormItemContext)
  const { getFieldState, formState } = useFormContext()

  const fieldState = getFieldState(fieldContext.name, formState)

  if (!fieldContext) {
    throw new Error('useFormField should be used within <FormField>')
  }

  const { id } = itemContext

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    required: itemContext.required,
    setRequired: itemContext.setRequired,
    hasDescription: itemContext.hasDescription,
    setHasDescription: itemContext.setHasDescription,
    ...fieldState,
  }
}

type FormItemContextValue = {
  id: string
  // The visual `*` lives on FormLabel, but the input that conveys "required" to
  // assistive tech is a sibling. FormLabel publishes its `required` flag here so
  // FormControl can mirror it onto the actual control as aria-required.
  required: boolean
  setRequired: (required: boolean) => void
  // FormDescription is optional. It publishes its presence here so FormControl
  // only points aria-describedby at the description id when one is rendered —
  // otherwise the attribute dangles at a non-existent node.
  hasDescription: boolean
  setHasDescription: (hasDescription: boolean) => void
}

const FormItemContext = React.createContext<FormItemContextValue>({
  id: '',
  required: false,
  setRequired: () => {},
  hasDescription: false,
  setHasDescription: () => {},
})

const FormItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const id = React.useId()
  const [required, setRequired] = React.useState(false)
  const [hasDescription, setHasDescription] = React.useState(false)

  return (
    <FormItemContext.Provider
      value={{ id, required, setRequired, hasDescription, setHasDescription }}
    >
      <div ref={ref} className={cn('space-y-2', className)} {...props} />
    </FormItemContext.Provider>
  )
})
FormItem.displayName = 'FormItem'

const FormLabel = React.forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & {
    required?: boolean | undefined
  }
>(({ className, required, children, ...props }, ref) => {
  const { error, formItemId, setRequired } = useFormField()

  // Mirror the required flag onto the control (via context) so screen readers
  // announce it. The asterisk below stays aria-hidden — it is a sighted-only cue.
  React.useEffect(() => {
    setRequired(!!required)
  }, [required, setRequired])

  return (
    <Label
      ref={ref}
      className={cn(error && 'text-destructive-strong', className)}
      htmlFor={formItemId}
      {...props}
    >
      {children}
      {required && (
        <span className="ml-1 text-destructive-strong" aria-hidden="true">
          *
        </span>
      )}
    </Label>
  )
})
FormLabel.displayName = 'FormLabel'

const FormControl = React.forwardRef<
  React.ComponentRef<typeof Slot>,
  React.ComponentPropsWithoutRef<typeof Slot>
>(({ ...props }, ref) => {
  const {
    error,
    formItemId,
    formDescriptionId,
    formMessageId,
    required,
    hasDescription,
  } = useFormField()

  const describedBy =
    [hasDescription ? formDescriptionId : null, error ? formMessageId : null]
      .filter(Boolean)
      .join(' ') || undefined

  return (
    <Slot
      ref={ref}
      id={formItemId}
      aria-describedby={describedBy}
      aria-invalid={!!error}
      aria-required={required || undefined}
      {...props}
    />
  )
})
FormControl.displayName = 'FormControl'

const FormDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
  const { formDescriptionId, setHasDescription } = useFormField()

  // Register presence so FormControl includes this id in aria-describedby only
  // while a description is actually mounted.
  React.useEffect(() => {
    setHasDescription(true)
    return () => setHasDescription(false)
  }, [setHasDescription])

  return (
    <p
      ref={ref}
      id={formDescriptionId}
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
})
FormDescription.displayName = 'FormDescription'

const FormMessage = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, children, ...props }, ref) => {
  const { error, formMessageId } = useFormField()
  const body = error ? String(error?.message) : children

  if (!body) {
    return null
  }

  return (
    <p
      ref={ref}
      id={formMessageId}
      className={cn(
        'text-sm font-medium text-destructive-strong',
        'animate-in fade-in-0 slide-in-from-top-1 duration-200',
        className
      )}
      role="alert"
      {...props}
    >
      {body}
    </p>
  )
})
FormMessage.displayName = 'FormMessage'

export {
  useFormField,
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
}
