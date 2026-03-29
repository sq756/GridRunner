import { reactive, ref } from 'vue';

/**
 * [THE NEXUS] RPC BUS CORE - v3.0
 * 星状路由总线：负责组件注册、动态跳线路由及实时流量监控。
 */

export interface RPCEvent {
  id: string;
  timestamp: number;
  from: string;       // 源节点 ID, 如 @actor, @gemini
  target?: string;     // 目标节点 ID (可选，若不填则尝试通过 Links 路由)
  action: string;     // 执行动作, 如 reload, input, capture
  payload: any;       // 数据载荷
  status: 'SENT' | 'ROUTED' | 'CONSUMED' | 'FAILED' | 'BLOCKED';
  metadata?: any;
}

export interface RPCLink {
  id: string;
  source: string;     // 源节点 ID
  event: string;      // 源事件名
  target: string;     // 目标节点 ID
  action: string;     // 转换后的目标动作
  enabled: boolean;
}

export interface RPCNode {
  id: string;         // 节点唯一标识, 如 @plot_viewer
  label: string;      // 人类可读名称
  capabilities: string[]; // 该节点能处理的动作列表
}

class RPCBus {
  // 核心响应式状态
  public nodes = reactive<Map<string, RPCNode>>(new Map());
  public links = reactive<RPCLink[]>([]);
  public traffic = ref<RPCEvent[]>([]);
  
  // 事件监听器回调 (NodeID -> Set of Callbacks)
  private listeners = new Map<string, Set<(event: RPCEvent) => void>>();

  private readonly MAX_TRAFFIC_LOGS = 200;

  constructor() {
    // 尝试从本地加载持久化的跳线配置
    const savedLinks = localStorage.getItem('ter_nexus_links');
    if (savedLinks) {
      try { this.links.push(...JSON.parse(savedLinks)); } catch (e) {}
    }

    // v3.1.7: Default Neural Presets
    if (this.links.length === 0) {
      this.addLink({ source: '@actor', event: 'plot', target: '@plot', action: 'reload_image' });
      this.addLink({ source: '@actor', event: 'paper', target: '@pdf', action: 'navigate' });
    }
  }

  /**
   * 组件注册：挂载时调用
   */
  public register(node: RPCNode, onMessage: (event: RPCEvent) => void) {
    this.nodes.set(node.id, node);
    if (!this.listeners.has(node.id)) {
      this.listeners.set(node.id, new Set());
    }
    this.listeners.get(node.id)!.add(onMessage);
    this.logSystem(`Node Registered: ${node.id} (${node.label})`);
  }

  /**
   * 组件注销：卸载时调用
   */
  public unregister(nodeId: string) {
    this.nodes.delete(nodeId);
    this.listeners.delete(nodeId);
    this.logSystem(`Node Unregistered: ${nodeId}`);
  }

  /**
   * 核心派发引擎
   */
  public dispatch(eventInput: Partial<RPCEvent>) {
    const event: RPCEvent = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
      from: eventInput.from || 'unknown',
      target: eventInput.target,
      action: eventInput.action || 'default',
      payload: eventInput.payload,
      status: 'SENT',
      ...eventInput
    };

    // 1. 记录流量
    this.recordTraffic(event);

    // v3.1.0: Intent Awareness - Auto Layout Trigger
    if (event.target && !this.nodes.has(event.target)) {
      this.handleMissingTarget(event.target, event.action);
    }

    // 2. 检查直接路由 (Direct Addressing)
    if (event.target && event.target !== 'broadcast') {
      this.routeToNode(event.target, event);
      return;
    }

    // 3. 检查跳线路由 (Patch Bay Routing)
    let routedCount = 0;
    this.links.forEach(link => {
      if (link.enabled && link.source === event.from && link.event === event.action) {
        const linkedEvent = { ...event, target: link.target, action: link.action, status: 'ROUTED' as const };
        this.routeToNode(link.target, linkedEvent);
        routedCount++;
      }
    });

    if (routedCount === 0 && !event.target) {
      event.status = 'FAILED';
      this.logSystem(`Unrouted Event from ${event.from}: ${event.action}`, 'warn');
    }
  }

  /**
   * 执行路由：将消息送达目标节点的监听器
   */
  private routeToNode(targetId: string, event: RPCEvent) {
    const nodeListeners = this.listeners.get(targetId);
    if (nodeListeners && nodeListeners.size > 0) {
      nodeListeners.forEach(cb => cb(event));
      event.status = 'CONSUMED';
    } else {
      event.status = 'FAILED';
      this.logSystem(`Target Node Offline or No Listeners: ${targetId}`, 'error');
    }
  }

  /**
   * 管理跳线 (Patch Bay Controls)
   */
  public addLink(link: Omit<RPCLink, 'id' | 'enabled'>) {
    const newLink: RPCLink = {
      ...link,
      id: `link-${Date.now()}`,
      enabled: true
    };
    this.links.push(newLink);
    this.saveLinks();
  }

  public removeLink(linkId: string) {
    const idx = this.links.findIndex(l => l.id === linkId);
    if (idx !== -1) {
      this.links.splice(idx, 1);
      this.saveLinks();
    }
  }

  private saveLinks() {
    localStorage.setItem('ter_nexus_links', JSON.stringify(this.links));
  }

  private recordTraffic(event: RPCEvent) {
    this.traffic.value.unshift(event);
    if (this.traffic.value.length > this.MAX_TRAFFIC_LOGS) {
      this.traffic.value.pop();
    }
  }

  private logSystem(msg: string, level: 'info' | 'warn' | 'error' = 'info') {
    this.recordTraffic({
      id: `sys-${Date.now()}`,
      timestamp: Date.now(),
      from: 'SYSTEM',
      action: 'log',
      payload: msg,
      status: 'CONSUMED',
      metadata: { level }
    });
  }

  /**
   * 意图拦截：当目标节点不在线时，尝试触发布局预设
   */
  private handleMissingTarget(targetId: string, action: string) {
    this.logSystem(`Intent Detected for offline node: ${targetId}. Reconfiguring workspace...`, 'warn');
    
    // 我们不能直接从这里调用 storeActions (循环依赖风险)
    // 所以我们通过全局事件分发意图
    window.dispatchEvent(new CustomEvent('ter-nexus-intent', {
      detail: { targetId, action }
    }));
  }
}

export const rpcBus = new RPCBus();
