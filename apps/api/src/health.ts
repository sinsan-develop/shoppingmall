export function healthPayload(): { status: string; service: string } {
  return { status: 'ok', service: 'shoppingmall-api' };
}
