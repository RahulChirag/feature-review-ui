export function countMetaItems(meta) {
  if (meta?.normalizedMeta) {
    return meta.normalizedMeta.knownSections.reduce((total, section) => total + section.items.length, 0)
  }
  return (
    (meta?.files_involved?.length ?? 0) +
    (meta?.entry_points?.length ?? 0) +
    (meta?.apis_used?.length ?? 0) +
    (meta?.db_operations?.length ?? 0) +
    (meta?.functions_traced?.length ?? 0)
  )
}
