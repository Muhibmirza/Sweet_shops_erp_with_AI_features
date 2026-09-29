export type AssistantMessage = { role: 'user' | 'assistant'; text: string };

export interface AssistantStatus {
  configured: boolean;
  model: string;
  provider: 'groq';
  role: string;
  supportedLanguages: string[];
  readOnly?: boolean;
  canExecuteActions?: boolean;
}

export type AssistantAction =
  | { type: 'NAVIGATE'; path: string }
  | { type: 'ERP_MUTATION'; token: string; method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'; endpoint: string; label: string };

export interface AssistantPlan {
  reply: string;
  requiresConfirmation: boolean;
  action: AssistantAction | null;
}
