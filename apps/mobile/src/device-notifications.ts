import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { createDeviceNotifications } from './device-notifications-core';

export const enableMockNotifications = __DEV__ && process.env.EXPO_PUBLIC_ENABLE_MOCK_NOTIFICATIONS === '1';

Notifications.setNotificationHandler({
  handleNotification: async notification => {
    const ownMock = enableMockNotifications && notification.request.identifier === 'owoolmall-development-mock' &&
      notification.request.content.data?.kind === 'development-mock';
    return { shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: ownMock, shouldShowList: ownMock };
  },
});

export const deviceNotifications = createDeviceNotifications(Notifications, Platform.OS, enableMockNotifications);
