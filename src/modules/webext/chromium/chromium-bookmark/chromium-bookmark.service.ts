import { Injectable } from 'angular-ts-decorators';
import { autobind } from 'core-decorators';
import { Bookmarks as NativeBookmarks, browser } from 'webextension-polyfill-ts';
import { BookmarkChangeType, BookmarkContainer } from '../../../shared/bookmark/bookmark.enum';
import {
  AddNativeBookmarkChangeData,
  Bookmark,
  BookmarkChange,
  BookmarkService,
  ModifyNativeBookmarkChangeData,
  MoveNativeBookmarkChangeData
} from '../../../shared/bookmark/bookmark.interface';
import * as Exceptions from '../../../shared/exception/exception';
import Globals from '../../../shared/global-shared.constants';
import { WebpageMetadata } from '../../../shared/global-shared.interface';
import WebExtBookmarkService from '../../webext-bookmark/webext-bookmark.service';

@autobind
@Injectable('BookmarkService')
export default class ChromiumBookmarkService extends WebExtBookmarkService implements BookmarkService {
  unsupportedContainers = [BookmarkContainer.Menu, BookmarkContainer.Mobile];

  clearNativeBookmarks(): ng.IPromise<void> {
    // Get native container ids
    return this.getNativeContainerIds()
      .then((nativeContainerIds) => {
        const otherBookmarksId = nativeContainerIds[BookmarkContainer.Other] as string;
        const toolbarBookmarksId = nativeContainerIds[BookmarkContainer.Toolbar] as string;

        // Clear other bookmarks
        const clearOthers = browser.bookmarks
          .getChildren(otherBookmarksId)
          .then((results) => {
            return this.$q.all(
              results.map((child) => {
                return this.removeNativeBookmarks(child.id);
              })
            );
          })
          .catch((err) => {
            this.logSvc.logWarning('Error clearing other bookmarks');
            throw err;
          });

        // Clear bookmarks toolbar if enabled
        const clearToolbar = this.bookmarkHelperSvc
          .getSyncBookmarksToolbar()
          .then((syncBookmarksToolbar) => {
            if (!syncBookmarksToolbar) {
              this.logSvc.logInfo('Not clearing toolbar');
              return;
            }

            return browser.bookmarks.getChildren(toolbarBookmarksId).then((results) => {
              return this.$q.all(
                results.map((child) => {
                  return this.removeNativeBookmarks(child.id);
                })
              );
            });
          })
          .catch((err) => {
            this.logSvc.logWarning('Error clearing bookmarks toolbar');
            throw err;
          });

        return this.$q.all([clearOthers, clearToolbar]).then(() => {});
      })
      .catch((err) => {
        throw new Exceptions.FailedRemoveNativeBookmarksException(undefined, err);
      });
  }

  createNativeBookmarksFromBookmarks(bookmarks: Bookmark[]): ng.IPromise<void> {
    const populateStartTime = new Date();

    // Get containers
    const menuContainer = this.bookmarkHelperSvc.getContainer(BookmarkContainer.Menu, bookmarks);
    const mobileContainer = this.bookmarkHelperSvc.getContainer(BookmarkContainer.Mobile, bookmarks);
    const otherContainer = this.bookmarkHelperSvc.getContainer(BookmarkContainer.Other, bookmarks);
    const toolbarContainer = this.bookmarkHelperSvc.getContainer(BookmarkContainer.Toolbar, bookmarks);

    // Get native container ids
    return this.getNativeContainerIds()
      .then((nativeContainerIds) => {
        const otherBookmarksId: string = nativeContainerIds[BookmarkContainer.Other];
        const toolbarBookmarksId: string = nativeContainerIds[BookmarkContainer.Toolbar];

        // Populate menu bookmarks in other bookmarks
        let populateMenu = this.$q.resolve();
        if (menuContainer) {
          populateMenu = browser.bookmarks
            .getSubTree(otherBookmarksId)
            .then(() => {
              return this.createNativeBookmarkTree(otherBookmarksId, [menuContainer], toolbarBookmarksId);
            })
            .catch((err) => {
              this.logSvc.logInfo('Error populating bookmarks menu.');
              throw err;
            });
        }

        // Populate mobile bookmarks in other bookmarks
        let populateMobile = this.$q.resolve();
        if (mobileContainer) {
          populateMobile = browser.bookmarks
            .getSubTree(otherBookmarksId)
            .then(() => {
              return this.createNativeBookmarkTree(otherBookmarksId, [mobileContainer], toolbarBookmarksId);
            })
            .catch((err) => {
              this.logSvc.logInfo('Error populating mobile bookmarks.');
              throw err;
            });
        }

        // Populate other bookmarks
        let populateOther = this.$q.resolve();
        if (otherContainer) {
          populateOther = browser.bookmarks
            .getSubTree(otherBookmarksId)
            .then(() => {
              return this.createNativeBookmarkTree(otherBookmarksId, otherContainer.children, toolbarBookmarksId);
            })
            .catch((err) => {
              this.logSvc.logInfo('Error populating other bookmarks.');
              throw err;
            });
        }

        // Populate bookmarks toolbar if enabled
        const populateToolbar = this.bookmarkHelperSvc.getSyncBookmarksToolbar().then((syncBookmarksToolbar) => {
          if (!syncBookmarksToolbar) {
            this.logSvc.logInfo('Not populating toolbar');
            return;
          }

          if (toolbarContainer) {
            return browser.bookmarks
              .getSubTree(toolbarBookmarksId)
              .then(() => {
                return this.createNativeBookmarkTree(toolbarBookmarksId, toolbarContainer.children);
              })
              .catch((err) => {
                this.logSvc.logInfo('Error populating bookmarks toolbar.');
                throw err;
              });
          }
        });

        return this.$q.all([populateMenu, populateMobile, populateOther, populateToolbar]);
      })
      .then(() => {
        this.logSvc.logInfo(`Bookmarks populated in ${((new Date() as any) - (populateStartTime as any)) / 1000}s`);
        // Move native unsupported containers into the correct order
        return this.reorderUnsupportedContainers();
      });
  }

  createNativeSeparator(
    parentId: string,
    nativeToolbarContainerId: string
  ): ng.IPromise<NativeBookmarks.BookmarkTreeNode> {
    const newSeparator: NativeBookmarks.CreateDetails = {
      parentId,
      title:
        parentId === nativeToolbarContainerId
          ? Globals.Bookmarks.VerticalSeparatorTitle
          : Globals.Bookmarks.HorizontalSeparatorTitle,
      url: this.platformSvc.getNewTabUrl()
    };
    return browser.bookmarks.create(newSeparator).catch((err) => {
      this.logSvc.logInfo('Failed to create native separator');
      throw new Exceptions.FailedCreateNativeBookmarksException(undefined, err);
    });
  }

  getNativeBookmarksAsBookmarks(): ng.IPromise<Bookmark[]> {
    let allNativeBookmarks = [];

    // Get native container ids
    return this.getNativeContainerIds()
      .then((nativeContainerIds) => {
        const menuBookmarksId: string = nativeContainerIds[BookmarkContainer.Menu];
        const mobileBookmarksId: string = nativeContainerIds[BookmarkContainer.Mobile];
        const otherBookmarksId: string = nativeContainerIds[BookmarkContainer.Other];
        const toolbarBookmarksId: string = nativeContainerIds[BookmarkContainer.Toolbar];

        // Get menu bookmarks
        const getMenuBookmarks =
          menuBookmarksId == null
            ? Promise.resolve<Bookmark[]>(null)
            : browser.bookmarks.getSubTree(menuBookmarksId).then((subTree) => {
                const menuBookmarks = subTree[0];
                if (menuBookmarks.children && menuBookmarks.children.length > 0) {
                  return this.bookmarkHelperSvc.getNativeBookmarksAsBookmarks(menuBookmarks.children);
                }
              });

        // Get mobile bookmarks
        const getMobileBookmarks =
          mobileBookmarksId == null
            ? Promise.resolve<Bookmark[]>(null)
            : browser.bookmarks.getSubTree(mobileBookmarksId).then((subTree) => {
                const mobileBookmarks = subTree[0];
                if (mobileBookmarks.children && mobileBookmarks.children.length > 0) {
                  return this.bookmarkHelperSvc.getNativeBookmarksAsBookmarks(mobileBookmarks.children);
                }
              });

        // Get other bookmarks
        const getOtherBookmarks =
          otherBookmarksId == null
            ? Promise.resolve<Bookmark[]>(null)
            : browser.bookmarks.getSubTree(otherBookmarksId).then((subTree) => {
                const otherBookmarks = subTree[0];
                if (otherBookmarks.children?.length === 0) {
                  return;
                }

                // Add all bookmarks into flat array
                this.bookmarkHelperSvc.eachBookmark(otherBookmarks.children, (bookmark) => {
                  allNativeBookmarks.push(bookmark);
                });

                // Remove any unsupported container folders present
                const bookmarksWithoutContainers = this.bookmarkHelperSvc
                  .getNativeBookmarksAsBookmarks(otherBookmarks.children)
                  .filter((x) => {
                    return !this.unsupportedContainers.find((y) => {
                      return y === x.title;
                    });
                  });
                return bookmarksWithoutContainers;
              });

        // Get toolbar bookmarks if enabled
        const getToolbarBookmarks =
          toolbarBookmarksId == null
            ? this.$q.resolve<Bookmark[]>(null)
            : this.$q
                .all([
                  this.bookmarkHelperSvc.getSyncBookmarksToolbar(),
                  browser.bookmarks.getSubTree(toolbarBookmarksId)
                ])
                .then((results) => {
                  const syncBookmarksToolbar = results[0];
                  const toolbarBookmarks = results[1][0];

                  if (!syncBookmarksToolbar) {
                    return;
                  }

                  if (toolbarBookmarks.children && toolbarBookmarks.children.length > 0) {
                    // Add all bookmarks into flat array
                    this.bookmarkHelperSvc.eachBookmark(toolbarBookmarks.children, (bookmark) => {
                      allNativeBookmarks.push(bookmark);
                    });

                    return this.bookmarkHelperSvc.getNativeBookmarksAsBookmarks(toolbarBookmarks.children);
                  }
                });

        return this.$q.all([getMenuBookmarks, getMobileBookmarks, getOtherBookmarks, getToolbarBookmarks]);
      })
      .then((results) => {
        const menuBookmarks = results[0];
        const mobileBookmarks = results[1];
        const otherBookmarks = results[2];
        const toolbarBookmarks = results[3];
        const bookmarks: Bookmark[] = [];
        let otherContainer: Bookmark;
        let toolbarContainer: Bookmark;
        let menuContainer: Bookmark;
        let mobileContainer: Bookmark;

        // Add other container if bookmarks present
        if (otherBookmarks && otherBookmarks.length > 0) {
          otherContainer = this.bookmarkHelperSvc.getContainer(BookmarkContainer.Other, bookmarks, true);
          otherContainer.children = otherBookmarks;
        }

        // Add toolbar container if bookmarks present
        if (toolbarBookmarks && toolbarBookmarks.length > 0) {
          toolbarContainer = this.bookmarkHelperSvc.getContainer(BookmarkContainer.Toolbar, bookmarks, true);
          toolbarContainer.children = toolbarBookmarks;
        }

        // Add menu container if bookmarks present
        if (menuBookmarks && menuBookmarks.length > 0) {
          menuContainer = this.bookmarkHelperSvc.getContainer(BookmarkContainer.Menu, bookmarks, true);
          menuContainer.children = menuBookmarks;
        }

        // Add mobile container if bookmarks present
        if (mobileBookmarks && mobileBookmarks.length > 0) {
          mobileContainer = this.bookmarkHelperSvc.getContainer(BookmarkContainer.Mobile, bookmarks, true);
          mobileContainer.children = mobileBookmarks;
        }

        // Filter containers from flat array of bookmarks
        [otherContainer, toolbarContainer, menuContainer, mobileContainer].forEach((container) => {
          if (!container) {
            return;
          }

          allNativeBookmarks = allNativeBookmarks.filter((bookmark) => {
            return bookmark.title !== container.title;
          });
        });

        // Sort by date added asc
        allNativeBookmarks = allNativeBookmarks.sort((x, y) => {
          return x.dateAdded - y.dateAdded;
        });

        // Iterate native bookmarks to add unique bookmark ids in correct order
        allNativeBookmarks.forEach((nativeBookmark) => {
          this.bookmarkHelperSvc.eachBookmark(bookmarks, (bookmark) => {
            if (
              !bookmark.id &&
              ((!nativeBookmark.url && bookmark.title === nativeBookmark.title) ||
                (nativeBookmark.url && bookmark.url === nativeBookmark.url))
            ) {
              bookmark.id = this.bookmarkHelperSvc.getNewBookmarkId(bookmarks);
            }
          });
        });

        // Find and fix any bookmarks missing ids
        this.bookmarkHelperSvc.eachBookmark(bookmarks, (bookmark) => {
          if (!bookmark.id) {
            bookmark.id = this.bookmarkHelperSvc.getNewBookmarkId(bookmarks);
          }
        });

        return bookmarks;
      });
  }

  getNativeContainerIds(): ng.IPromise<any> {
    return browser.bookmarks.getTree().then((tree) => {
      // Get the root child nodes
      const otherBookmarksNode = tree[0].children.find((x) => {
        return x.id === '2';
      });
      const toolbarBookmarksNode = tree[0].children.find((x) => {
        return x.id === '1';
      });

      // Throw an error if a native container node is not found
      if (!otherBookmarksNode || !toolbarBookmarksNode) {
        if (!otherBookmarksNode) {
          this.logSvc.logWarning('Missing container: other bookmarks');
        }
        if (!toolbarBookmarksNode) {
          this.logSvc.logWarning('Missing container: toolbar bookmarks');
        }
        throw new Exceptions.ContainerNotFoundException();
      }

      // Add containers to results
      const containerIds = {};
      containerIds[BookmarkContainer.Other] = otherBookmarksNode.id;
      containerIds[BookmarkContainer.Toolbar] = toolbarBookmarksNode.id;

      // Check for unsupported containers
      const menuBookmarksNode = otherBookmarksNode.children.find((x) => {
        return x.title === BookmarkContainer.Menu;
      });
      const mobileBookmarksNode = otherBookmarksNode.children.find((x) => {
        return x.title === BookmarkContainer.Mobile;
      });
      containerIds[BookmarkContainer.Menu] = menuBookmarksNode ? menuBookmarksNode.id : undefined;
      containerIds[BookmarkContainer.Mobile] = mobileBookmarksNode ? mobileBookmarksNode.id : undefined;

      return containerIds;
    });
  }

  processNativeBookmarkEventsQueue(): void {
    const doActionUntil = (): ng.IPromise<boolean> => {
      return this.$q.resolve(this.nativeBookmarkEventsQueue.length === 0);
    };

    const action = (): any => {
      // Get first event in the queue and process change
      const currentEvent = this.nativeBookmarkEventsQueue.shift();
      switch (currentEvent.changeType) {
        case BookmarkChangeType.Add:
          return this.syncNativeBookmarkCreated(...currentEvent.eventArgs);
        case BookmarkChangeType.Remove:
          return this.syncNativeBookmarkRemoved(...currentEvent.eventArgs);
        case BookmarkChangeType.Move:
          return this.syncNativeBookmarkMoved(...currentEvent.eventArgs);
        case BookmarkChangeType.Modify:
          return this.syncNativeBookmarkChanged(...currentEvent.eventArgs);
        default:
          throw new Exceptions.AmbiguousSyncRequestException();
      }
    };

    // Iterate through the queue and process the events
    this.utilitySvc.promiseWhile(this.nativeBookmarkEventsQueue, doActionUntil, action).then(() => {
      this.$timeout(() => {
        this.syncEngineSvc.executeSync().then(() => {
          // Move native unsupported containers into the correct order
          return this.disableEventListeners().then(this.reorderUnsupportedContainers).then(this.enableEventListeners);
        });
      }, 100);
    });
  }

  syncNativeBookmarkChanged(id?: string): ng.IPromise<void> {
    // Retrieve full bookmark info
    return browser.bookmarks.getSubTree(id).then((results) => {
      const changedBookmark = results[0];

      // If bookmark is separator update native bookmark properties
      (this.bookmarkHelperSvc.isSeparator(changedBookmark)
        ? this.convertNativeBookmarkToSeparator(changedBookmark)
        : this.$q.resolve(changedBookmark)
      ).then((bookmarkNode) => {
        // If the bookmark was converted to a separator, update id mapping
        let updateMappingPromise: ng.IPromise<void>;
        if (bookmarkNode.id !== id) {
          updateMappingPromise = this.bookmarkIdMapperSvc.get(id).then((idMapping) => {
            if (!idMapping) {
              throw new Exceptions.BookmarkMappingNotFoundException();
            }

            return this.bookmarkIdMapperSvc.remove(idMapping.syncedId).then(() => {
              const newMapping = this.bookmarkIdMapperSvc.createMapping(idMapping.syncedId, bookmarkNode.id);
              return this.bookmarkIdMapperSvc.add(newMapping);
            });
          });
        } else {
          updateMappingPromise = this.$q.resolve();
        }
        return updateMappingPromise.then(() => {
          // Create change info
          const data: ModifyNativeBookmarkChangeData = {
            nativeBookmark: bookmarkNode
          };
          const changeInfo: BookmarkChange = {
            changeData: data,
            type: BookmarkChangeType.Modify
          };

          // Queue sync
          this.syncChange(changeInfo);
        });
      });
    });
  }

  syncNativeBookmarkCreated(id?: string, nativeBookmark?: NativeBookmarks.BookmarkTreeNode): ng.IPromise<void> {
    // If bookmark is separator update native bookmark properties
    return (this.bookmarkHelperSvc.isSeparator(nativeBookmark)
      ? this.convertNativeBookmarkToSeparator(nativeBookmark)
      : this.$q.resolve(nativeBookmark)
    ).then((bookmarkNode) => {
      // Create change info
      const data: AddNativeBookmarkChangeData = {
        nativeBookmark: bookmarkNode
      };
      const changeInfo: BookmarkChange = {
        changeData: data,
        type: BookmarkChangeType.Add
      };

      // If bookmark is not folder or separator, get page metadata from current tab
      return (bookmarkNode.url && !this.bookmarkHelperSvc.isSeparator(bookmarkNode)
        ? this.checkPermsAndGetPageMetadata()
        : this.$q.resolve<WebpageMetadata>(null)
      ).then((metadata) => {
        // Add metadata if bookmark is current tab location
        if (metadata && bookmarkNode.url === metadata.url) {
          (changeInfo.changeData as AddNativeBookmarkChangeData).nativeBookmark.title = this.utilitySvc.stripTags(
            metadata.title
          );
          (changeInfo.changeData as AddNativeBookmarkChangeData).nativeBookmark.description = this.utilitySvc.stripTags(
            metadata.description
          );
          (changeInfo.changeData as AddNativeBookmarkChangeData).nativeBookmark.tags = this.utilitySvc.getTagArrayFromText(
            metadata.tags
          );
        }

        // Queue sync
        this.syncChange(changeInfo);
      });
    });
  }

  syncNativeBookmarkMoved(id?: string, moveInfo?: NativeBookmarks.OnMovedMoveInfoType): ng.IPromise<void> {
    return browser.bookmarks.get(id).then((results) => {
      const movedBookmark = results[0];

      // If bookmark is separator update native bookmark properties
      return (this.bookmarkHelperSvc.isSeparator(movedBookmark)
        ? this.convertNativeBookmarkToSeparator(movedBookmark)
        : this.$q.resolve(movedBookmark)
      ).then((bookmarkNode) => {
        // If the bookmark was converted to a separator, update id mapping
        let updateMappingPromise: ng.IPromise<void>;
        if (bookmarkNode.id !== id) {
          updateMappingPromise = this.bookmarkIdMapperSvc.get(id).then((idMapping) => {
            if (!idMapping) {
              throw new Exceptions.BookmarkMappingNotFoundException();
            }

            return this.bookmarkIdMapperSvc.remove(idMapping.syncedId).then(() => {
              const newMapping = this.bookmarkIdMapperSvc.createMapping(idMapping.syncedId, bookmarkNode.id);
              return this.bookmarkIdMapperSvc.add(newMapping);
            });
          });
        } else {
          updateMappingPromise = this.$q.resolve();
        }
        return updateMappingPromise.then(() => {
          // Create change info
          const data: MoveNativeBookmarkChangeData = {
            ...moveInfo,
            id
          };
          const changeInfo: BookmarkChange = {
            changeData: data,
            type: BookmarkChangeType.Move
          };

          // Queue sync
          this.syncChange(changeInfo);
        });
      });
    });
  }

  wasContainerChanged(
    changedNativeBookmark: NativeBookmarks.BookmarkTreeNode,
    bookmarks: Bookmark[]
  ): ng.IPromise<boolean> {
    return this.$q
      .resolve()
      .then(() => {
        return bookmarks ?? this.bookmarkHelperSvc.getCachedBookmarks();
      })
      .then((results) => {
        const syncedBookmarks = results;

        // Check based on title
        if (this.bookmarkHelperSvc.bookmarkIsContainer(changedNativeBookmark)) {
          return true;
        }

        // Get native container ids
        return this.getNativeContainerIds().then((nativeContainerIds) => {
          // If parent is other bookmarks, check other bookmarks children for containers
          const otherBookmarksId = nativeContainerIds[BookmarkContainer.Other];
          if ((changedNativeBookmark as NativeBookmarks.BookmarkTreeNode).parentId !== otherBookmarksId) {
            return false;
          }

          return browser.bookmarks
            .getChildren(otherBookmarksId)
            .then((children) => {
              // Get all native bookmarks in other bookmarks that are unsupported containers
              const containers = children.filter((x) => {
                return this.unsupportedContainers.find((y) => {
                  return y === x.title;
                });
              });
              let containersCount = 0;
              let checksFailed = false;
              let count;

              // Check each container present only appears once
              const menuContainer = this.bookmarkHelperSvc.getContainer(BookmarkContainer.Menu, syncedBookmarks, false);
              if (menuContainer) {
                containersCount += 1;
                count = containers.filter((x) => {
                  return x.title === BookmarkContainer.Menu;
                }).length;
                checksFailed = count !== 1 ? true : checksFailed;
              }

              const mobileContainer = this.bookmarkHelperSvc.getContainer(
                BookmarkContainer.Mobile,
                syncedBookmarks,
                false
              );
              if (mobileContainer) {
                containersCount += 1;
                count = containers.filter((x) => {
                  return x.title === BookmarkContainer.Mobile;
                }).length;
                checksFailed = count !== 1 ? true : checksFailed;
              }

              // Check number of containers match and return result
              checksFailed = containersCount !== containers.length ? true : checksFailed;
              return checksFailed;
            })
            .catch((err) => {
              this.logSvc.logInfo(
                `Failed to detect whether container changed: ${JSON.stringify(changedNativeBookmark)}`
              );
              throw new Exceptions.FailedGetNativeBookmarksException(undefined, err);
            });
        });
      });
  }
}
