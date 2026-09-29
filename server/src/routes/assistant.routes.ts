import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import prisma from '../utils/prisma';
import { localHelpAnswer, localRouteFromText } from '../ai/erpKnowledge';
import { aiStatus, askErpAssistant, interpretErpDataQuestion, isLikelyLiveDataQuestion } from '../services/aiAssistant';
import { queryErpData } from '../services/erpDataAssistant';
import { executeErpAction, interpretErpMutation, signErpAction } from '../services/erpActionAssistant';

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
  res.json({ success: true, data: { ...aiStatus(), role: req.user.role, supportedLanguages: ['ur-PK', 'hi-IN', 'en-PK'], readOnly: false, canExecuteActions: true } });
});

const isDirectMutationCommand = (text: string) => {
  if (/\b(how|how do|how to|kaise|kese|kis tarah|method|steps?|samjha|batao ke)\b/i.test(text)) return false;
  return /\b(create|add|insert|record|make|edit|update|change|rename|delete|remove|deactivate|activate|complete|cancel|approve|reject|pay|transfer|adjust|generate|sell|sale karo|bana(?:o|do)?|bna(?:o|do)?|dalo|lagao|hata(?:o|do)?|badal(?:o|do)?|karo|kardo|krdo|kro|entry karo|mark karo)\b/i.test(text);
};

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
    if (configured && isDirectMutationCommand(text)) {
      const plan = await interpretErpMutation(text, { userId: req.user.id, role: req.user.role, currentPath: String(req.body.currentPath || '') });
      if (plan.action === 'EXECUTE') {
        const actionToken = signErpAction(plan, req.user.id);
        const reply = `${plan.summary}\n\nConfirm karein to main yeh ERP action abhi perform kar doon.`;
        await logConversation(req.user.id, text, reply, 'agent-plan');
        return res.json({ success: true, data: { reply, requiresConfirmation: true, action: { type: 'ERP_MUTATION', token: actionToken, method: plan.method, endpoint: plan.endpoint, label: plan.summary } } });
      }
      await logConversation(req.user.id, text, plan.summary, 'agent-plan');
      return res.json({ success: true, data: { reply: plan.summary, requiresConfirmation: false, action: null } });
    }
    const result = configured
      ? await answerWithLiveData([{ role: 'user', text }], req.user, String(req.body.currentPath || ''))
      : { reply: localHelpAnswer(text, req.user.role), liveDataUsed: false };
    const reply = result.reply;
    await logConversation(req.user.id, text, reply, 'agent');
    res.json({ success: true, data: { reply, liveDataUsed: result.liveDataUsed, requiresConfirmation: false, action: null } });
  } catch (error: any) {
    res.status(error?.status || 500).json({ success: false, message: error?.message || 'AI agent could not respond' });
  }
});

router.post('/execute', async (req: any, res) => {
  try {
    const token = String(req.body.token || '');
    if (!token) return res.status(400).json({ success: false, message: 'Confirmed AI action token is required' });
    const result = await executeErpAction(token, req.user.id, String(req.headers.authorization || ''));
    const record = result.payload?.data;
    const recordLabel = record?.name || record?.orderNo || record?.invoiceNo || record?.id || '';
    const reply = `${result.plan.summary} complete ho gaya${recordLabel ? `: ${recordLabel}` : '.'}`;
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'AI_ACTION',
        tableName: 'AssistantAction',
        recordId: String(record?.id || `agent-${Date.now()}`),
        newData: JSON.stringify({ method: result.plan.method, endpoint: result.plan.endpoint, summary: result.plan.summary, result: recordLabel })
      }
    }).catch(() => undefined);
    await logConversation(req.user.id, result.plan.summary, reply, 'agent-execute');
    res.json({ success: true, data: { reply, result: result.payload?.data || result.payload, requiresConfirmation: false, action: null } });
  } catch (error: any) {
    res.status(error?.status || 500).json({ success: false, message: error?.message || 'AI agent action could not be completed' });
  }
});

export default router;
