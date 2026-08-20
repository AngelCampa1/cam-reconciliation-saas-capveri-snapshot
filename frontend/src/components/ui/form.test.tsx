import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from './form'
import { Input } from './input'

const testSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
})

function TestForm({
  onSubmit = vi.fn(),
}: {
  onSubmit?: (data: unknown) => void
}) {
  const form = useForm({
    resolver: zodResolver(testSchema),
    defaultValues: { name: '', email: '' },
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} data-testid="test-form">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>Name</FormLabel>
              <FormControl>
                <Input placeholder="Enter name" {...field} />
              </FormControl>
              <FormDescription>Your full name</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" placeholder="Enter email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <button type="submit">Submit</button>
      </form>
    </Form>
  )
}

describe('Form', () => {
  it('renders labels and inputs', () => {
    render(<TestForm />)
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Enter name')).toBeInTheDocument()
    expect(screen.getByText('Your full name')).toBeInTheDocument()
  })

  it('shows required indicator on required fields', () => {
    render(<TestForm />)
    const nameLabel = screen.getByText('Name')
    expect(
      nameLabel.parentElement?.querySelector('.text-destructive-strong')
    ).toHaveTextContent('*')
  })

  it('displays validation errors on submit', async () => {
    const user = userEvent.setup()
    render(<TestForm />)

    await user.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeInTheDocument()
    })
  })

  it('submits valid form data', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<TestForm onSubmit={onSubmit} />)

    await user.type(screen.getByPlaceholderText('Enter name'), 'John')
    await user.type(
      screen.getByPlaceholderText('Enter email'),
      'john@example.com'
    )
    await user.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        { name: 'John', email: 'john@example.com' },
        expect.anything()
      )
    })
  })

  it('sets aria-invalid on inputs with errors', async () => {
    const user = userEvent.setup()
    render(<TestForm />)

    await user.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter name')).toHaveAttribute(
        'aria-invalid',
        'true'
      )
    })
  })

  it('applies the error border to FormField inputs when invalid', async () => {
    const user = userEvent.setup()
    render(<TestForm />)

    await user.click(screen.getByRole('button', { name: 'Submit' }))

    // FormControl-wired inputs never receive the `error` prop; they learn they
    // are invalid from the injected aria-invalid, which Input collapses into the
    // real `border-destructive` class (twMerge drops `border-input`).
    await waitFor(() => {
      const nameInput = screen.getByPlaceholderText('Enter name')
      expect(nameInput).toHaveAttribute('aria-invalid', 'true')
      expect(nameInput).toHaveClass('border-destructive')
      expect(nameInput).not.toHaveClass('border-input')
    })
  })

  it('points aria-describedby at the description when one is rendered', async () => {
    render(<TestForm />)
    const nameInput = screen.getByPlaceholderText('Enter name')
    const description = screen.getByText('Your full name')
    // hasDescription is published from a FormDescription effect, so wait for the
    // wiring to settle rather than asserting on the pre-effect render.
    await waitFor(() => {
      expect(nameInput).toHaveAttribute('aria-describedby', description.id)
    })
  })

  it('omits aria-describedby when no FormDescription is rendered', () => {
    render(<TestForm />)
    // The email field has no <FormDescription>, so aria-describedby must not
    // dangle at a non-existent node.
    expect(screen.getByPlaceholderText('Enter email')).not.toHaveAttribute(
      'aria-describedby'
    )
  })

  it('adds only the message id to aria-describedby after an error on a description-less field', async () => {
    const user = userEvent.setup()
    render(<TestForm />)
    const emailInput = screen.getByPlaceholderText('Enter email')
    expect(emailInput).not.toHaveAttribute('aria-describedby')

    await user.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => {
      const message = screen.getByText('Invalid email')
      expect(emailInput).toHaveAttribute('aria-describedby', message.id)
    })
  })
})
