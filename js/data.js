// Carrega o conteúdo de data/indices.json (índices + fenômenos).
export async function loadData() {
  const resp = await fetch('data/indices.json');
  if (!resp.ok) throw new Error(`Falha ao carregar indices.json (${resp.status})`);
  const data = await resp.json();
  const byId = {};
  for (const f of data.fenomenos) byId[f.id] = { ...f, tipo: 'fenomeno' };
  for (const i of data.indices) byId[i.id] = { ...i, tipo: 'indice' };
  return { ...data, byId };
}
