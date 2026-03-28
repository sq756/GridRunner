import { ref, watch } from 'vue';
import { invoke } from '@tauri-apps/api/core';

export interface Bookmark {
  id: string;
  host_id: string;
  title: string;
  url: string;
  icon?: string;
}

export function useBookmarks(hostId: any) {
  const bookmarks = ref<Bookmark[]>([]);

  const loadBookmarks = async () => {
    try {
      const list = await invoke<Bookmark[]>('list_bookmarks', { hostId: hostId.value || 'GLOBAL' });
      bookmarks.value = list;
    } catch (e) {
      console.error('Failed to load bookmarks:', e);
    }
  };

  const addBookmark = async (title: string, url: string, isGlobal: boolean = false) => {
    const bookmark: Bookmark = {
      id: Math.random().toString(36).substr(2, 9),
      host_id: isGlobal ? 'GLOBAL' : (hostId.value || 'GLOBAL'),
      title,
      url,
    };
    try {
      await invoke('save_bookmark', { bookmark });
      await loadBookmarks();
    } catch (e) {
      console.error('Failed to save bookmark:', e);
    }
  };

  const removeBookmark = async (id: string) => {
    try {
      await invoke('delete_bookmark', { id });
      await loadBookmarks();
    } catch (e) {
      console.error('Failed to delete bookmark:', e);
    }
  };

  watch(hostId, () => {
    loadBookmarks();
  }, { immediate: true });

  return {
    bookmarks,
    loadBookmarks,
    addBookmark,
    removeBookmark
  };
}
