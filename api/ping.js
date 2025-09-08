export default async function handler(req, res){
  const ok = (req.headers['x-api-key'] || req.headers['X-API-Key']) === process.env.APP_PASSWORD;
  if(!ok){ return res.status(401).json({error:'unauthorized'}); }
  return res.status(200).json({ok:true, ts: Date.now()});
}