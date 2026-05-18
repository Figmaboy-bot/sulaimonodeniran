export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  var country = req.headers['x-vercel-ip-country'] || null;
  return res.status(200).json({ country: country });
}
