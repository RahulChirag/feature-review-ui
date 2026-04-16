export const strSort = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })

export function sortMetaCollections(meta) {
  return {
    entry_points: [...(meta.entry_points ?? [])].sort(strSort),
    files_involved: [...(meta.files_involved ?? [])].sort(strSort),
    apis_used: [...(meta.apis_used ?? [])].sort(strSort),
    db_operations: [...(meta.db_operations ?? [])].sort(strSort),
    functions_traced: meta.functions_traced ?? [],
  }
}

export function buildMetaStats(meta) {
  return [
    { key: 'files', label: 'Files', icon: '📁', value: meta.files_involved?.length ?? 0, valueClass: 'text-primary' },
    { key: 'entry', label: 'Entry Points', icon: '🚀', value: meta.entry_points?.length ?? 0, valueClass: 'text-primary' },
    { key: 'api', label: 'External APIs', icon: '🔌', value: meta.apis_used?.length ?? 0, valueClass: 'text-primary' },
    { key: 'db', label: 'DB Operations', icon: '🗄️', value: meta.db_operations?.length ?? 0, valueClass: 'text-primary' },
    { key: 'fn', label: 'Functions', icon: '⚙️', value: meta.functions_traced?.length ?? 0, valueClass: 'text-primary' },
  ]
}

export function parseEntryPoint(raw) {
  const arrowIdx = raw.indexOf(' -> ')
  if (arrowIdx === -1) {
    return { raw, structured: false }
  }

  const filePath = raw.slice(0, arrowIdx)
  const rest = raw.slice(arrowIdx + 4)
  const fileName = filePath.split('/').at(-1)
  const parenIdx = rest.indexOf(' (')

  return {
    structured: true,
    fileName,
    methodPart: parenIdx !== -1 ? rest.slice(0, parenIdx) : rest,
    descPart: parenIdx !== -1 ? rest.slice(parenIdx + 2, -1) : null,
  }
}

export function parseApi(raw) {
  const withoutPrefix = raw.replace(/^External:\s*/i, '')
  const parts = withoutPrefix.split(' ')
  const method = parts[0]
  const rest = parts.slice(1).join(' ')
  const parenMatch = rest.match(/^(.+?)\s+\((.+)\)$/)

  return {
    method,
    path: parenMatch ? parenMatch[1] : rest,
    desc: parenMatch ? parenMatch[2] : null,
  }
}

export function parseDbOperation(raw) {
  const inIdx = raw.lastIndexOf(' in ')
  const filePart = inIdx !== -1 ? raw.slice(inIdx + 4) : null
  const opPart = inIdx !== -1 ? raw.slice(0, inIdx) : raw
  const opKeywords = [
    'INSERT',
    'SELECT',
    'UPDATE',
    'DELETE',
    'UPSERT',
    'CRUD',
    'INSERT/UPDATE',
    'SELECT/UPDATE',
    'SELECT/INSERT/UPDATE',
  ]
  const tokens = opPart.split(' ')
  let index = 0
  const modelParts = []

  while (
    index < tokens.length &&
    !opKeywords.some((keyword) => tokens.slice(index).join(' ').startsWith(keyword))
  ) {
    modelParts.push(tokens[index])
    index += 1
  }

  return {
    model: modelParts.join(' '),
    ops: tokens.slice(index),
    fileName: filePart ? filePart.split('/').at(-1) : null,
  }
}

export function groupFunctionsByFile(items) {
  const groups = {}

  items.forEach((raw) => {
    const inIdx = raw.lastIndexOf(' in ')
    if (inIdx === -1) {
      ;(groups.unknown ??= []).push(raw)
      return
    }

    const fn = raw.slice(0, inIdx)
    const file = raw.slice(inIdx + 4)
    ;(groups[file] ??= []).push(fn)
  })

  const keys = Object.keys(groups).filter((key) => key !== 'unknown')
  keys.sort(strSort)

  if (groups.unknown) keys.push('unknown')

  return keys.map((file) => ({
    file,
    fns: [...groups[file]].sort(strSort),
  }))
}
