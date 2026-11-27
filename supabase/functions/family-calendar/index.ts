const allowedOrigin = "https://joel-plourde.github.io";
const headers = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Vary": "Origin",
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff"
};
const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });
Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (origin && origin !== allowedOrigin) return respond({error:"forbidden_origin"},403);
  if (req.method === "OPTIONS") return new Response(null,{status:204,headers});
  if (req.method !== "POST") return respond({error:"method"},405);
  try {
    const raw = await req.text();
    if (raw.length > 4096) return respond({error:"invalid_input"},400);
    const b = JSON.parse(raw);
    if (!b || typeof b.token !== "string" || !/^(?:[0-9a-f]{64}|[A-Za-z0-9_-]{22})$/.test(b.token))
      return respond({error:"invalid_invitation"},403);
    if (!["list","book","cancel"].includes(b.action))
      return respond({error:"invalid_input"},400);
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const url = Deno.env.get("SUPABASE_URL");
    if (!key || !url) return respond({error:"server_error"},500);
    const res = await fetch(url+"/rest/v1/rpc/family_calendar",{
      method:"POST",
      headers:{"apikey":key,"Authorization":"Bearer "+key,"Content-Type":"application/json"},
      body:JSON.stringify({p_token:b.token,p_action:b.action,p_payload:b.payload??{}})
    });
    if (!res.ok) return respond({error:"server_error"},500);
    const data = await res.json();
    if (data.error) return respond({error:data.error},data.status??400);
    return respond(data);
  } catch { return respond({error:"invalid_input"},400); }
});