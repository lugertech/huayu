/** A higher score puts exact names before prefixes and secondary keywords. */
export function searchScore(query: string, name: string, keywords = "") {
  const normalize = (value: string) =>
    value.normalize("NFKC").toLocaleLowerCase().trim();
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return 1;
  const title = normalize(name);
  const secondary = normalize(keywords);
  let score = 0;
  for (const term of terms) {
    if (title === term) score += 100;
    else if (title.startsWith(term)) score += 60;
    else if (title.includes(term)) score += 30;
    else if (secondary.includes(term)) score += 10;
    else return 0;
  }
  return score;
}
