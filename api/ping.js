export default function handler(req, res){
  const clientKey = req.headers['x-api-key'] || req.headers['X-API-Key'] || req.headers['x-api-key'];
  const required = process.env.APP_PASSWORD || '';
  if(required && clientKey !== required){
    res.status(401).json({ ok:false, error:'unauthorized' });
    return;
  }
  res.status(200).json({ ok:true });
}