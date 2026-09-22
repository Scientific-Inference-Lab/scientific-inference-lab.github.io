import { getImage } from 'astro:assets';
import type { ImageMetadata } from 'astro';
export async function responsiveImage(src: ImageMetadata, alt: string, sizes: string) {
  const widths = [320, 640, 960, 1440].filter(width => width < src.width);
  widths.push(src.width);
  const make = (format: 'avif' | 'webp' | 'png') => getImage({ src, widths, format, quality: 85 });
  const [avif, webp, fallback] = await Promise.all([make('avif'), make('webp'), make('png')]);
  return { src: fallback.src, width: src.width, height: src.height, alt, sizes,
    avif: avif.srcSet.attribute, webp: webp.srcSet.attribute, srcset: fallback.srcSet.attribute };
}
