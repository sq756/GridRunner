import { webviewInstances, activeWebviewId } from '../store';

export interface WebviewInstance {
  id: string;
  title: string;
  url: string;
  isActive: boolean;
}

/**
 * useWebviews Composable
 * v2.14.0: Migrated to Global Store for dynamic tiling.
 */
export function useWebviews() {
  const createWebview = (url: string = 'https://google.com', title: string = 'New Web Page') => {
    const id = `web-${Math.random().toString(36).substr(2, 9)}`;
    const newInstance: WebviewInstance = {
      id,
      title,
      url,
      isActive: true,
    };
    webviewInstances.value.push(newInstance);
    activeWebviewId.value = id;
    return id;
  };

  const closeWebview = (id: string) => {
    const index = webviewInstances.value.findIndex(w => w.id === id);
    if (index !== -1) {
      webviewInstances.value.splice(index, 1);
      if (activeWebviewId.value === id) {
        activeWebviewId.value = webviewInstances.value.length > 0 ? webviewInstances.value[0].id : null;
      }
    }
  };

  const switchWebview = (id: string) => {
    activeWebviewId.value = id;
  };

  const updateWebviewUrl = (id: string, url: string) => {
    const instance = webviewInstances.value.find(w => w.id === id);
    if (instance) instance.url = url;
  };

  return {
    webviewInstances,
    activeWebviewId,
    createWebview,
    closeWebview,
    switchWebview,
    updateWebviewUrl
  };
}
