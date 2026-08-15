import { defineConfig, type DefaultTheme, type HeadConfig } from 'vitepress';
import llmstxt from 'vitepress-plugin-llms';

const siteName = 'pdfvision';
const siteDescription =
  'PDF extraction CLI for AI agents: text, layout, OCR, warnings, metadata, and rendered page images.';
const siteBase = process.env.PDFVISION_DOCS_BASE || '/';
const siteUrl = (process.env.PDFVISION_DOCS_URL || 'https://pdfvision.dev').replace(/\/+$/, '');
const siteOrigin = new URL(siteUrl).origin;
const siteHostname = new URL(siteUrl).hostname;
const siteBasePath = siteBase.endsWith('/') ? siteBase : `${siteBase}/`;
const withBase = (path: string) => `${siteBasePath}${path.replace(/^\/+/, '')}`;
const ogImageUrl = `${siteUrl}/og.png`;
const githubUrl = 'https://github.com/yamadashy/pdfvision';
const npmUrl = 'https://www.npmjs.com/package/pdfvision';
const websiteId = `${siteUrl}#website`;
const isCloudflareProductionDeploy =
  (process.env.CF_PAGES === '1' && process.env.CF_PAGES_BRANCH === 'main') ||
  (process.env.WORKERS_CI === '1' && process.env.WORKERS_CI_BRANCH === 'main');
const isGoogleAnalyticsEnabled =
  process.env.PDFVISION_ENABLE_GOOGLE_ANALYTICS === '1' || isCloudflareProductionDeploy;
const siteAuthor = {
  '@type': 'Person' as const,
  name: 'Kazuki Yamada',
  url: 'https://github.com/yamadashy',
};
const googleAnalyticsTag = 'G-DED5VQQ0JC';

/**
 * The reference entries mirror docs/cli-topics/*.md one for one: those topics
 * generate the English pages (scripts/build-site-reference.mjs) and every
 * locale carries a translation of each. A topic without a sidebar entry would
 * be a page nobody can reach.
 */
type LocaleLabels = {
  guide: string;
  gettingStarted: string;
  installation: string;
  usage: string;
  useCases: string;
  faq: string;
  agentSkill: string;
  promptExamples: string;
  commandLineOptions: string;
  flags: string;
  output: string;
  structuredOutput: string;
  layout: string;
  warnings: string;
  visual: string;
  ocr: string;
  searchAndRegionZoom: string;
  interactive: string;
  documentFeatures: string;
  mcpServer: string;
  libraryApi: string;
  securityAndPrivacy: string;
  introduction: string;
  agentsAndDevelopers: string;
  reference: string;
};

const labelsEn: LocaleLabels = {
  guide: 'Guide',
  gettingStarted: 'Getting Started',
  installation: 'Installation',
  usage: 'Usage',
  useCases: 'Use Cases',
  faq: 'FAQ',
  agentSkill: 'Agent Skills',
  promptExamples: 'Prompt Examples',
  commandLineOptions: 'Command Line Options',
  flags: 'Flag Selection',
  output: 'Output Formats',
  structuredOutput: 'Structured Output',
  layout: 'Layout and Geometry',
  warnings: 'Warnings',
  visual: 'Visual Regions and Rendering',
  ocr: 'OCR',
  searchAndRegionZoom: 'Search and Region Zoom',
  interactive: 'Forms, Links, and Annotations',
  documentFeatures: 'Document Features',
  mcpServer: 'MCP Server',
  libraryApi: 'Library API',
  securityAndPrivacy: 'Security and Privacy',
  introduction: 'Introduction',
  agentsAndDevelopers: 'Agents and Developers',
  reference: 'Reference',
};

const labelsJa: LocaleLabels = {
  guide: 'ガイド',
  gettingStarted: 'はじめに',
  installation: 'インストール',
  usage: '使い方',
  useCases: 'ユースケース',
  faq: 'FAQ',
  agentSkill: 'Agent Skills',
  promptExamples: 'プロンプト例',
  commandLineOptions: 'CLI オプション',
  flags: 'フラグの選び方',
  output: '出力形式',
  structuredOutput: '構造化出力',
  layout: 'レイアウトとジオメトリ',
  warnings: '警告',
  visual: '視覚領域とレンダリング',
  ocr: 'OCR',
  searchAndRegionZoom: '検索と領域ズーム',
  interactive: 'フォーム・リンク・注釈',
  documentFeatures: '文書機能',
  mcpServer: 'MCP サーバー',
  libraryApi: 'ライブラリ API',
  securityAndPrivacy: 'セキュリティとプライバシー',
  introduction: '導入',
  agentsAndDevelopers: 'エージェントと開発者',
  reference: 'リファレンス',
};

const labelsZhCn: LocaleLabels = {
  guide: '指南',
  gettingStarted: '快速开始',
  installation: '安装',
  usage: '使用方法',
  useCases: '使用场景',
  faq: 'FAQ',
  agentSkill: 'Agent Skills',
  promptExamples: '提示词示例',
  commandLineOptions: 'CLI 选项',
  flags: 'Flag 选择',
  output: '输出格式',
  structuredOutput: '结构化输出',
  layout: '布局与几何',
  warnings: '警告',
  visual: '视觉区域与渲染',
  ocr: 'OCR',
  searchAndRegionZoom: '搜索与区域放大',
  interactive: '表单、链接与注释',
  documentFeatures: '文档功能',
  mcpServer: 'MCP 服务器',
  libraryApi: '库 API',
  securityAndPrivacy: '安全与隐私',
  introduction: '入门',
  agentsAndDevelopers: '智能体与开发者',
  reference: '参考',
};

const labelsZhTw: LocaleLabels = {
  guide: '指南',
  gettingStarted: '快速開始',
  installation: '安裝',
  usage: '使用方式',
  useCases: '使用情境',
  faq: 'FAQ',
  agentSkill: 'Agent Skills',
  promptExamples: '提示詞範例',
  commandLineOptions: 'CLI 選項',
  flags: 'Flag 選擇',
  output: '輸出格式',
  structuredOutput: '結構化輸出',
  layout: '版面與幾何',
  warnings: '警告',
  visual: '視覺區域與渲染',
  ocr: 'OCR',
  searchAndRegionZoom: '搜尋與區域放大',
  interactive: '表單、連結與註解',
  documentFeatures: '文件功能',
  mcpServer: 'MCP 伺服器',
  libraryApi: '函式庫 API',
  securityAndPrivacy: '安全與隱私',
  introduction: '入門',
  agentsAndDevelopers: '代理與開發者',
  reference: '參考',
};

const withPrefix = (prefix: string, path: string) => `${prefix}${path}`;

const guideSidebar = (prefix: string, labels: LocaleLabels): DefaultTheme.Sidebar => ({
  [withPrefix(prefix, '/guide/')]: [
    {
      text: labels.introduction,
      items: [
        { text: labels.gettingStarted, link: withPrefix(prefix, '/guide/') },
        { text: labels.installation, link: withPrefix(prefix, '/guide/installation') },
        { text: labels.usage, link: withPrefix(prefix, '/guide/usage') },
        { text: labels.useCases, link: withPrefix(prefix, '/guide/use-cases') },
        { text: labels.faq, link: withPrefix(prefix, '/guide/faq') },
      ],
    },
    {
      text: labels.agentsAndDevelopers,
      items: [
        { text: labels.agentSkill, link: withPrefix(prefix, '/guide/agent-skill') },
        { text: labels.promptExamples, link: withPrefix(prefix, '/guide/prompt-examples') },
      ],
    },
    {
      text: labels.reference,
      items: [
        { text: labels.commandLineOptions, link: withPrefix(prefix, '/guide/command-line-options') },
        { text: labels.flags, link: withPrefix(prefix, '/guide/flags') },
        { text: labels.output, link: withPrefix(prefix, '/guide/output') },
        { text: labels.structuredOutput, link: withPrefix(prefix, '/guide/structured-output') },
        { text: labels.layout, link: withPrefix(prefix, '/guide/layout') },
        { text: labels.warnings, link: withPrefix(prefix, '/guide/warnings') },
        { text: labels.visual, link: withPrefix(prefix, '/guide/visual') },
        { text: labels.ocr, link: withPrefix(prefix, '/guide/ocr') },
        { text: labels.searchAndRegionZoom, link: withPrefix(prefix, '/guide/search-and-region-zoom') },
        { text: labels.interactive, link: withPrefix(prefix, '/guide/interactive') },
        { text: labels.documentFeatures, link: withPrefix(prefix, '/guide/document-features') },
        { text: labels.mcpServer, link: withPrefix(prefix, '/guide/mcp-server') },
        { text: labels.libraryApi, link: withPrefix(prefix, '/guide/library-api') },
        { text: labels.securityAndPrivacy, link: withPrefix(prefix, '/guide/security-and-privacy') },
      ],
    },
  ],
});

const nav = (prefix: string, labels: LocaleLabels): DefaultTheme.NavItem[] => [
  { text: labels.guide, link: withPrefix(prefix, '/guide/'), activeMatch: `${prefix}/guide/` },
  { text: 'GitHub', link: githubUrl },
];

const themeConfig = (prefix: string, labels: LocaleLabels): DefaultTheme.Config => ({
  nav: nav(prefix, labels),
  sidebar: guideSidebar(prefix, labels),
});

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@id': websiteId,
      '@type': 'WebSite',
      name: siteName,
      url: siteUrl,
      description: siteDescription,
      inLanguage: 'en',
    },
    {
      '@type': 'SoftwareApplication',
      name: siteName,
      description: siteDescription,
      url: siteUrl,
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Windows, macOS, Linux',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
      license: 'https://opensource.org/licenses/MIT',
      isAccessibleForFree: true,
      installUrl: npmUrl,
      downloadUrl: npmUrl,
      softwareRequirements: 'Node.js 22.13.0 or higher',
      image: `${siteUrl}/logo.svg`,
      screenshot: ogImageUrl,
      author: siteAuthor,
      sameAs: [githubUrl, npmUrl],
      featureList: [
        'PDF text extraction for AI agents',
        'Rendered page PNGs for multimodal models',
        'OCR with Tesseract.js',
        'Layout blocks, geometry, and visual regions',
        'Warnings for scans, glyph issues, flattened tables, and visual mismatches',
        'JSON, XML, Markdown, and TOON output formats',
        'Local and remote PDF extraction with cache support',
        'Bundled Agent Skills for Claude Code, Codex, and Cursor workflows',
        'MCP server for shell-less hosts such as Claude Desktop and Cursor',
      ],
    },
  ],
};

const localeConfig = {
  en: { bcp47: 'en', og: 'en_US' },
  ja: { bcp47: 'ja', og: 'ja_JP' },
  'zh-cn': { bcp47: 'zh-CN', og: 'zh_CN' },
  'zh-tw': { bcp47: 'zh-TW', og: 'zh_TW' },
} as const;

type Locale = keyof typeof localeConfig;

const supportedLocales = Object.keys(localeConfig) as Locale[];

const stripPageSuffix = (rest: string) =>
  rest
    .replace(/\.md$/, '')
    .replace(/(^|\/)index$/, '$1')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');

const resolvePageLocale = (page: string): { locale: Locale; rest: string } => {
  for (const locale of supportedLocales) {
    if (page === `${locale}.md` || page === `${locale}/index.md` || page.startsWith(`${locale}/`)) {
      const remainder = page === `${locale}.md` || page === `${locale}/index.md` ? '' : page.slice(locale.length + 1);
      return { locale, rest: stripPageSuffix(remainder) };
    }
  }
  return { locale: 'en', rest: stripPageSuffix(page) };
};

const buildLocaleUrl = (locale: Locale, rest: string): string => {
  const prefix = locale === 'en' ? '' : `/${locale}`;
  return rest ? `${siteUrl}${prefix}/${rest}` : `${siteUrl}${prefix}`;
};

type TransformHeadContext = {
  page: string;
  title: string;
  description: string;
  pageData: {
    isNotFound?: boolean;
  };
};

const createPageHead = ({ page, title, description, pageData }: TransformHeadContext): HeadConfig[] => {
  if (pageData.isNotFound) return [];

  const { locale, rest } = resolvePageLocale(page);
  const url = buildLocaleUrl(locale, rest);
  const isHome = rest === '';
  const tags: HeadConfig[] = [
    ['link', { rel: 'canonical', href: url }],
    ['meta', { property: 'og:type', content: isHome ? 'website' : 'article' }],
    ['meta', { property: 'og:title', content: title }],
    ['meta', { property: 'og:url', content: url }],
    ['meta', { property: 'og:description', content: description }],
    ['meta', { property: 'og:locale', content: localeConfig[locale].og }],
    ['meta', { name: 'twitter:title', content: title }],
    ['meta', { name: 'twitter:url', content: url }],
    ['meta', { name: 'twitter:description', content: description }],
  ];

  for (const alt of supportedLocales) {
    tags.push([
      'link',
      {
        rel: 'alternate',
        hreflang: localeConfig[alt].bcp47,
        href: buildLocaleUrl(alt, rest),
      },
    ]);
    if (alt !== locale) {
      tags.push(['meta', { property: 'og:locale:alternate', content: localeConfig[alt].og }]);
    }
  }
  tags.push(['link', { rel: 'alternate', hreflang: 'x-default', href: buildLocaleUrl('en', rest) }]);

  if (!isHome) {
    tags.push([
      'script',
      { type: 'application/ld+json' },
      JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        headline: title,
        description,
        inLanguage: localeConfig[locale].bcp47,
        isPartOf: { '@id': websiteId },
        mainEntityOfPage: {
          '@type': 'WebPage',
          '@id': url,
        },
        image: ogImageUrl,
        author: siteAuthor,
      }),
    ]);
  }

  return tags;
};

const googleAnalyticsHead: HeadConfig[] = isGoogleAnalyticsEnabled
  ? [
      [
        'script',
        {
          async: 'true',
          src: `https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsTag}`,
        },
      ],
      [
        'script',
        {},
        `window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${googleAnalyticsTag}');`,
      ],
    ]
  : [];

const head: HeadConfig[] = [
  ['link', { rel: 'icon', href: withBase('logo.svg') }],
  ['meta', { property: 'og:site_name', content: siteName }],
  ['meta', { property: 'og:image', content: ogImageUrl }],
  ['meta', { property: 'og:image:width', content: '1200' }],
  ['meta', { property: 'og:image:height', content: '630' }],
  ['meta', { property: 'og:image:alt', content: 'pdfvision: PDF extraction for AI agents' }],
  ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
  ['meta', { name: 'twitter:domain', content: siteHostname }],
  ['meta', { name: 'twitter:image', content: ogImageUrl }],
  ['meta', { name: 'twitter:image:alt', content: 'pdfvision: PDF extraction for AI agents' }],
  ['meta', { name: 'thumbnail', content: ogImageUrl }],
  ['meta', { name: 'theme-color', content: '#ab4472' }],
  ['script', { type: 'application/ld+json' }, JSON.stringify(jsonLd)],
  ...googleAnalyticsHead,
];

export default defineConfig({
  title: siteName,
  description: siteDescription,
  base: siteBase,
  srcDir: 'src',
  rewrites: {
    'en/:rest*': ':rest*',
  },
  cleanUrls: true,
  lastUpdated: true,
  metaChunk: true,
  sitemap: {
    hostname: `${siteUrl}/`,
  },
  transformHead: createPageHead,
  head,
  themeConfig: {
    logo: { src: '/logo.svg', width: 24, height: 24 },
    search: {
      provider: 'local',
    },
    socialLinks: [{ icon: 'github', link: githubUrl }],
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © Kazuki Yamada',
    },
    outline: [2, 3],
    editLink: {
      pattern: `${githubUrl}/edit/main/docs/src/:path`,
      text: 'Edit this page on GitHub',
    },
    langMenuLabel: 'Languages',
  },
  locales: {
    root: {
      label: 'English',
      lang: 'en-US',
      description: siteDescription,
      themeConfig: themeConfig('', labelsEn),
    },
    ja: {
      label: '日本語',
      lang: 'ja-JP',
      description: 'AI エージェント向けに PDF のテキスト、レイアウト、OCR、ページ画像を抽出します。',
      themeConfig: themeConfig('/ja', labelsJa),
    },
    'zh-cn': {
      label: '简体中文',
      lang: 'zh-CN',
      description: '为 AI 智能体从 PDF 中提取文本、布局、OCR 和页面图像。',
      themeConfig: themeConfig('/zh-cn', labelsZhCn),
    },
    'zh-tw': {
      label: '繁體中文',
      lang: 'zh-TW',
      description: '為 AI 代理從 PDF 中擷取文字、版面、OCR 與頁面影像。',
      themeConfig: themeConfig('/zh-tw', labelsZhTw),
    },
  },
  vite: {
    plugins: [
      ...llmstxt({
        workDir: 'en',
        domain: siteOrigin,
      }),
    ],
  },
});
