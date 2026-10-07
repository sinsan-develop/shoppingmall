export type NotificationChannelInput = {
  verifiedEmail: boolean;
  verifiedPhone: boolean;
  pushConsent: boolean;
  registeredDevice: boolean;
};

export type NotificationChannelPlan = {
  primary: 'email' | 'sms' | null;
  push: boolean;
};

/** Marketing choices do not gate requested restock or order-status notices. */
export function planNotificationChannels(candidate: unknown): NotificationChannelPlan {
  const input = candidate as Partial<NotificationChannelInput> | null;
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      typeof input.verifiedEmail !== 'boolean' || typeof input.verifiedPhone !== 'boolean' ||
      typeof input.pushConsent !== 'boolean' || typeof input.registeredDevice !== 'boolean') {
    throw new Error('Invalid notification channels');
  }
  return {
    primary: input.verifiedEmail ? 'email' : input.verifiedPhone ? 'sms' : null,
    push: input.pushConsent && input.registeredDevice,
  };
}
