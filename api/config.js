// api/config.js — devuelve las variables públicas de Supabase al frontend
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json({
    SUPABASE_URL:      process.env.SUPABASE_URL      || '',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
  });
}
