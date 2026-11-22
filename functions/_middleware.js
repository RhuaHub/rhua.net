// www.rhua.net -> rhua.net 301，保留路径与查询参数
export async function onRequest(context) {
  const url = new URL(context.request.url)
  if (url.hostname.toLowerCase() === 'www.rhua.net') {
    url.hostname = 'rhua.net'
    return Response.redirect(url.toString(), 301)
  }
  return context.next()
}
