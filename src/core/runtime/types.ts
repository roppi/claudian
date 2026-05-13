import type { BrowserSelectionContext } from '../../utils/browser';
import type { CanvasSelectionContext } from '../../utils/canvas';
import type { EditorSelectionContext } from '../../utils/editor';
import type {
  ApprovalDecision,
  Conversation,
  ExitPlanModeCallback,
  ImageAttachment,
  StreamChunk,
} from '../types';

export interface ApprovalDecisionOption {
  label: string;
  description?: string;
  value: string;
  decision?: ApprovalDecision;
}

export interface ApprovalNetworkContext {
  host: string;
  protocol: string;
}

export interface ApprovalCallbackOptions {
  decisionReason?: string;
  blockedPath?: string;
  agentID?: string;
  decisionOptions?: ApprovalDecisionOption[];
  networkApprovalContext?: ApprovalNetworkContext;
  additionalPermissions?: unknown;
}

export type ApprovalCallback = (
  toolName: string,
  input: Record<string, unknown>,
  description: string,
  options?: ApprovalCallbackOptions,
) => Promise<ApprovalDecision>;

export type AskUserQuestionCallback = (
  input: Record<string, unknown>,
  signal?: AbortSignal,
) => Promise<Record<string, string | string[]> | null>;

export interface ChatTurnRequest {
  text: string;
  images?: ImageAttachment[];
  currentNotePath?: string;
  editorSelection?: EditorSelectionContext | null;
  browserSelection?: BrowserSelectionContext | null;
  canvasSelection?: CanvasSelectionContext | null;
  externalContextPaths?: string[];
  enabledMcpServers?: Set<string>;
}

export interface PreparedChatTurn {
  request: ChatTurnRequest;
  persistedContent: string;
  prompt: string;
  isCompact: boolean;
  mcpMentions: Set<string>;
}

export interface ChatRuntimeQueryOptions {
  allowedTools?: string[];
  model?: string;
  mcpMentions?: Set<string>;
  enabledMcpServers?: Set<string>;
  forceColdStart?: boolean;
  externalContextPaths?: string[];
}

export interface ChatRuntimeEnsureReadyOptions {
  allowSessionCreation?: boolean;
  force?: boolean;
}

export type ChatRuntimeConversationState = Pick<
  Conversation,
  'sessionId' | 'providerState'
>;

export interface SessionUpdateResult {
  updates: Partial<Conversation>;
}

export interface ChatRewindResult {
  canRewind: boolean;
  error?: string;
  filesChanged?: string[];
  insertions?: number;
  deletions?: number;
}

export interface SubagentRuntimeState {
  hasRunning: boolean;
}

export interface ChatTurnMetadata {
  userMessageId?: string;
  assistantMessageId?: string;
  wasSent?: boolean;
  planCompleted?: boolean;
}

export interface AutoTurnResult {
  chunks: StreamChunk[];
  metadata: ChatTurnMetadata;
}

export type AutoTurnCallback = (result: AutoTurnResult) => void | Promise<void>;

/**
 * Fired the moment the runtime first learns the SDK session id for a turn
 * (e.g. Claude's `session_init` event). Lets feature code that depends on
 * a known session id — like the daily-journal appender, which needs the
 * jsonl path that's only derivable from the session id — wake up at the
 * earliest valid point instead of waiting for the next save round-trip.
 *
 * Providers without a comparable signal can leave this as a no-op.
 */
export type SessionIdResolvedCallback = (sessionId: string) => void | Promise<void>;

export type {
  ApprovalDecision,
  ExitPlanModeCallback,
};
