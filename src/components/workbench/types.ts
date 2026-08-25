// Type definitions and constants for AI Workbench

export type ItemType = 'tool' | 'link' | 'doc' | 'skill' | 'note';

export interface WorkbenchItem {
  id?: number | string;
  name: string;
  type: ItemType;
  url?: string;
}

export interface Folder {
  id: number;
  name: string;
  category: string;
  createdAt: string;
  desc?: string;
  items: WorkbenchItem[];
}

export const CATEGORIES = [
  '工作台',
  '首页',
  '自媒体',
  '技能',
  '电商',
  '收藏',
  'chrome插件',
  'skills',
  '未分类',
] as const;

export type Category = (typeof CATEGORIES)[number] | string;

export interface ItemTypeMeta {
  label: string;
  color: string;
}

export const ITEM_TYPES: Record<ItemType, ItemTypeMeta> = {
  tool: { label: '工具', color: 'var(--accent, #6366f1)' },
  link: { label: '链接', color: 'oklch(0.62 0.12 230)' },
  doc: { label: '文档', color: 'oklch(0.65 0.14 145)' },
  skill: { label: '技能', color: 'oklch(0.60 0.16 300)' },
  note: { label: '笔记', color: 'oklch(0.68 0.12 70)' },
};

export const INITIAL_FOLDERS: Folder[] = [
  {
    id: 1,
    name: '文件夹',
    category: '工作台',
    createdAt: '2024-11-12',
    desc: '通用工具与常用资源的归集文件夹。',
    items: [
      { name: '图片压缩器', type: 'tool' },
      { name: '配色方案库', type: 'link' },
      { name: '设计规范文档', type: 'doc' },
      { name: '图标搜索', type: 'tool' },
      { name: '字体下载站', type: 'link' },
    ],
  },
  {
    id: 2,
    name: '陈王百口',
    category: '工作台',
    createdAt: '2024-12-03',
    desc: '文案创作与口播脚本相关工具集合。',
    items: [
      { name: '标题生成器', type: 'tool' },
      { name: '口播脚本模板', type: 'doc' },
      { name: '爆款文案库', type: 'link' },
      { name: '押韵助手', type: 'skill' },
      { name: '选题笔记', type: 'note' },
      { name: '热点追踪', type: 'link' },
      { name: 'AI 改写', type: 'tool' },
    ],
  },
  {
    id: 3,
    name: '推特',
    category: '工作台',
    createdAt: '2025-01-18',
    desc: '海外社交媒体运营与内容分发工具。',
    items: [
      { name: '推文调度', type: 'tool' },
      { name: '趋势分析', type: 'link' },
      { name: '素材库', type: 'doc' },
    ],
  },
  {
    id: 4,
    name: '九宫格合集',
    category: '工作台',
    createdAt: '2025-02-05',
    desc: '按九宫格整理的多类别工具速查。',
    items: [
      { name: '写作', type: 'tool' },
      { name: '设计', type: 'tool' },
      { name: '视频', type: 'tool' },
      { name: '音频', type: 'tool' },
      { name: '数据', type: 'tool' },
      { name: '翻译', type: 'tool' },
      { name: '编程', type: 'tool' },
      { name: '研究', type: 'tool' },
      { name: '协作', type: 'tool' },
      { name: '更多', type: 'link' },
      { name: '归档', type: 'note' },
    ],
  },
  {
    id: 5,
    name: '工具',
    category: '工作台',
    createdAt: '2024-10-22',
    desc: '日常效率工具与浏览器扩展集合。',
    items: [
      { name: '截图标注', type: 'tool' },
      { name: '密码管理', type: 'tool' },
      { name: '待办清单', type: 'doc' },
      { name: '剪贴板历史', type: 'skill' },
    ],
  },
  {
    id: 6,
    name: '小红书运营',
    category: '自媒体',
    createdAt: '2025-01-30',
    desc: '小红书内容策划、发布与数据分析工具。',
    items: [
      { name: '选题日历', type: 'doc' },
      { name: '封面模板', type: 'link' },
      { name: '数据看板', type: 'tool' },
      { name: '评论回复库', type: 'note' },
    ],
  },
  {
    id: 7,
    name: '视频剪辑',
    category: '自媒体',
    createdAt: '2025-02-14',
    desc: '短视频制作流程中的工具与素材。',
    items: [
      { name: '剪辑软件', type: 'tool' },
      { name: '无版权音乐', type: 'link' },
      { name: '字幕生成', type: 'skill' },
      { name: '转场素材', type: 'link' },
      { name: '封面设计', type: 'tool' },
    ],
  },
  {
    id: 8,
    name: 'Prompt 工程',
    category: '技能',
    createdAt: '2025-03-01',
    desc: 'AI 提示词模板与最佳实践整理。',
    items: [
      { name: '通用模板', type: 'doc' },
      { name: '角色设定库', type: 'doc' },
      { name: '少样本示例', type: 'note' },
      { name: '链式思考', type: 'skill' },
    ],
  },
  {
    id: 9,
    name: '选品分析',
    category: '电商',
    createdAt: '2025-02-20',
    desc: '跨境电商选品与竞品分析工具。',
    items: [
      { name: '销量查询', type: 'tool' },
      { name: '竞品监控', type: 'link' },
      { name: '利润计算器', type: 'tool' },
    ],
  },
  {
    id: 10,
    name: '常用收藏',
    category: '收藏',
    createdAt: '2024-09-15',
    desc: '长期收藏的优质资源与网站。',
    items: [
      { name: '设计灵感', type: 'link' },
      { name: '技术博客', type: 'link' },
      { name: '开源项目', type: 'link' },
      { name: '学习路径', type: 'doc' },
      { name: '行业报告', type: 'doc' },
    ],
  },
  {
    id: 11,
    name: '浏览器扩展',
    category: 'chrome插件',
    createdAt: '2025-01-05',
    desc: '日常使用的 Chrome 扩展清单。',
    items: [
      { name: '广告拦截', type: 'tool' },
      { name: '翻译助手', type: 'tool' },
      { name: '网页截图', type: 'tool' },
      { name: '标签管理', type: 'skill' },
    ],
  },
  {
    id: 12,
    name: '自动化技能',
    category: 'skills',
    createdAt: '2025-03-10',
    desc: '可复用的自动化工作流与技能模块。',
    items: [
      { name: '数据抓取', type: 'skill' },
      { name: '邮件汇总', type: 'skill' },
      { name: '报表生成', type: 'skill' },
      { name: '内容分发', type: 'skill' },
      { name: '定时提醒', type: 'skill' },
    ],
  },
];
