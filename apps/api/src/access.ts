export type ActiveRole = 'customer' | 'seller' | 'admin';

export type AccessContext = {
  accountId: string;
  role: ActiveRole;
  sellerId?: string;
};

export type AccessAction =
  | 'read-customer'
  | 'read-seller-order'
  | 'change-stock'
  | 'request-proposal'
  | 'approve-proposal'
  | 'manage-taxonomy'
  | 'decide-refund'
  | 'complete-settlement';

export type AccessResource = { customerId?: string; sellerId?: string };

/** Fail-closed action check. Callers must derive the context from a verified session. */
export function canAccess(
  actor: AccessContext | undefined,
  action: AccessAction,
  resource: AccessResource,
): boolean {
  if (!actor?.accountId) return false;

  switch (action) {
    case 'read-customer':
      return actor.role === 'customer' && !!resource.customerId && actor.accountId === resource.customerId;
    case 'read-seller-order':
    case 'change-stock':
    case 'request-proposal':
      return actor.role === 'seller' && !!resource.sellerId && !!actor.sellerId && actor.sellerId === resource.sellerId;
    case 'approve-proposal':
    case 'manage-taxonomy':
    case 'decide-refund':
    case 'complete-settlement':
      return actor.role === 'admin';
    default:
      return false;
  }
}

export function canApproveProposal(
  actor: AccessContext | undefined,
  proposal: { id: string; requestedBy: string },
): boolean {
  return !!proposal.id && !!proposal.requestedBy && canAccess(actor, 'approve-proposal', {});
}
