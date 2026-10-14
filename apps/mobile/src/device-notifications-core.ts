export type DevicePermission = 'undetermined' | 'granted' | 'denied' | 'blocked' | 'unsupported';
type Permission = { granted: boolean; status: string; canAskAgain: boolean };
type NativePort = {
  AndroidImportance: { NONE: number; DEFAULT: number };
  getPermissionsAsync(): Promise<Permission>;
  requestPermissionsAsync(): Promise<Permission>;
  getNotificationChannelAsync(id: string): Promise<{ importance: number } | null>;
  setNotificationChannelAsync(id: string, value: { name: string; importance: number; sound: null }): Promise<unknown>;
  scheduleNotificationAsync(value: { identifier: string; content: { title: string; body: string; data: { kind: string }; sound: false };
    trigger: { channelId: string } }): Promise<string>;
  cancelScheduledNotificationAsync(id: string): Promise<void>;
  dismissNotificationAsync(id: string): Promise<void>;
};
export type DeviceNotifications = {
  readPermission(): Promise<DevicePermission>;
  requestPermission(): Promise<DevicePermission>;
  sendMock(): Promise<void>;
  clearMock(): Promise<void>;
};
const channelId = 'owoolmall-development';
const notificationId = 'owoolmall-development-mock';

export function createDeviceNotifications(native: NativePort, platform: string, developmentMock: boolean): DeviceNotifications {
  const read = async (): Promise<DevicePermission> => {
    if (platform !== 'android') return 'unsupported';
    const permission = await native.getPermissionsAsync();
    if (permission.granted) {
      const channel = await native.getNotificationChannelAsync(channelId);
      return channel?.importance === native.AndroidImportance.NONE ? 'blocked' : 'granted';
    }
    return !permission.canAskAgain ? 'blocked' : permission.status === 'denied' ? 'denied' : 'undetermined';
  };
  const prepareChannel = async () => {
    if (!await native.getNotificationChannelAsync(channelId)) {
      await native.setNotificationChannelAsync(channelId, { name: '어울몰 개발용 모의 알림', importance: native.AndroidImportance.DEFAULT, sound: null });
    }
  };
  return {
    readPermission: read,
    async requestPermission() {
      if (platform !== 'android') return 'unsupported';
      await prepareChannel();
      const permission = await native.getPermissionsAsync();
      if (!permission.granted && permission.canAskAgain) await native.requestPermissionsAsync();
      return read();
    },
    async sendMock() {
      if (!developmentMock) throw Error('development_only');
      if (await read() !== 'granted') throw Error('permission_required');
      await prepareChannel();
      await native.scheduleNotificationAsync({ identifier: notificationId,
        content: { title: '어울몰 개발용 모의 알림', body: '기기 표시 시험입니다. 실제 주문·배송 알림이 아닙니다.',
          data: { kind: 'development-mock' }, sound: false }, trigger: { channelId } });
    },
    async clearMock() {
      if (!developmentMock || platform !== 'android') return;
      await native.cancelScheduledNotificationAsync(notificationId);
      await native.dismissNotificationAsync(notificationId);
    },
  };
}
