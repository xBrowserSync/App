/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { Injectable } from 'angular-ts-decorators';
import { autobind } from 'core-decorators';
import Globals from '../shared/globals';
import StoreService from '../shared/store/store.service';
import { BookmarkMappingNotFoundException } from '../shared/exceptions/exception-types';

@autobind
@Injectable('BookmarkIdMapperService')
export default class BookmarkIdMapperService {
  $q: ng.IQService;
  storeSvc: StoreService;

  static $inject = ['$q', 'StoreService'];
  constructor($q: ng.IQService, StoreSvc: StoreService) {
    this.$q = $q;
    this.storeSvc = StoreSvc;
  }

  add(newMappings) {
    // Convert mappings to arrays if necessary
    const newMappingsArr = Array.isArray(newMappings) ? newMappings : [newMappings];

    // Add new mappings to existing mappings
    return this.storeSvc
      .get<any[]>(Globals.CacheKeys.BookmarkIdMappings)
      .then((idMappings) => {
        return idMappings.concat(newMappingsArr);
      })
      .then((updatedMappings) => {
        return this.set(updatedMappings);
      });
  }

  clear() {
    return this.storeSvc.remove(Globals.CacheKeys.BookmarkIdMappings);
  }

  createMapping(syncedId, nativeId?) {
    return {
      nativeId,
      syncedId
    };
  }

  get(nativeId, syncedId?) {
    return this.storeSvc.get<any[]>(Globals.CacheKeys.BookmarkIdMappings).then((idMappings) => {
      // Find the requested mapping
      let mapping;
      if (nativeId != null) {
        mapping = idMappings.find((x) => {
          return x.nativeId === nativeId;
        });
      } else if (syncedId != null) {
        mapping = idMappings.find((x) => {
          return x.syncedId === syncedId;
        });
      }
      return mapping;
    });
  }

  remove(syncedIds, nativeIds?) {
    // Convert ids to arrays if necessary
    const syncedIdsArr = syncedIds != null ? (Array.isArray(syncedIds) ? syncedIds : [syncedIds]) : null;
    const nativeIdsArr = nativeIds != null ? (Array.isArray(nativeIds) ? nativeIds : [nativeIds]) : null;

    // Retrieve id mappings
    return this.storeSvc
      .get(Globals.CacheKeys.BookmarkIdMappings)
      .then((idMappings) => {
        // Remove id mappings matching provided synced ids
        const idMappingsLessSynced =
          syncedIdsArr == null
            ? idMappings
            : syncedIdsArr.reduce((acc, val) => {
                const indexToRemove = acc.findIndex((x) => {
                  return x.syncedId === val;
                });
                if (indexToRemove < 0) {
                  throw new Error('Bookmark ID mapping to remove could not be determined');
                }
                return acc.filter((x, index) => {
                  return index !== indexToRemove;
                });
              }, idMappings);

        // Remove id mappings matching provided native ids
        const idMappingsLessNative =
          nativeIdsArr == null
            ? idMappingsLessSynced
            : nativeIdsArr.reduce((acc, val) => {
                const indexToRemove = acc.findIndex((x) => {
                  return x.nativeIds === val;
                });
                if (indexToRemove < 0) {
                  throw new Error('Bookmark ID mapping to remove could not be determined');
                }
                return acc.filter((x, index) => {
                  return index !== indexToRemove;
                });
              }, idMappingsLessSynced);

        // Add updated mappings to store
        return this.set(idMappingsLessNative);
      })
      .catch((err) => {
        throw new BookmarkMappingNotFoundException(null, err);
      });
  }

  set(idMappings) {
    // Sort mappings then save to store
    const sortedMappings = idMappings.sort((a, b) => {
      return a.syncedId - b.syncedId;
    });
    return this.storeSvc.set(Globals.CacheKeys.BookmarkIdMappings, sortedMappings);
  }
}