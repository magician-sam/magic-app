export function parsePhotoTags(value: string): string[] {
  return [...new Set(value.split(/[,،\n#]+/u).map(tag => tag.normalize('NFKC').trim().replace(/\s+/g,' ')).filter(Boolean))];
}
