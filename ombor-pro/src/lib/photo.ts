// Rasmni yuklashdan oldin kichraytiradi (eng katta tomoni 800 px, JPEG 80%)
export async function shrinkPhoto(file: File, max = 800): Promise<Blob> {
  const img = await createImageBitmap(file)
  const k = Math.min(1, max / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  return await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.8))
}
