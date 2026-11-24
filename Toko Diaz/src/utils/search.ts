/** Membersihkan kata kunci agar aman dipakai pada filter .or() / ilike PostgREST. */
export const sanitizeSearch = (s: string): string => s.replace(/[,()%*\\_"']/g, ' ').replace(/\s+/g, ' ').trim()
