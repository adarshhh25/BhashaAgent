import type { ImgHTMLAttributes } from 'react';

export interface BhashaLogoProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  /**
   * Optional square dimension in pixels or custom size string
   */
  size?: number | string;
}

/**
 * Reusable BhashaAgent brand logo component.
 * References the official brand asset at `/icons/Logo.png` inside Vite's public directory.
 * Maintains aspect ratio via `object-fit: contain` and prevents distortion.
 */
export function BhashaLogo({
  size,
  className = '',
  alt = 'BhashaAgent',
  style,
  ...rest
}: BhashaLogoProps) {
  const isNumericSize = typeof size === 'number';
  const sizeStyle = isNumericSize ? { width: size, height: size } : undefined;
  const sizeClass = typeof size === 'string' ? size : '';

  return (
    <img
      src="/icons/Logo.png"
      alt={alt}
      style={{
        objectFit: 'contain',
        ...sizeStyle,
        ...style,
      }}
      className={`object-contain select-none shrink-0 inline-block ${sizeClass} ${className}`.trim()}
      loading="eager"
      decoding="async"
      {...rest}
    />
  );
}

export default BhashaLogo;

