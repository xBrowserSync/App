import { Bookmark } from '../bookmark/bookmark.interface';

export interface UpgradeProvider {
  upgradeApp: (upgradingFromVersion?: string) => ng.IPromise<void>;
  upgradeBookmarks: (bookmarks: Bookmark[], upgradingFromVersion?: string) => ng.IPromise<Bookmark[]>;
}
