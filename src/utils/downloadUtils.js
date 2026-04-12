/**
 * @param {string} filename
 * @param {string} contents
 * @param {string} [mime]
 */
export function downloadTextFile(filename, contents, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([contents], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
