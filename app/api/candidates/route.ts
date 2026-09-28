import { NextResponse } from 'next/server'

const TSE_API = 'https://divulgacandcontas.tse.jus.br/divulga/rest/v1'
const officeCodes: Record<string, string> = {
  Presidente: '1',
  Governador: '3',
  Senador: '5',
  'Deputado federal': '6',
  'Deputado estadual': '7',
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const office = searchParams.get('office') || 'Presidente'
  const state = searchParams.get('state') || 'BR'
  const cargo = officeCodes[office]
  if (!cargo) return NextResponse.json({ error: 'Cargo inválido.' }, { status: 400 })

  const url = `${TSE_API}/candidatura/listar/2026/${state}/2040602026/${encodeURIComponent(cargo)}/candidatos`
  try {
    const response = await fetch(url, { next: { revalidate: 300 }, headers: { Accept: 'application/json' } })
    if (!response.ok) return NextResponse.json({ candidates: [], error: 'Dados do TSE indisponíveis no momento.' }, { status: 502 })
    const data = await response.json()
    const raw = Array.isArray(data) ? data : data.candidatos || data.candidates || []
    const candidates = raw.map((item: any) => ({
      id: String(item.id || item.sequencial || item.numero || item.nomeUrna),
      name: item.nomeUrna || item.nome || item.nomeCompleto,
      number: String(item.numero || item.numeroCandidato || ''),
      party: item.siglaPartido || item.partido?.sigla || item.partido || '',
      state: item.sgUf || item.uf || (state === 'BR' ? undefined : state),
      photo: item.foto || item.urlFoto || undefined,
    })).filter((candidate: any) => candidate.name && candidate.number)
    return NextResponse.json({ candidates })
  } catch {
    return NextResponse.json({ candidates: [], error: 'Não foi possível consultar o TSE.' }, { status: 502 })
  }
}
