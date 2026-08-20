/**
 * Creates minimal test PDF files for E2E testing
 * Uses PDFKit to generate simple PDFs with lease-like content
 */

import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Create Suite 101 Lease (Base Year)
function createSuite101Lease() {
  const doc = new PDFDocument()
  const filePath = path.join(__dirname, 'suite-101-lease.pdf')
  doc.pipe(fs.createWriteStream(filePath))

  doc.fontSize(16).text('COMMERCIAL LEASE AGREEMENT', { align: 'center' })
  doc.moveDown()
  doc.fontSize(12).text('Suite 101 - Test Plaza Shopping Center')
  doc.moveDown()

  doc.fontSize(10)
  doc.text('TENANT: Acme Corporation')
  doc.text('PREMISES: Suite 101, 2,500 sq ft')
  doc.moveDown()

  doc.text('CAM RECOVERY TERMS:', { underline: true })
  doc.text('Base Year: 2023')
  doc.text('Pro-Rata Share: 4.85%')
  doc.text('Administrative Fee: 15%')
  doc.text('Expense Cap: 5% cumulative')

  doc.end()
  console.log(`✅ Created ${filePath}`)
}

// Create Suite 205 Lease (Gross-Up)
function createSuite205Lease() {
  const doc = new PDFDocument()
  const filePath = path.join(__dirname, 'suite-205-lease.pdf')
  doc.pipe(fs.createWriteStream(filePath))

  doc.fontSize(16).text('COMMERCIAL LEASE AGREEMENT', { align: 'center' })
  doc.moveDown()
  doc.fontSize(12).text('Suite 205 - Test Plaza Shopping Center')
  doc.moveDown()

  doc.fontSize(10)
  doc.text('TENANT: Tech Startup Inc.')
  doc.text('PREMISES: Suite 205, 3,200 sq ft')
  doc.moveDown()

  doc.text('CAM RECOVERY TERMS:', { underline: true })
  doc.text('No Base Year (Full Recovery)')
  doc.text('Pro-Rata Share: 6.2%')
  doc.text('Gross-Up to 95% occupancy')
  doc.text('Administrative Fee: 15%')

  doc.end()
  console.log(`✅ Created ${filePath}`)
}

// Create Suite 310 Lease (Low Confidence)
function createSuite310Lease() {
  const doc = new PDFDocument()
  const filePath = path.join(__dirname, 'suite-310-lease.pdf')
  doc.pipe(fs.createWriteStream(filePath))

  doc.fontSize(16).text('COMMERCIAL LEASE AGREEMENT', { align: 'center' })
  doc.moveDown()
  doc.fontSize(12).text('Suite 310 - Test Plaza Shopping Center')
  doc.moveDown()

  doc.fontSize(10)
  doc.text('TENANT: Retail Shop LLC')
  doc.text('PREMISES: Suite 310, 1,800 sq ft')
  doc.moveDown()

  doc.text('OPERATING EXPENSE RECOVERY:', { underline: true })
  doc.text('Tenant shall reimburse Landlord for its proportionate share')
  doc.text('Share: approximately 3.5 percent')
  doc.text('Subject to annual increases as mutually agreed')

  doc.end()
  console.log(`✅ Created ${filePath}`)
}

// Generate all PDFs
console.log('🔧 Generating test PDF files...')
createSuite101Lease()
createSuite205Lease()
createSuite310Lease()
console.log('✅ All test PDFs created')
