# YABM

A Chrome extension for managing the browser's bookmarks, with optional sync of the whole set to and from a WebDAV host.

## Bookmarks

**Bookmark**:
A leaf entry holding a URL and a title. It has no children.
_Avoid_: link, item

**Folder**:
A tree entry that holds other folders and bookmarks, and which the user can open to reveal them.
_Avoid_: directory, group, category

**Open folder**:
A folder in the revealed state. The set of open folders survives a re-render, so opening a folder and then syncing leaves it open.
_Avoid_: expanded folder, unfolded node, visible folder

## Sync

**Sync action**:
One complete movement of the bookmark set between the browser and a remote file: an upload, a download, an import, or an export.
_Avoid_: file operation, transfer, job

**Config session**:
The rule that a WebDAV configuration must be successfully tested against unchanged credentials before it may be saved. A superseded test grants no eligibility, however it ends.
_Avoid_: connection, auth state, validation

**WebDAV file picker**:
The choice, made after a successful config test, between an existing remote file and a new one to create. The new file takes its name from the entered name and gains an `.html` extension.
_Avoid_: file list, upload target, destination chooser

**Bookmarks file**:
The single document a sync action uploads or downloads, holding the entire bookmark set. It is what makes the set a unit: one document, all or nothing.
_Avoid_: backup, export file, HTML file

**Download and replace**:
The sync action that makes a downloaded bookmarks file the browser's bookmark set. It is not a merge. The current set is snapshotted, the root folders are cleared, and the file's contents are rebuilt into them; if any step fails, the snapshot is restored. Every other sync action adds to or leaves the set alone, so this is the one action that can remove bookmarks.
_Avoid_: download, import, restore, sync

The distinction is not cosmetic. "Download" suggests retrieval, which is what an upload in reverse would be. Only this action destroys, and the destroy is recoverable but only because of the snapshot.
