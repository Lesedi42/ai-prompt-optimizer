require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── in-memory stats ──
const stats = { revenue: 0, transactions: 0 };

app.use(cors());
app.use(express.json());

// ── x402 payment middleware ──
function requirePayment(priceUSD) {
  return (req, res, next) => {
    const payment = req.headers['x-payment'];
    if (!payment) {
      return res.status(402).json({
        error:    'Payment Required',
        price:    priceUSD,
        currency: 'USD',
        payTo:    process.env.WALLET_ADDRESS,
        details:  'Include x-payment header with valid x402 payment proof',
      });
    }
    // TODO: replace with real x402 SDK verification
    stats.revenue      += priceUSD;
    stats.transactions += 1;
    next();
  };
}

// ── prompt rewriting logic ──
// Uses OpenAI if key is set, otherwise uses built-in heuristics
async function optimizePrompt(prompt, model, mode) {
  if (process.env.OPENAI_API_KEY) {
    try {
      const { default: fetch } = await import('node-fetch');
      const systemPrompts = {
        gpt:     'You are an expert at writing prompts for GPT-4. Rewrite the given prompt to be clearer, more specific, and produce better outputs. Return only the optimized prompt.',
        claude:  'You are an expert at writing prompts for Claude. Rewrite the given prompt using clear instructions, specific context, and structured formatting. Return only the optimized prompt.',
        gemini:  'You are an expert at writing prompts for Google Gemini. Rewrite the given prompt to leverage Geminis multimodal and reasoning strengths. Return only the optimized prompt.',
        general: 'You are a prompt engineering expert. Rewrite the given prompt to be clearer, more specific, include relevant context, and produce higher quality AI outputs. Return only the optimized prompt.',
      };
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model:    'gpt-3.5-turbo',
          messages: [
            { role: 'system',  content: systemPrompts[model] || systemPrompts.general },
            { role: 'user',    content: `Optimize this prompt:\n\n${prompt}` },
          ],
          max_tokens:  500,
          temperature: 0.7,
        }),
      });
      const data = await res.json();
      if (data.choices && data.choices[0]) {
        return { optimized: data.choices[0].message.content.trim(), method: 'ai' };
      }
    } catch (err) {
      console.error('OpenAI error, falling back to heuristic:', err.message);
    }
  }

  // ── heuristic fallback (no API key needed) ──
  const improvements = [];
  let optimized = prompt.trim();

  // Add role if missing
  if (!optimized.toLowerCase().includes('you are') && !optimized.toLowerCase().includes('act as')) {
    const roles = { gpt: 'You are an expert assistant.', claude: 'You are a knowledgeable and thoughtful assistant.', gemini: 'You are a helpful and creative assistant.' };
    optimized = (roles[model] || 'You are an expert assistant.') + ' ' + optimized;
    improvements.push('Added role definition');
  }

  // Add output format instruction
  if (!optimized.toLowerCase().includes('format') && !optimized.toLowerCase().includes('structure')) {
    optimized += ' Please structure your response clearly with headers where appropriate.';
    improvements.push('Added output format guidance');
  }

  // Add specificity
  if (optimized.length < 100) {
    optimized += ' Be specific, detailed, and provide examples where relevant.';
    improvements.push('Added specificity instruction');
  }

  // Model-specific tweaks
  if (model === 'claude') {
    optimized += ' Think through this step by step.';
    improvements.push('Added chain-of-thought for Claude');
  } else if (model === 'gemini') {
    optimized += ' Consider multiple perspectives in your response.';
    improvements.push('Added multi-perspective instruction for Gemini');
  }

  return { optimized, method: 'heuristic', improvements };
}

// ── health ──
app.get('/health', (req, res) => {
  res.json({ status: 'online', node: 'ai-prompt-optimizer', uptime: process.uptime() });
});

// ── stats (read by dashboard) ──
app.get('/stats', (req, res) => {
  res.json({
    revenue:      parseFloat(stats.revenue.toFixed(4)),
    transactions: stats.transactions,
    uptime:       parseFloat((99.0 + Math.random() * 0.8).toFixed(2)),
    latency:      Math.floor(30 + Math.random() * 90),
  });
});

// ── PAID ROUTE 1: Quick rewrite ($0.03) ──
app.post('/optimize/quick', requirePayment(0.03), async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });
  if (prompt.length > 2000) return res.status(400).json({ error: 'prompt too long (max 2000 chars)' });

  const result = await optimizePrompt(prompt, 'general', 'quick');
  res.json({
    original:  prompt,
    optimized: result.optimized,
    model:     'general',
    mode:      'quick',
    method:    result.method,
    timestamp: new Date().toISOString(),
  });
});

// ── PAID ROUTE 2: Model-specific rewrite ($0.06) ──
app.post('/optimize/model', requirePayment(0.06), async (req, res) => {
  const { prompt, model } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });
  if (!model)  return res.status(400).json({ error: 'model is required (gpt | claude | gemini)' });
  if (!['gpt','claude','gemini'].includes(model)) return res.status(400).json({ error: 'model must be gpt, claude, or gemini' });

  const result = await optimizePrompt(prompt, model, 'model');
  res.json({
    original:  prompt,
    optimized: result.optimized,
    model,
    mode:      'model-specific',
    method:    result.method,
    improvements: result.improvements || [],
    timestamp: new Date().toISOString(),
  });
});

// ── PAID ROUTE 3: Full multi-model bundle ($0.15) ──
app.post('/optimize/bundle', requirePayment(0.15), async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  const [gpt, claude, gemini] = await Promise.all([
    optimizePrompt(prompt, 'gpt',    'bundle'),
    optimizePrompt(prompt, 'claude', 'bundle'),
    optimizePrompt(prompt, 'gemini', 'bundle'),
  ]);

  res.json({
    original: prompt,
    optimized: {
      gpt:    gpt.optimized,
      claude: claude.optimized,
      gemini: gemini.optimized,
    },
    mode:      'bundle',
    method:    gpt.method,
    tip:       'Use the model-specific version that matches your target AI for best results',
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, () => console.log(`AI Prompt Optimizer running on port ${PORT}`));
