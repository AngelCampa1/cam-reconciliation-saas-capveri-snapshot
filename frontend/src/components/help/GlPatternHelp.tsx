import { HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { GL_PATTERN_ROWS } from './gl-pattern-rows'

export function GlPatternHelp() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-muted-foreground hover:text-foreground"
          aria-label="GL pattern syntax help"
        >
          <HelpCircle className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>GL Pattern Syntax</DialogTitle>
          <DialogDescription className="sr-only">
            Reference table for GL account pattern syntax used in pool mappings.
          </DialogDescription>
        </DialogHeader>
        <Table>
          <caption className="sr-only">
            GL account pattern syntax reference
          </caption>
          <TableHeader>
            <TableRow>
              <TableHead>Pattern</TableHead>
              <TableHead>Meaning</TableHead>
              <TableHead>Example</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {GL_PATTERN_ROWS.map((row) => (
              <TableRow key={row.pattern}>
                <TableCell className="font-mono">{row.pattern}</TableCell>
                <TableCell>{row.meaning}</TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {row.example}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  )
}
