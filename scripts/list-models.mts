import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const apiKey = process.env.GOOGLE_API_KEY;

const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
const res = await fetch(url);
const data = await res.json();

console.log(data);