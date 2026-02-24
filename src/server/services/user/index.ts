import { ENABLE_BUSINESS_FEATURES } from '@lobechat/business-const';
import { CURRENT_ONBOARDING_VERSION } from '@lobechat/const';
import { type LobeChatDatabase } from '@lobechat/database';
import { MAX_ONBOARDING_STEPS } from '@lobechat/types';

import { initNewUserForBusiness } from '@/business/server/user';
import { UserModel } from '@/database/models/user';
import { initializeServerAnalytics } from '@/libs/analytics';
import { KeyVaultsGateKeeper } from '@/server/modules/KeyVaultsEncrypt';
import { FileS3 } from '@/server/modules/S3';

type CreatedUser = {
  createdAt?: Date | null;
  email?: string | null;
  firstName?: string | null;
  id: string;
  lastName?: string | null;
  phone?: string | null;
  username?: string | null;
};

export class UserService {
  private db: LobeChatDatabase;

  constructor(db: LobeChatDatabase) {
    this.db = db;
  }

  async initUser(user: CreatedUser) {
    if (ENABLE_BUSINESS_FEATURES) {
      try {
        await initNewUserForBusiness(user.id, user.createdAt);
      } catch (error) {
        console.error(error);
        console.error('Failed to init new user for business');
      }
    }

    // Automatically complete onboarding and set defaults for new users
    try {
      const userModel = new UserModel(this.db, user.id);
      await userModel.updateUser({
        onboarding: {
          version: CURRENT_ONBOARDING_VERSION,
          currentStep: MAX_ONBOARDING_STEPS,
          finishedAt: new Date().toISOString(),
        },
        preference: {
          language: 'ru-RU', // Set Russian as default interface language
        },
      });
      console.info(`Auto-completed onboarding and set defaults for user ${user.id}`);
    } catch (error) {
      console.error('Failed to auto-complete onboarding:', error);
    }

    const analytics = await initializeServerAnalytics();
    analytics?.identify(user.id, {
      email: user.email ?? undefined,
      firstName: user.firstName ?? undefined,
      lastName: user.lastName ?? undefined,
      phone: user.phone ?? undefined,
      username: user.username ?? undefined,
    });
    analytics?.track({
      name: 'user_register_completed',
      properties: {
        spm: 'user_service.init_user.user_created',
      },
      userId: user.id,
    });
  }

  getUserApiKeys = async (id: string) => {
    return UserModel.getUserApiKeys(this.db, id, KeyVaultsGateKeeper.getUserKeyVaults);
  };

  getUserAvatar = async (id: string, image: string) => {
    const s3 = new FileS3();
    const s3FileUrl = `user/avatar/${id}/${image}`;

    try {
      const file = await s3.getFileByteArray(s3FileUrl);
      if (!file) {
        return null;
      }
      return Buffer.from(file);
    } catch (error) {
      console.error('Failed to get user avatar', error);
    }
  };
}
