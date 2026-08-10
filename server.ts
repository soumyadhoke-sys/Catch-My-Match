import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini Client server-side
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('GEMINI_API_KEY environment variable is missing.');
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });
};

// API Endpoint 1: Match AI Tactical Analysis & Live Commentary Generator
app.post('/api/gemini/analyze-match', async (req, res) => {
  try {
    const { homeTeam, awayTeam, homeScore, awayScore, sport, league, status, minute, events, stats } = req.body;

    const ai = getGeminiClient();
    if (!ai) {
      return res.status(500).json({
        error: 'Gemini API Key is not configured in environment variables.'
      });
    }

    const prompt = `You are an elite live sports tactical analyst and broadcast commentator.
Analyze this live/completed match:
- Sport / League: ${sport} (${league})
- Teams: ${homeTeam} vs ${awayTeam}
- Current Score: ${homeTeam} ${homeScore} - ${awayScore} ${awayTeam}
- Status / Clock: ${status} (${minute || 'N/A'})
- Recent Events: ${JSON.stringify(events || [])}
- Match Statistics: ${JSON.stringify(stats || {})}

Provide a structured analysis in concise, engaging sports journalism style:
1. Tactical Breakdown (2-3 punchy bullet points on who dominates and key gameplan highlights)
2. Live Momentum & Key Turning Point
3. Win/Draw Odds Prediction or Outcome Evaluation
4. One bold line of live commentary for the current match state.

Keep it direct, exciting, and highly informative without fluff.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
      config: {
        temperature: 0.7,
        systemInstruction: 'You are a concise, sharp sports tactical analyst for top global leagues.'
      }
    });

    res.json({
      analysis: response.text || 'Match analysis unavailable.'
    });
  } catch (err: any) {
    console.error('Error in /api/gemini/analyze-match:', err);
    res.status(500).json({
      error: 'Failed to generate AI match analysis.',
      details: err.message
    });
  }
});

// API Endpoint 2: Ask Gemini Sports Assistant
app.post('/api/gemini/ask-sports', async (req, res) => {
  try {
    const { query, favoriteTeams, currentLeague } = req.body;

    const ai = getGeminiClient();
    if (!ai) {
      return res.status(500).json({
        error: 'Gemini API Key is not configured.'
      });
    }

    const prompt = `The user asks a sports question: "${query}".
User Context:
- Favorite Teams: ${favoriteTeams?.join(', ') || 'None specified'}
- Currently viewing league: ${currentLeague || 'All leagues'}

Provide a well-structured, knowledgeable answer with key stats, historical context, tactical insight, or head-to-head comparisons as appropriate. Use clean formatting and bullet points where helpful.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
      config: {
        temperature: 0.6
      }
    });

    res.json({
      answer: response.text || 'Unable to fetch response.'
    });
  } catch (err: any) {
    console.error('Error in /api/gemini/ask-sports:', err);
    res.status(500).json({
      error: 'Failed to complete sports query.',
      details: err.message
    });
  }
});

// API Endpoint 4: Low-Latency Quick Sports Answers (gemini-3.1-flash-lite)
app.post('/api/gemini/fast-response', async (req, res) => {
  try {
    const { query, context } = req.body;

    const ai = getGeminiClient();
    if (!ai) {
      return res.status(500).json({ error: 'Gemini API Key is missing.' });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: `Quick sports check: ${query}. Context: ${context || 'Live Match'}. Keep response under 50 words, ultra-fast and direct.`,
      config: {
        maxOutputTokens: 150,
        temperature: 0.3
      }
    });

    res.json({
      answer: response.text || 'No quick answer available.'
    });
  } catch (err: any) {
    console.error('Error in /api/gemini/fast-response:', err);
    // Fallback to gemini-2.5-flash if lite model variant is unavailable
    try {
      const ai = getGeminiClient();
      if (ai) {
        const fallback = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: `Quick sports check: ${req.body.query}. Keep under 40 words.`,
          config: { maxOutputTokens: 120 }
        });
        return res.json({ answer: fallback.text || 'Quick stat computed.' });
      }
    } catch (fbErr) {
      // ignore
    }
    res.status(500).json({ error: 'Failed to generate low-latency response.', details: err.message });
  }
});

// API Endpoint 5: Audio Transcription (gemini-3.5-flash)
app.post('/api/gemini/transcribe-audio', async (req, res) => {
  try {
    const { audioBase64, mimeType } = req.body;

    if (!audioBase64) {
      return res.status(400).json({ error: 'audioBase64 string is required.' });
    }

    const ai = getGeminiClient();
    if (!ai) {
      return res.status(500).json({ error: 'Gemini API Key is missing.' });
    }

    const cleanBase64 = audioBase64.replace(/^data:audio\/[a-z0-9]+;base64,/, '');

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: [
        {
          inlineData: {
            mimeType: mimeType || 'audio/webm',
            data: cleanBase64
          }
        },
        {
          text: 'Accurately transcribe this user spoken sports audio. Output ONLY JSON with keys: "transcript" (exact spoken words) and "summary" (a concise 1-sentence sports summary).'
        }
      ],
      config: {
        responseMimeType: 'application/json'
      }
    });

    const parsed = JSON.parse(response.text || '{}');
    res.json({
      transcript: parsed.transcript || response.text,
      summary: parsed.summary || 'Audio transcribed successfully.'
    });
  } catch (err: any) {
    console.error('Error in /api/gemini/transcribe-audio:', err);
    res.status(500).json({ error: 'Failed to transcribe audio.', details: err.message });
  }
});

// API Endpoint 6: Live Voice Conversation (gemini-3.1-flash-live-preview)
app.post('/api/gemini/voice-conversation', async (req, res) => {
  try {
    const { userMessage, conversationHistory } = req.body;

    const ai = getGeminiClient();
    if (!ai) {
      return res.status(500).json({ error: 'Gemini API key missing.' });
    }

    const systemInstruction = `You are a charismatic, real-time live sports radio broadcaster and conversational AI analyst. 
Speak naturally, enthusiastically, and like a live sports commentator. Keep responses short (2-3 spoken sentences max) so they flow naturally in a live voice conversation.`;

    const prompt = `Conversation history: ${JSON.stringify(conversationHistory || [])}
User spoken input: "${userMessage}"

Respond as a live voice sports commentator.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-live-preview',
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.7,
        maxOutputTokens: 200
      }
    });

    res.json({
      reply: response.text || 'Copy that, listening to your next command!'
    });
  } catch (err: any) {
    console.error('Error in /api/gemini/voice-conversation:', err);
    // Fallback if model alias varies
    try {
      const ai = getGeminiClient();
      if (ai) {
        const fallback = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: `As a live sports broadcaster, briefly answer: "${req.body.userMessage}" in 2 sentences.`,
          config: { maxOutputTokens: 150 }
        });
        return res.json({ reply: fallback.text });
      }
    } catch (e) {}
    res.status(500).json({ error: 'Failed to process voice conversation.', details: err.message });
  }
});

async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Live Sports Tracker server listening on http://0.0.0.0:${PORT}`);
  });
}

start();
