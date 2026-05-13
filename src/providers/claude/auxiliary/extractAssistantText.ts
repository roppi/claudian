// `message` is typed as `unknown` because the SDK's `SDKMessage` union now
// includes shapes like `SDKPermissionDeniedMessage` where `message` is a
// `string`. Narrow inside the function so callers can pass any union member
// without an unsafe cast at the call site.
export function extractAssistantText(
  message: { type: string; message?: unknown }
): string {
  if (message.type !== 'assistant') {
    return '';
  }
  const inner = message.message;
  if (!inner || typeof inner !== 'object') {
    return '';
  }
  const content = (inner as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .filter((block): block is { type: 'text'; text: string } =>
      !!block &&
      typeof block === 'object' &&
      'type' in block &&
      'text' in block &&
      block.type === 'text' &&
      typeof block.text === 'string'
    )
    .map((block) => block.text)
    .join('');
}
