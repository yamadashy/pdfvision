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
const siteAuthor = {
  '@type': 'Person' as const,
  name: 'Kazuki Yamada',
  url: 'https://github.com/yamadashy',
};

type LocaleLabels = {
  guide: string;
  gettingStarted: string;
  installation: string;
  usage: string;
  useCases: string;
  output: string;
  commandLineOptions: string;
  structuredOutput: string;
  layoutAndWarnings: string;
  renderingAndOcr: string;
  searchAndRegionZoom: string;
  agentSkill: string;
  promptExamples: string;
  libraryApi: string;
  securityAndPrivacy: string;
  faq: string;
  introduction: string;
  core: string;
  agentsAndDevelopers: string;
  reference: string;
};

const labelsEn: LocaleLabels = {
  guide: 'Guide',
  gettingStarted: 'Getting Started',
  installation: 'Installation',
  usage: 'Usage',
  useCases: 'Use Cases',
  output: 'Output Formats',
  commandLineOptions: 'Command Line Options',
  structuredOutput: 'Structured Output',
  layoutAndWarnings: 'Layout and Warnings',
  renderingAndOcr: 'Rendering and OCR',
  searchAndRegionZoom: 'Search and Region Zoom',
  agentSkill: 'Agent Skill',
  promptExamples: 'Prompt Examples',
  libraryApi: 'Library API',
  securityAndPrivacy: 'Security and Privacy',
  faq: 'FAQ',
  introduction: 'Introduction',
  core: 'Core Concepts',
  agentsAndDevelopers: 'Agents and Developers',
  reference: 'Reference',
};

const labelsJa: LocaleLabels = {
  guide: 'ガイド',
  gettingStarted: 'はじめに',
  installation: 'インストール',
  usage: '使い方',
  useCases: 'ユースケース',
  output: '出力形式',
  commandLineOptions: 'CLI オプション',
  structuredOutput: '構造化出力',
  layoutAndWarnings: 'レイアウトと警告',
  renderingAndOcr: 'レンダリングと OCR',
  searchAndRegionZoom: '検索と領域ズーム',
  agentSkill: 'Agent Skill',
  promptExamples: 'プロンプト例',
  libraryApi: 'ライブラリ API',
  securityAndPrivacy: 'セキュリティとプライバシー',
  faq: 'FAQ',
  introduction: '導入',
  core: '主要機能',
  agentsAndDevelopers: 'エージェントと開発者',
  reference: 'リファレンス',
};

const labelsZhCn: LocaleLabels = {
  guide: '指南',
  gettingStarted: '快速开始',
  installation: '安装',
  usage: '使用方法',
  useCases: '使用场景',
  output: '输出格式',
  commandLineOptions: 'CLI 选项',
  structuredOutput: '结构化输出',
  layoutAndWarnings: '布局与警告',
  renderingAndOcr: '渲染与 OCR',
  searchAndRegionZoom: '搜索与区域放大',
  agentSkill: 'Agent Skill',
  promptExamples: '提示词示例',
  libraryApi: '库 API',
  securityAndPrivacy: '安全与隐私',
  faq: 'FAQ',
  introduction: '入门',
  core: '核心概念',
  agentsAndDevelopers: '智能体与开发者',
  reference: '参考',
};

const labelsZhTw: LocaleLabels = {
  guide: '指南',
  gettingStarted: '快速開始',
  installation: '安裝',
  usage: '使用方式',
  useCases: '使用情境',
  output: '輸出格式',
  commandLineOptions: 'CLI 選項',
  structuredOutput: '結構化輸出',
  layoutAndWarnings: '版面與警告',
  renderingAndOcr: '渲染與 OCR',
  searchAndRegionZoom: '搜尋與區域放大',
  agentSkill: 'Agent Skill',
  promptExamples: '提示詞範例',
  libraryApi: '函式庫 API',
  securityAndPrivacy: '安全與隱私',
  faq: 'FAQ',
  introduction: '入門',
  core: '核心概念',
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
      ],
    },
    {
      text: labels.core,
      items: [
        { text: labels.output, link: withPrefix(prefix, '/guide/output') },
        { text: labels.commandLineOptions, link: withPrefix(prefix, '/guide/command-line-options') },
        { text: labels.structuredOutput, link: withPrefix(prefix, '/guide/structured-output') },
        { text: labels.layoutAndWarnings, link: withPrefix(prefix, '/guide/layout-and-warnings') },
        { text: labels.renderingAndOcr, link: withPrefix(prefix, '/guide/rendering-and-ocr') },
        { text: labels.searchAndRegionZoom, link: withPrefix(prefix, '/guide/search-and-region-zoom') },
      ],
    },
    {
      text: labels.agentsAndDevelopers,
      items: [
        { text: labels.agentSkill, link: withPrefix(prefix, '/guide/agent-skill') },
        { text: labels.promptExamples, link: withPrefix(prefix, '/guide/prompt-examples') },
        { text: labels.libraryApi, link: withPrefix(prefix, '/guide/library-api') },
      ],
    },
    {
      text: labels.reference,
      items: [
        { text: labels.securityAndPrivacy, link: withPrefix(prefix, '/guide/security-and-privacy') },
        { text: labels.faq, link: withPrefix(prefix, '/guide/faq') },
      ],
    },
  ],
});

const nav = (prefix: string, labels: LocaleLabels): DefaultTheme.NavItem[] => [
  { text: labels.guide, link: withPrefix(prefix, '/guide/'), activeMatch: `${prefix}/guide/` },
  { text: 'GitHub', link: githubUrl },
  { text: 'npm', link: npmUrl },
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
        'Bundled agent skill for Claude Code, Codex, and Cursor workflows',
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
