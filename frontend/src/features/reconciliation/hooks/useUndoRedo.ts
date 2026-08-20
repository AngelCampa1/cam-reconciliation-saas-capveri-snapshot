/**
 * Undo/Redo hook for cell edits.
 *
 * Provides Ctrl+Z and Ctrl+Y keyboard shortcuts for undoing/redoing changes.
 */

import { useState, useEffect, useCallback } from 'react'

export interface UndoAction {
  rowId: string
  field: string
  oldValue: string | number
  newValue: string | number
}

export interface UseUndoRedoOptions {
  onUndo?: (action: UndoAction) => void
  onRedo?: (action: UndoAction) => void
  maxHistorySize?: number
}

/**
 * Hook for undo/redo functionality with keyboard shortcuts.
 *
 * Features:
 * - Maintains history of cell changes
 * - Ctrl+Z to undo
 * - Ctrl+Y to redo
 * - Configurable max history size
 * - Callbacks for undo/redo actions
 */
export function useUndoRedo(options: UseUndoRedoOptions = {}) {
  const { onUndo, onRedo, maxHistorySize = 50 } = options

  const [history, setHistory] = useState<UndoAction[]>([])
  const [redoStack, setRedoStack] = useState<UndoAction[]>([])

  /**
   * Add an action to the undo history.
   * Clears the redo stack when a new action is added.
   */
  const addAction = useCallback(
    (action: UndoAction) => {
      setHistory((prev) => {
        const newHistory = [...prev, action]
        // Limit history size
        if (newHistory.length > maxHistorySize) {
          return newHistory.slice(-maxHistorySize)
        }
        return newHistory
      })
      // Clear redo stack when new action is added
      setRedoStack([])
    },
    [maxHistorySize]
  )

  /**
   * Undo the last action.
   * Moves action from history to redo stack.
   */
  const undo = useCallback(() => {
    if (history.length === 0) return

    const action = history[history.length - 1]
    if (!action) return // Type guard for array access

    setHistory((prev) => prev.slice(0, -1))
    setRedoStack((prev) => [...prev, action])

    if (onUndo) {
      onUndo(action)
    }
  }, [history, onUndo])

  /**
   * Redo the last undone action.
   * Moves action from redo stack back to history.
   */
  const redo = useCallback(() => {
    if (redoStack.length === 0) return

    const action = redoStack[redoStack.length - 1]
    if (!action) return // Type guard for array access

    setRedoStack((prev) => prev.slice(0, -1))
    setHistory((prev) => [...prev, action])

    if (onRedo) {
      onRedo(action)
    }
  }, [redoStack, onRedo])

  /**
   * Set up keyboard shortcuts.
   * Ctrl+Z for undo, Ctrl+Y for redo.
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault()
        redo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo])

  return {
    addAction,
    undo,
    redo,
    canUndo: history.length > 0,
    canRedo: redoStack.length > 0,
  }
}
