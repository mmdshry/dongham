export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '؟';
  return parts
    .slice(0, 2)
    .map((p) => p[0]!)
    .join('');
}

export function firstName(name?: string): string {
  const trimmed = name?.trim();
  if (!trimmed || trimmed === 'من') return 'شما';
  return trimmed.split(/\s+/)[0] || trimmed;
}
