/**
 * Display size for the logo in the yellow email header.
 * The file is 2783×1445, so a 132px-wide render stays sharp on retina.
 * Width and height are both set: Outlook uses the attributes, Gmail uses the CSS.
 */
export const EMAIL_LOGO_WIDTH = 132;
export const EMAIL_LOGO_HEIGHT = 68;

export function emailHeaderLogoHtml(logoUrl: string): string {
  const width = EMAIL_LOGO_WIDTH;
  const height = EMAIL_LOGO_HEIGHT;
  return `<img src="${logoUrl}" alt="The Product Bus" width="${width}" height="${height}" border="0" style="display:block;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;width:${width}px;height:${height}px;max-width:100%;" />`;
}
