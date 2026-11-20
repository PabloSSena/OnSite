// Keep this policy aligned with validGIFURL in server/main.go.
export function validGIFURL(value: string): boolean {
  if (value.length > 1500) return false
  try {
    const url = new URL(value)
    const hosts = ['media.tenor.com', 'media.giphy.com', 'i.giphy.com',
      'media0.giphy.com', 'media1.giphy.com', 'media2.giphy.com',
      'media3.giphy.com', 'media4.giphy.com', 'cdn.discordapp.com', 'media.discordapp.net']
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      !url.hash && hosts.includes(url.hostname) && url.pathname.toLowerCase().endsWith('.gif')
  } catch {
    return false
  }
}
