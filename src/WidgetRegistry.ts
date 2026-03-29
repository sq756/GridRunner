import { defineAsyncComponent, markRaw } from 'vue';

/**
 * TER_CORE WIDGET REGISTRY
 * v2.14.1: Centralized component registration for dynamic tiling.
 */

export const WIDGET_REGISTRY: Record<string, any> = {
  TERMINAL_MAIN: markRaw(defineAsyncComponent(() => import('./components/TerminalTabs.vue'))),
  SFTP_EXPLORER: markRaw(defineAsyncComponent(() => import('./components/SftpExplorer.vue'))),
  SIDEBAR_PANEL: markRaw(defineAsyncComponent(() => import('./components/SidebarPanel.vue'))),
  CYBER_HUD: markRaw(defineAsyncComponent(() => import('./components/CyberHUD.vue'))),
  RUNNING_PROCESSES: markRaw(defineAsyncComponent(() => import('./components/RunningProcesses.vue'))),
  AUTOPILOT_DASHBOARD: markRaw(defineAsyncComponent(() => import('./components/AutoPilotDashboard.vue'))),
};

export type WidgetId = keyof typeof WIDGET_REGISTRY;

export type LayoutNode = {
  type: 'split-horizontal' | 'split-vertical' | 'widget';
  id?: string; // Widget ID if type === 'widget'
  ratio?: number; // 0.0 to 1.0 for splits
  left?: LayoutNode;
  right?: LayoutNode;
  top?: LayoutNode;
  bottom?: LayoutNode;
};
