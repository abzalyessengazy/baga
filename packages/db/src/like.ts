/** Escapes a word for use inside an SQL ILIKE pattern ('%' and '_' are wildcards; '\' is Postgres' default escape). */
export function likePattern(word: string): string {
  return `%${word.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
