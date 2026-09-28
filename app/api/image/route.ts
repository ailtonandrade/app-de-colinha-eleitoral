import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get('url')

  if (!source) return new Response('URL obrigatória', { status: 400 })

  let target: URL
  try {
    target = new URL(source)
  } catch {
    return new Response('URL inválida', { status: 400 })
  }

  if (!['http:', 'https:'].includes(target.protocol)) {
    return new Response('Protocolo não permitido', { status: 400 })
  }

  try {
    const response = await fetch(target, { headers: { Accept: 'image/*' }, next: { revalidate: 86400 } })
    if (!response.ok) return new Response('Imagem indisponível', { status: response.status })

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.startsWith('image/')) return new Response('Recurso não é uma imagem', { status: 415 })

    return new Response(response.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch {
    return new Response('Não foi possível carregar a imagem', { status: 502 })
  }
}
