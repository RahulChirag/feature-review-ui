/* global console, process */
import fs from 'node:fs/promises'
import path from 'node:path'

const REVIEW_ROOT = path.resolve(process.cwd(), 'feature-reviews')
const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown'])
const PDF_EXTENSIONS = new Set(['.pdf'])
const ALLOWED_META_FILENAMES = new Set(['meta.json'])
const TITLE_KEYS = ['feature', 'title', 'name']
const DATE_KEYS = ['generated_date', 'analyzed_date', 'generatedAt']

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

function normalizeMeta(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  return {}
}

async function validateFeatureFolder(folderPath) {
  const folderName = path.basename(folderPath)
  const entries = await fs.readdir(folderPath, { withFileTypes: true })
  const errors = []
  const warnings = []
  let markdownCount = 0
  let pdfCount = 0
  let metaFound = false

  for (const entry of entries) {
    const entryPath = path.join(folderPath, entry.name)
    if (entry.isDirectory()) {
      errors.push(`Unexpected nested directory: ${path.relative(REVIEW_ROOT, entryPath)}`)
      continue
    }
    if (!entry.isFile()) continue

    const ext = path.extname(entry.name).toLowerCase()
    const lowerName = entry.name.toLowerCase()

    if (MARKDOWN_EXTENSIONS.has(ext)) {
      markdownCount += 1
      continue
    }
    if (PDF_EXTENSIONS.has(ext)) {
      pdfCount += 1
      continue
    }
    if (lowerName.endsWith('.json')) {
      if (!ALLOWED_META_FILENAMES.has(lowerName)) {
        errors.push(
          `Invalid metadata filename "${entry.name}" in ${folderName}; expected "meta.json".`
        )
        continue
      }

      metaFound = true
      try {
        const raw = await fs.readFile(entryPath, 'utf8')
        const parsed = normalizeMeta(JSON.parse(raw))
        if (!TITLE_KEYS.some((key) => typeof parsed[key] === 'string' && parsed[key].trim())) {
          warnings.push(
            `No title-like field (feature/title/name) in ${path.relative(REVIEW_ROOT, entryPath)}.`
          )
        }
        const dateKey = DATE_KEYS.find((key) => parsed[key] != null && parsed[key] !== '')
        if (dateKey) {
          const parsedDate = Date.parse(String(parsed[dateKey]))
          if (Number.isNaN(parsedDate)) {
            warnings.push(
              `Invalid date in ${path.relative(REVIEW_ROOT, entryPath)} for key "${dateKey}".`
            )
          }
        } else {
          warnings.push(
            `No date-like field (generated_date/analyzed_date/generatedAt) in ${path.relative(REVIEW_ROOT, entryPath)}.`
          )
        }
      } catch (error) {
        errors.push(`Invalid JSON in ${path.relative(REVIEW_ROOT, entryPath)}: ${error.message}`)
      }
      continue
    }

    errors.push(`Unsupported file "${entry.name}" in ${folderName}.`)
  }

  if (markdownCount > 1) errors.push(`Multiple markdown files found in ${folderName}.`)
  if (pdfCount > 1) errors.push(`Multiple PDF files found in ${folderName}.`)
  if (markdownCount > 0 && pdfCount > 0) {
    warnings.push(`Both markdown and PDF files found in ${folderName}; markdown will be preferred.`)
  }
  if (!metaFound) warnings.push(`No metadata file for ${folderName}.`)
  if (markdownCount === 0 && pdfCount === 0 && !metaFound) {
    errors.push(`No review artifacts found in ${folderName}.`)
  }

  return { folderName, errors, warnings }
}

async function main() {
  if (!(await pathExists(REVIEW_ROOT))) {
    throw new Error(`feature-reviews folder not found at ${REVIEW_ROOT}`)
  }

  const entries = await fs.readdir(REVIEW_ROOT, { withFileTypes: true })
  const featureDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  const results = await Promise.all(
    featureDirs.map((dirName) => validateFeatureFolder(path.join(REVIEW_ROOT, dirName)))
  )

  let hasErrors = false
  let warningCount = 0

  for (const result of results.sort((a, b) => a.folderName.localeCompare(b.folderName))) {
    for (const warning of result.warnings) {
      warningCount += 1
      console.warn(`WARN: ${warning}`)
    }
    for (const error of result.errors) {
      hasErrors = true
      console.error(`ERROR: ${error}`)
    }
  }

  if (hasErrors) {
    process.exitCode = 1
    console.error('Feature review validation failed.')
    return
  }

  console.log(
    `Feature review validation passed for ${results.length} feature folders${warningCount ? ` with ${warningCount} warnings` : ''}.`
  )
}

main().catch((error) => {
  console.error(`Feature review validation failed: ${error.message}`)
  process.exit(1)
})
