import { z } from 'zod';

/** Tags describe public pictures. They never change a show ID or booking. */
export { parsePhotoTags } from './photo-tag-parser.js';
export const photoSearchTagsSchema = z.object({
  url: z.string().max(2000).refine(value => {
    if (/^\/(?:portfolio|demo|playgrounds)\/[\w./-]+\.(?:jpg|jpeg|png|webp)$/i.test(value)) return !value.includes('..');
    try { const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password; } catch { return false; }
  }, 'Use a public photo link.'),
  tags: z.array(z.string().trim().min(1).max(60).refine(value => !/[<>#\r\n]/u.test(value), 'Enter plain search tags.')).max(16),
});
