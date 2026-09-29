import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import prisma from '../utils/prisma';
import { localHelpAnswer, localRouteFromText } from '../ai/erpKnowledge';
import { aiStatus, askErpAssistant, interpretErpDataQuestion, isLikelyLiveDataQuestion } from '../services/aiAssistant';
import { queryErpData } from '../services/erpDataAssistant';

const router = Router();
router.use(authenticate);

const logConversation = async (userId: string, prompt: string, reply: string, source: string) => {
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'AI_CONVERSATION',
      tableName: 'AssistantConversation',
      recordId: `${source}-${Date.now()}`,
      newData: JSON.stringify({ source, prompt: prompt.slice(0, 2000), reply: reply.slice(0, 6000) })
    }
  }).catch(() => undefined);
};

async function answerWithLiveData(messages: Array<{ role: 'user' | 'assistant'; text: string }>, user: { id: string; role: string }, currentPath: string) {
  const latest = messages[messages.length - 1]?.text || '';
  let liveData: unknown;
  let liveDataUsed = false;
  if (isLikelyLiveDataQuestion(latest)) {
    const plan = await interpretErpDataQuestion(latest, { role: user.role, currentPath });
    if (plan.intent !== 'NONE') {
      liveData = await queryErpData(plan, user);
      liveDataUsed = true;
    }
  }
  const reply = await askErpAssistant(messages, { role: user.role, currentPath, liveData });
  return { reply, liveDataUsed };
}

router.get('/status', (req: any, res) => {
  res.json({ success: true, data: { ...aiStatus(), role: req.user.role, supportedLanguages: ['ur-PK', 'hi-IN', 'en-PK'], readOnly: true } });
});

router.post('/chat', async (req: any, res) => {
  try {
    const messages = Array.isArray(req.body.messages) ? req.body.messages : [];
    const clean = messages
      .filter((message: any) => ['user', 'assistant'].includes(message?.role) && typeof message?.text === 'string')
      .slice(-12)
      .map((message: any) => ({ role: message.role, text: message.text.slice(0, 2000) }));
    if (!clean.length) return res.status(400).json({ success: false, message: 'Message is required' });
    const prompt = clean[clean.length - 1].text;
    const configured = aiStatus().configured;
    const result = configured
      ? await answerWithLiveData(clean, req.user, String(req.body.currentPath || ''))
      : { reply: localHelpAnswer(prompt, req.user.role), liveDataUsed: false };
    await logConversation(req.user.id, prompt, result.reply, 'chat');
    res.json({ success: true, data: { ...result, configured } });
  } catch (error: any) {
    res.status(error?.status || 500).json({ success: false, message: error?.message || 'AI assistant could not respond' });
  }
});

router.post('/command', async (req: any, res) => {
  try {
    const text = String(req.body.text || '').trim();
    if (!text || text.length > 2000) return res.status(400).json({ success: false, message: 'A valid ERP question is required' });
    const route = localRouteFromText(text, req.user.role);
    if (route && /open|khol|kholo|jao|show|dikha|le chalo|کھول|دکھا/i.test(text)) {
      const reply = `${route.path} khol raha hoon.`;
      await logConversation(req.user.id, text, reply, 'agent');
      return res.json({ success: true, data: { reply, requiresConfirmation: false, action: { type: 'NAVIGATE', path: route.path } } });
    }
    const configured = aiStatus().configured;
    const result = configured
      ? await answerWithLiveData([{ role: 'user', text }], req.user, String(req.body.currentPath || ''))
      : { reply: localHelpAnswer(text, req.user.role), liveDataUsed: false };
    const reply = `${result.reply}\n\nNote: AI Agent read-only hai; data create, edit ya delete nahi karta.`;
    await logConversation(req.user.id, text, reply, 'agent');
    res.json({ success: true, data: { reply, liveDataUsed: result.liveDataUsed, requiresConfirmation: false, action: null } });
  } catch (error: any) {
    res.status(error?.status || 500).json({ success: false, message: error?.message || 'AI agent could not respond' });
  }
});

export default router;
