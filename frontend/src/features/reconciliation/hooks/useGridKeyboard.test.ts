/**
 * Tests for useGridKeyboard hook.
 *
 * Validates keyboard navigation including arrow keys, tab, enter, and home/end.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGridKeyboard } from './useGridKeyboard'

describe('useGridKeyboard', () => {
  const mockTable = {
    getRowModel: () => ({
      rows: [{ id: 'row-0' }, { id: 'row-1' }, { id: 'row-2' }],
    }),
    getAllColumns: () => [
      { id: 'col-0', columnDef: { meta: { editable: false } } },
      { id: 'col-1', columnDef: { meta: { editable: true } } },
      { id: 'col-2', columnDef: { meta: { editable: true } } },
      { id: 'col-3', columnDef: { meta: { editable: false } } },
    ],
  } as any

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('initializes with no focused cell', () => {
    const { result } = renderHook(() => useGridKeyboard(mockTable))

    expect(result.current.focusedCell).toBeNull()
  })

  it('sets focused cell when setFocusedCell is called', () => {
    const { result } = renderHook(() => useGridKeyboard(mockTable))

    act(() => {
      result.current.setFocusedCell({ rowIndex: 0, columnId: 'col-1' })
    })

    expect(result.current.focusedCell).toEqual({
      rowIndex: 0,
      columnId: 'col-1',
    })
  })

  describe('Arrow key navigation', () => {
    it('moves down with ArrowDown key', () => {
      const { result } = renderHook(() => useGridKeyboard(mockTable))

      act(() => {
        result.current.setFocusedCell({ rowIndex: 0, columnId: 'col-1' })
      })

      act(() => {
        const event = new KeyboardEvent('keydown', { key: 'ArrowDown' })
        result.current.handleKeyDown(event)
      })

      expect(result.current.focusedCell).toEqual({
        rowIndex: 1,
        columnId: 'col-1',
      })
    })

    it('moves up with ArrowUp key', () => {
      const { result } = renderHook(() => useGridKeyboard(mockTable))

      act(() => {
        result.current.setFocusedCell({ rowIndex: 1, columnId: 'col-1' })
      })

      act(() => {
        const event = new KeyboardEvent('keydown', { key: 'ArrowUp' })
        result.current.handleKeyDown(event)
      })

      expect(result.current.focusedCell).toEqual({
        rowIndex: 0,
        columnId: 'col-1',
      })
    })

    it('does not move up beyond first row', () => {
      const { result } = renderHook(() => useGridKeyboard(mockTable))

      act(() => {
        result.current.setFocusedCell({ rowIndex: 0, columnId: 'col-1' })
      })

      act(() => {
        const event = new KeyboardEvent('keydown', { key: 'ArrowUp' })
        result.current.handleKeyDown(event)
      })

      expect(result.current.focusedCell).toEqual({
        rowIndex: 0,
        columnId: 'col-1',
      })
    })

    it('does not move down beyond last row', () => {
      const { result } = renderHook(() => useGridKeyboard(mockTable))

      act(() => {
        result.current.setFocusedCell({ rowIndex: 2, columnId: 'col-1' })
      })

      act(() => {
        const event = new KeyboardEvent('keydown', { key: 'ArrowDown' })
        result.current.handleKeyDown(event)
      })

      expect(result.current.focusedCell).toEqual({
        rowIndex: 2,
        columnId: 'col-1',
      })
    })

    it('moves right with ArrowRight key', () => {
      const { result } = renderHook(() => useGridKeyboard(mockTable))

      act(() => {
        result.current.setFocusedCell({ rowIndex: 0, columnId: 'col-1' })
      })

      act(() => {
        const event = new KeyboardEvent('keydown', { key: 'ArrowRight' })
        result.current.handleKeyDown(event)
      })

      expect(result.current.focusedCell).toEqual({
        rowIndex: 0,
        columnId: 'col-2',
      })
    })

    it('moves left with ArrowLeft key', () => {
      const { result } = renderHook(() => useGridKeyboard(mockTable))

      act(() => {
        result.current.setFocusedCell({ rowIndex: 0, columnId: 'col-2' })
      })

      act(() => {
        const event = new KeyboardEvent('keydown', { key: 'ArrowLeft' })
        result.current.handleKeyDown(event)
      })

      expect(result.current.focusedCell).toEqual({
        rowIndex: 0,
        columnId: 'col-1',
      })
    })

    it('does not move left beyond first column', () => {
      const { result } = renderHook(() => useGridKeyboard(mockTable))

      act(() => {
        result.current.setFocusedCell({ rowIndex: 0, columnId: 'col-0' })
      })

      act(() => {
        const event = new KeyboardEvent('keydown', { key: 'ArrowLeft' })
        result.current.handleKeyDown(event)
      })

      expect(result.current.focusedCell).toEqual({
        rowIndex: 0,
        columnId: 'col-0',
      })
    })

    it('does not move right beyond last column', () => {
      const { result } = renderHook(() => useGridKeyboard(mockTable))

      act(() => {
        result.current.setFocusedCell({ rowIndex: 0, columnId: 'col-3' })
      })

      act(() => {
        const event = new KeyboardEvent('keydown', { key: 'ArrowRight' })
        result.current.handleKeyDown(event)
      })

      expect(result.current.focusedCell).toEqual({
        rowIndex: 0,
        columnId: 'col-3',
      })
    })
  })

  describe('Tab navigation', () => {
    it('moves to next editable cell with Tab', () => {
      const { result } = renderHook(() => useGridKeyboard(mockTable))

      act(() => {
        result.current.setFocusedCell({ rowIndex: 0, columnId: 'col-1' })
      })

      act(() => {
        const event = new KeyboardEvent('keydown', { key: 'Tab' })
        result.current.handleKeyDown(event)
      })

      expect(result.current.focusedCell).toEqual({
        rowIndex: 0,
        columnId: 'col-2',
      })
    })

    it('skips non-editable cells with Tab', () => {
      const { result } = renderHook(() => useGridKeyboard(mockTable))

      act(() => {
        result.current.setFocusedCell({ rowIndex: 0, columnId: 'col-2' })
      })

      act(() => {
        const event = new KeyboardEvent('keydown', { key: 'Tab' })
        result.current.handleKeyDown(event)
      })

      // col-3 is not editable, should wrap to next row col-1
      expect(result.current.focusedCell).toEqual({
        rowIndex: 1,
        columnId: 'col-1',
      })
    })

    it('moves to previous editable cell with Shift+Tab', () => {
      const { result } = renderHook(() => useGridKeyboard(mockTable))

      act(() => {
        result.current.setFocusedCell({ rowIndex: 0, columnId: 'col-2' })
      })

      act(() => {
        const event = new KeyboardEvent('keydown', {
          key: 'Tab',
          shiftKey: true,
        })
        result.current.handleKeyDown(event)
      })

      expect(result.current.focusedCell).toEqual({
        rowIndex: 0,
        columnId: 'col-1',
      })
    })

    it('wraps to previous row when Shift+Tab at first editable column', () => {
      const { result } = renderHook(() => useGridKeyboard(mockTable))

      act(() => {
        result.current.setFocusedCell({ rowIndex: 1, columnId: 'col-1' })
      })

      act(() => {
        const event = new KeyboardEvent('keydown', {
          key: 'Tab',
          shiftKey: true,
        })
        result.current.handleKeyDown(event)
      })

      // Should go to last editable column of previous row
      expect(result.current.focusedCell).toEqual({
        rowIndex: 0,
        columnId: 'col-2',
      })
    })
  })

  describe('Enter key', () => {
    it('calls onEnterEdit when Enter is pressed', () => {
      const onEnterEdit = vi.fn()
      const { result } = renderHook(() =>
        useGridKeyboard(mockTable, { onEnterEdit })
      )

      act(() => {
        result.current.setFocusedCell({ rowIndex: 0, columnId: 'col-1' })
      })

      act(() => {
        const event = new KeyboardEvent('keydown', { key: 'Enter' })
        result.current.handleKeyDown(event)
      })

      expect(onEnterEdit).toHaveBeenCalledWith({
        rowIndex: 0,
        columnId: 'col-1',
      })
    })

    it('does not call onEnterEdit when no cell is focused', () => {
      const onEnterEdit = vi.fn()
      const { result } = renderHook(() =>
        useGridKeyboard(mockTable, { onEnterEdit })
      )

      act(() => {
        const event = new KeyboardEvent('keydown', { key: 'Enter' })
        result.current.handleKeyDown(event)
      })

      expect(onEnterEdit).not.toHaveBeenCalled()
    })
  })

  describe('Home/End keys', () => {
    it('moves to first column with Home key', () => {
      const { result } = renderHook(() => useGridKeyboard(mockTable))

      act(() => {
        result.current.setFocusedCell({ rowIndex: 0, columnId: 'col-2' })
      })

      act(() => {
        const event = new KeyboardEvent('keydown', { key: 'Home' })
        result.current.handleKeyDown(event)
      })

      expect(result.current.focusedCell).toEqual({
        rowIndex: 0,
        columnId: 'col-0',
      })
    })

    it('moves to last column with End key', () => {
      const { result } = renderHook(() => useGridKeyboard(mockTable))

      act(() => {
        result.current.setFocusedCell({ rowIndex: 0, columnId: 'col-1' })
      })

      act(() => {
        const event = new KeyboardEvent('keydown', { key: 'End' })
        result.current.handleKeyDown(event)
      })

      expect(result.current.focusedCell).toEqual({
        rowIndex: 0,
        columnId: 'col-3',
      })
    })

    it('moves to first row with Ctrl+Home', () => {
      const { result } = renderHook(() => useGridKeyboard(mockTable))

      act(() => {
        result.current.setFocusedCell({ rowIndex: 2, columnId: 'col-1' })
      })

      act(() => {
        const event = new KeyboardEvent('keydown', {
          key: 'Home',
          ctrlKey: true,
        })
        result.current.handleKeyDown(event)
      })

      expect(result.current.focusedCell).toEqual({
        rowIndex: 0,
        columnId: 'col-1',
      })
    })

    it('moves to last row with Ctrl+End', () => {
      const { result } = renderHook(() => useGridKeyboard(mockTable))

      act(() => {
        result.current.setFocusedCell({ rowIndex: 0, columnId: 'col-1' })
      })

      act(() => {
        const event = new KeyboardEvent('keydown', {
          key: 'End',
          ctrlKey: true,
        })
        result.current.handleKeyDown(event)
      })

      expect(result.current.focusedCell).toEqual({
        rowIndex: 2,
        columnId: 'col-1',
      })
    })
  })

  describe('Page Up/Down keys', () => {
    it('calls onPageUp when PageUp is pressed', () => {
      const onPageUp = vi.fn()
      const { result } = renderHook(() =>
        useGridKeyboard(mockTable, { onPageUp })
      )

      act(() => {
        result.current.setFocusedCell({ rowIndex: 2, columnId: 'col-1' })
      })

      act(() => {
        const event = new KeyboardEvent('keydown', { key: 'PageUp' })
        result.current.handleKeyDown(event)
      })

      expect(onPageUp).toHaveBeenCalled()
    })

    it('calls onPageDown when PageDown is pressed', () => {
      const onPageDown = vi.fn()
      const { result } = renderHook(() =>
        useGridKeyboard(mockTable, { onPageDown })
      )

      act(() => {
        result.current.setFocusedCell({ rowIndex: 0, columnId: 'col-1' })
      })

      act(() => {
        const event = new KeyboardEvent('keydown', { key: 'PageDown' })
        result.current.handleKeyDown(event)
      })

      expect(onPageDown).toHaveBeenCalled()
    })
  })

  it('does nothing when no cell is focused', () => {
    const { result } = renderHook(() => useGridKeyboard(mockTable))

    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'ArrowDown' })
      result.current.handleKeyDown(event)
    })

    expect(result.current.focusedCell).toBeNull()
  })
})
