// Passerelle sécurisée vers l'API Claude : la clé reste côté serveur (variable ANTHROPIC_API_KEY).
// Seuls les utilisateurs connectés à Supabase peuvent l'appeler, avec des limites d'usage.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://titavnkvrzamvukkbyfk.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpdGF2bmt2cnphbXZ1a2tieWZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyODExOTYsImV4cCI6MjEwNDg1NzE5Nn0.CZ1qfD6nEfB0XYyZcsiitpffNzg05nr2F9J_rbhCBWE';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const LIMIT = 30;              // requêtes par utilisateur
const WINDOW_MS = 10 * 60 * 1000; // sur 10 minutes
const hits = new Map();

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Assistant non configuré (clé absente côté serveur)' });

  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Connexion requise' });

  let user;
  try {
    const r = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token } });
    if (!r.ok) return res.status(401).json({ error: 'Session invalide' });
    user = await r.json();
  } catch (e) {
    return res.status(502).json({ error: 'Vérification de session impossible' });
  }
  if (!user || !user.id) return res.status(401).json({ error: 'Session invalide' });

  const now = Date.now();
  const recent = (hits.get(user.id) || []).filter(t => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) return res.status(429).json({ error: 'Trop de demandes, réessayez dans quelques minutes' });
  recent.push(now);
  hits.set(user.id, recent);

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Requête invalide' });

  const system = String(body.system || '').slice(0, 6000);
  const messages = (Array.isArray(body.messages) ? body.messages : []).slice(-6)
    .map(m => ({ role: m && m.role === 'assistant' ? 'assistant' : 'user', content: String((m && m.content) || '').slice(0, 2000) }))
    .filter(m => m.content);
  if (!messages.length) return res.status(400).json({ error: 'Message vide' });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: Math.min(Number(body.max_tokens) || 300, 500), system, messages })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ error: 'Assistant indisponible (' + r.status + ')' });
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({ error: 'Assistant indisponible' });
  }
};
