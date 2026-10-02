import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();
const jwtkey=process.env.jwtkey;

export default async function verifytoken(req,res,next){
    const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ message: 'Access denied. No token provided.' });

  try {
    const decoded = jwt.verify(token,jwtkey);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Invalid or expired token.' });
  }
}