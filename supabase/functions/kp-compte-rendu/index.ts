// Kaporo — rédaction du compte rendu de réunion par Claude.
// Secret à définir côté Supabase (Edge Functions → Secrets) : ANTHROPIC_API_KEY.
// Déploiement : via Claude Code (MCP Supabase) ou `supabase functions deploy kp-compte-rendu`.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const SYSTEM = `Tu es le secrétaire de séance de Kaporo, l'espace de travail des programmes immobiliers Kaporo 1 et Kaporo 2 à Conakry (promoteur, architecte, pilotage de programme, relations institutionnelles).
On te donne le cadrage d'une réunion et les contributions écrites par les participants pendant la séance (notes, idées, décisions, actions, questions). Rédige en français un compte rendu professionnel, fidèle et utile, prêt à être envoyé aux participants et à une banque ou un partenaire.

Règles :
- N'invente rien : reformule, regroupe et clarifie ce qui a été écrit ; si un point est flou, dis-le dans « Points ouverts ».
- Attribue les décisions et actions aux bonnes personnes ; conserve les échéances données.
- Style clair, phrases courtes, vocabulaire du montage immobilier (foncier, études, permis, VEFA, financement).
- Réponds UNIQUEMENT avec du HTML simple sans balise <html> ni <body> : <h1> pour le titre, <h2> pour les sections, <p>, <ul>/<li>, et un <table> pour les actions (colonnes Action, Responsable, Échéance). Pas de CSS, pas de Markdown.

Structure attendue :
<h1>Compte rendu — [titre]</h1>, une ligne de contexte (projet, date, type, lieu, durée), puis les sections : Participants · Objet et objectifs · Points abordés (synthèse par point de l'ordre du jour) · Décisions · Actions (tableau) · Idées à creuser · Points ouverts · Prochaines étapes.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
  try {
    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) return json({ error: "CLE_MANQUANTE" }, 503);
    const auth = req.headers.get("Authorization") || "";
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: me } = await sb.auth.getUser();
    if (!me?.user) return json({ error: "NON_AUTHENTIFIE" }, 401);
    const { meeting_id } = await req.json();
    const { data: m, error } = await sb.from("kp_meetings").select("*").eq("id", meeting_id).single();
    if (error || !m) return json({ error: "REUNION_INTROUVABLE" }, 404);
    const [{ data: notes }, { data: membres }, projet] = await Promise.all([
      sb.from("kp_meeting_notes").select("*").eq("meeting_id", meeting_id).order("created_at"),
      sb.from("kp_members").select("user_id,name,role,responsibilities"),
      m.project_id ? sb.from("kp_projects").select("name").eq("id", m.project_id).single() : Promise.resolve({ data: null }),
    ]);
    const fiche = (id: string | null) => (membres || []).find((x: { user_id: string }) => x.user_id === id);
    const nom = (id: string | null) => fiche(id)?.name || "Membre";
    const payload = {
      titre: m.title, projet: projet?.data?.name || "Général", type: m.kind, date: m.starts_at, debut_reel: m.started_at, fin_reelle: m.ended_at, duree_prevue_min: m.duration_min,
      lieu: m.location, lien_visio: m.link, objectifs: m.objectives, ordre_du_jour: m.agenda, invites_externes: m.externals,
      participants: (m.participants || []).map((id: string) => ({ nom: nom(id), role: fiche(id)?.role, responsabilites: fiche(id)?.responsibilities })),
      contributions: (notes || []).map((n: Record<string, unknown>) => ({ type: n.kind, auteur: nom(n.author as string), texte: n.text, responsable: n.assignee ? nom(n.assignee as string) : null, echeance: n.due_on, heure: n.created_at })),
      redige_par: nom(me.user.id),
    };
    const client = new Anthropic({ apiKey: key });
    const resp = await client.beta.messages.create({
      model: "claude-opus-5-5", max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      system: SYSTEM,
      messages: [{ role: "user", content: "Voici les données de la réunion (JSON). Rédige le compte rendu.\n\n" + JSON.stringify(payload, null, 1) }],
    } as never);
    if ((resp as { stop_reason?: string }).stop_reason === "refusal") return json({ error: "REFUS" }, 422);
    const html = (resp.content as Array<{ type: string; text?: string }>).filter(b => b.type === "text").map(b => b.text || "").join("").replace(/^```html\s*/i, "").replace(/```\s*$/, "").trim();
    return json({ html, usage: resp.usage });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
