const express = require('express');
const admin = require('firebase-admin');
const app = express();

app.use(express.json());

//admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    })
  });
}

const db = admin.firestore();

//tokens diarios
async function checkLimitAndAuth(req, res, next, actionType) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No autorizado. Inicia sesión.' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;

    
    if (decodedToken.email === 'admin1@al-x.com' || decodedToken.name === 'admin1') {
      return next(); 
    }

    // Control de límites diarios
    const today = new Date().toISOString().split('T')[0];
    const limitRef = db.collection('daily_limits').doc(`${req.user.uid}_${today}`);
    const doc = await limitRef.get();

    let limits = doc.exists ? doc.data() : { summariesCount: 0, quizzesCount: 0, chatsCount: 0 };

    const limitsMax = {
      summaries: 1, 
      quizzes: 3,   
      chats: 5      
    };

    if (actionType === 'summarize' && limits.summariesCount >= limitsMax.summaries) {
      return res.status(429).json({ error: 'Has alcanzado el límite diario de 1 resumen de PDF por hoy.' });
    }
    if (actionType === 'quiz' && limits.quizzesCount >= limitsMax.quizzes) {
      return res.status(429).json({ error: 'Has alcanzado el límite diario de 3 quizzes por hoy.' });
    }
    if (actionType === 'chat' && limits.chatsCount >= limitsMax.chats) {
      return res.status(429).json({ error: 'Has alcanzado el límite diario de 5 preguntas en el chatbot.' });
    }

    // Actualizar contador
    limits[actionType + 'Count'] = (limits[actionType + 'Count'] || 0) + 1;
    await limitRef.set({ uid: req.user.uid, date: today, ...limits }, { merge: true });

    next();
  } catch (error) {
    res.status(403).json({ error: 'Token inválido o error en el servidor', details: error.message });
  }
}

// para resuemnenn
app.post('/api/summarize', (req, res) => checkLimitAndAuth(req, res, async () => {
  const { text } = req.body;
  const apiKey = process.env.AL_X_API_KEY_1;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: `Haz un resumen académico estructurado de esto: ${text}` }] }] })
  });
  const data = await response.json();
  res.json(data);
}, 'summarize'));

// chat bottt
app.post('/api/chat', (req, res) => checkLimitAndAuth(req, res, async () => {
  const { prompt } = req.body;
  const apiKey = process.env.AL_X_API_KEY_2;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: `Eres el tutor de AL-X. Responde de forma educativa: ${prompt}` }] }] })
  });
  const data = await response.json();
  res.json(data);
}, 'chat'));

// generacion de quizes3key
app.post('/api/quiz', (req, res) => checkLimitAndAuth(req, res, async () => {
  const { topic } = req.body;
  const apiKey = process.env.AL_X_API_KEY_3;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: `Genera 3 preguntas de opción múltiple con respuestas sobre: ${topic}` }] }] })
  });
  const data = await response.json();
  res.json(data);
}, 'quiz'));

module.exports = app;
