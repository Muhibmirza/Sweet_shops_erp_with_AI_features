export type AssistantMessage = { role: 'user' | 'assistant'; text: string };

export interface AssistantStatus {
  configured: boolean;
  model: string;
  provider: 'groq';
  role: string;
  supportedLanguages: string[];
}

export type AssistantAction = { type: 'NAVIGATE'; path: string };

export interface AssistantPlan {
  reply: string;
  requiresConfirmation: boolean;
  action: AssistantAction | null;
}
