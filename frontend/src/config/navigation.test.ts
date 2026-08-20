import { describe, it, expect } from 'vitest'
import {
  mainNavigation,
  secondaryNavigation,
  getAllNavigation,
  findNavItemById,
  findNavItemByHref,
  type NavItemConfig,
} from './navigation'
import { UserRole } from '@/types/enums'

describe('Navigation Configuration', () => {
  describe('mainNavigation', () => {
    it('should contain expected navigation items', () => {
      const ids = mainNavigation.map((item) => item.id)
      expect(ids).toContain('dashboard')
      expect(ids).toContain('portfolio')
      expect(ids).toContain('properties')
      expect(ids).toContain('reconciliations')
      expect(ids).toContain('analysis')
      expect(ids).toContain('documents')
      expect(ids).toContain('pools')
    })

    it('should expose the expense pools page from primary navigation (F-095)', () => {
      const item = findNavItemById('pools')
      expect(item?.href).toBe('/pools')
      expect(findNavItemByHref('/pools')?.id).toBe('pools')
    })

    it('should have all required properties on each item', () => {
      for (const item of mainNavigation) {
        expect(item.id).toBeDefined()
        expect(item.label).toBeDefined()
        expect(item.icon).toBeDefined()
        expect(item.href).toBeDefined()
      }
    })

    it('should have nested children for portfolio work', () => {
      const portfolio = mainNavigation.find((item) => item.id === 'portfolio')
      expect(portfolio).toBeDefined()
      expect(portfolio?.children).toBeDefined()
      expect(portfolio?.children?.length).toBeGreaterThan(0)
      expect(
        portfolio?.children?.some((child) => child.id === 'portfolio-pipeline')
      ).toBe(true)
    })

    it('should have valid hrefs starting with /', () => {
      const checkHrefs = (items: NavItemConfig[]) => {
        for (const item of items) {
          expect(item.href).toMatch(/^\//)
          if (item.children) {
            checkHrefs(item.children)
          }
        }
      }
      checkHrefs(mainNavigation)
    })

    it('should route data imports to the ingestion page', () => {
      const item = findNavItemById('documents-upload-gl')
      expect(item?.href).toBe('/ingestion')
      expect(findNavItemByHref('/imports')).toBeUndefined()
    })

    it('should expose document extraction review from Documents navigation', () => {
      const documents = findNavItemById('documents')
      const item = findNavItemById('documents-extractions')

      expect(
        documents?.children?.some(
          (child) => child.id === 'documents-extractions'
        )
      ).toBe(true)
      expect(item?.label).toBe('Extractions')
      expect(item?.href).toBe('/extractions')
    })

    it('should route year-over-year analysis to the registered app route', () => {
      expect(findNavItemById('analysis')?.href).toBe('/analysis/year-over-year')
      expect(findNavItemById('analysis-yoy')?.href).toBe(
        '/analysis/year-over-year'
      )
      expect(findNavItemByHref('/analysis/yoy')).toBeUndefined()
    })
  })

  describe('secondaryNavigation', () => {
    it('should contain settings and admin items', () => {
      const ids = secondaryNavigation.map((item) => item.id)
      expect(ids).toContain('settings')
      expect(ids).toContain('admin')
    })

    it('should have all required properties on each item', () => {
      for (const item of secondaryNavigation) {
        expect(item.id).toBeDefined()
        expect(item.label).toBeDefined()
        expect(item.icon).toBeDefined()
        expect(item.href).toBeDefined()
      }
    })

    it('should route team to settings team members', () => {
      const item = findNavItemById('settings-team')
      expect(item?.href).toBe('/settings/team')
      expect(findNavItemByHref('/team')).toBeUndefined()
    })

    it('should route organization settings to the registered app route', () => {
      const item = findNavItemById('settings-organization')
      expect(item?.href).toBe('/settings/organization')
      expect(findNavItemByHref('/organization/settings')).toBeUndefined()
    })

    it('should restrict organization, team, and admin navigation to owner/admin roles', () => {
      const ownerAdminRoles = [UserRole.OWNER, UserRole.ADMIN]

      expect(findNavItemById('settings-organization')?.requiredRoles).toEqual(
        ownerAdminRoles
      )
      expect(findNavItemById('settings-team')?.requiredRoles).toEqual(
        ownerAdminRoles
      )
      expect(findNavItemById('admin')?.requiredRoles).toEqual(ownerAdminRoles)
      expect(findNavItemById('admin-feedback')?.requiredRoles).toEqual(
        ownerAdminRoles
      )
    })
  })

  describe('getAllNavigation', () => {
    it('should return combined main and secondary navigation', () => {
      const all = getAllNavigation()
      expect(all.length).toBe(
        mainNavigation.length + secondaryNavigation.length
      )
    })

    it('should include items from both arrays', () => {
      const all = getAllNavigation()
      const ids = all.map((item) => item.id)
      expect(ids).toContain('dashboard')
      expect(ids).toContain('settings')
    })
  })

  describe('findNavItemById', () => {
    it('should find top-level items', () => {
      const item = findNavItemById('dashboard')
      expect(item).toBeDefined()
      expect(item?.label).toBe('Dashboard')
    })

    it('should find nested items', () => {
      const item = findNavItemById('portfolio-pipeline')
      expect(item).toBeDefined()
      expect(item?.label).toBe('Pipeline')
    })

    it('should return undefined for non-existent items', () => {
      const item = findNavItemById('non-existent')
      expect(item).toBeUndefined()
    })

    it('should search in provided items array', () => {
      const customItems: NavItemConfig[] = [
        {
          id: 'custom',
          label: 'Custom',
          icon: mainNavigation[0].icon,
          href: '/custom',
        },
      ]
      const item = findNavItemById('custom', customItems)
      expect(item).toBeDefined()
      expect(item?.label).toBe('Custom')
    })
  })

  describe('findNavItemByHref', () => {
    it('should find items by href', () => {
      const item = findNavItemByHref('/properties')
      expect(item).toBeDefined()
      expect(item?.id).toBe('properties')
    })

    it('should find nested items by href', () => {
      const item = findNavItemByHref('/portfolio/pipeline')
      expect(item).toBeDefined()
      expect(item?.id).toBe('portfolio-pipeline')
    })

    it('should return undefined for non-existent hrefs', () => {
      const item = findNavItemByHref('/non-existent')
      expect(item).toBeUndefined()
    })

    it('should find items from secondary navigation', () => {
      const item = findNavItemByHref('/settings/billing')
      expect(item).toBeDefined()
      expect(item?.id).toBe('settings-billing')
    })
  })
})
