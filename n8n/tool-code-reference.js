// n8n 工具代码参考 — 书房智能助手 & 智能录入助手
//
// 后端路由 (router prefix = /api/chat):
//   POST /search              → ChatSearchRequest { query, limit }
//   GET  /book/{book_id}      → ChatBookDetailResponse (book_id=int)
//   GET  /book/{book_id}/similar → { book, similar_books, total_similar }
//
// 后端路由 (router prefix = /api/smart-entry):
//   POST /search              → { query: str, limit: int }
//   POST /isbn-lookup         → { isbn: str }
//   POST /auto-fill           → { isbn: str, title?: str }
//   GET  /missing-books       → ?limit=50
//   POST /enrich/{book_id}    → book_id=int
//   POST /batch-enrich        → { book_ids: [int, ...] }
//   POST /ocr                 → { text: str }
//   POST /upload-image        → multipart file
//
// n8n baseUrl = http://localhost:8000/api (含 /api 前缀)
// 生产环境通过 n8n GlobalConfig 节点或环境变量配置

// ============================================================
// 工具一: search_local_books (书房智能助手)
// 后端路由: POST /api/chat/search
// 请求体: ChatSearchRequest { query: str, limit: int }
// ============================================================

const inputData = $input.first().json;
const query = inputData.query || '';
const limit = Math.min(Math.max(inputData.limit || 10, 1), 50);
const baseUrl = $('GlobalConfig').item.json.API_BASE_URL || 'http://localhost:8000/api';

if (!query.trim()) {
  return { reply: '请提供搜索关键词，例如："科幻小说"、"东野圭吾"、"去年买的书"' };
}

try {
  const searchResult = await this.helpers.httpRequest({
    method: 'POST',
    url: `${baseUrl}/chat/search`,
    body: { query: query.trim(), limit },
    json: true,
    timeout: 30000,
  });

  const results = searchResult.results || [];
  const total = searchResult.total || results.length;

  if (results.length === 0) {
    return {
      reply: `🔍 未找到与"${query}"匹配的图书\n\n建议：\n• 尝试用不同的关键词（作者名、出版社、主题等）\n• 用 ISBN 精确查找`,
      results: [],
      total: 0,
    };
  }

  // 格式化回复
  let reply = `📚 找到 **${total}** 本相关图书\n\n`;
  const top = results.slice(0, 5);
  for (let i = 0; i < top.length; i++) {
    const b = top[i];
    reply += `**${i + 1}. 《${b.title || '未知书名'}》**\n`;
    if (b.author) reply += `   ✍️ ${b.author}`;
    if (b.publisher) reply += ` | ${b.publisher}`;
    if (b.rating) reply += ` | ⭐ ${b.rating}`;
    reply += '\n';
    if (b.shelf_names?.length) reply += `   📍 ${b.shelf_names.join('、')}\n`;
    reply += '\n';
  }
  if (results.length > 5) reply += `... 还有 ${results.length - 5} 本`;

  return { reply, results: top, total };

} catch (error) {
  console.error('search_local_books 失败:', error.message);
  return {
    reply: `抱歉，搜索服务暂时不可用。请稍后重试。\n\n错误信息: ${error.message}`,
    results: [],
    total: 0,
  };
}

// ============================================================
// 工具二: get_book_detail (书房智能助手)
// 后端路由: GET /api/chat/book/{book_id}
// 参数: book_id (int, 路径参数)
// ============================================================

const inputData = $input.first().json;
const rawBookId = inputData.book_id || inputData.bookId;
const baseUrl = $('GlobalConfig').item.json.API_BASE_URL || 'http://localhost:8000/api';

// 校验 book_id 为有效整数
const bookId = parseInt(rawBookId, 10);
if (!rawBookId || isNaN(bookId) || bookId <= 0) {
  return { reply: '未找到该图书：book_id 无效或缺失。请提供有效的图书编号。' };
}

try {
  const detail = await this.helpers.httpRequest({
    method: 'GET',
    url: `${baseUrl}/chat/book/${bookId}`,
    json: true,
    timeout: 30000,
  });

  // 格式化详情
  let reply = `📖 **《${detail.title || '未知书名'}》**\n\n`;
  if (detail.author) reply += `✍️ 作者：${detail.author}\n`;
  if (detail.isbn) reply += `🔢 ISBN：${detail.isbn}\n`;
  if (detail.publisher) reply += `🏢 出版社：${detail.publisher}\n`;
  if (detail.publish_date) reply += `📅 出版日期：${detail.publish_date}\n`;
  if (detail.pages) reply += `📄 页数：${detail.pages}\n`;
  if (detail.price) reply += `💰 定价：${detail.price}\n`;
  if (detail.binding) reply += `📚 装帧：${detail.binding}\n`;
  if (detail.translator) reply += `🖊 译者：${detail.translator}\n`;
  if (detail.series) reply += `📂 丛书：${detail.series}\n`;
  if (detail.original_title) reply += `🌐 原作名：${detail.original_title}\n`;
  if (detail.rating) reply += `⭐ 评分：${detail.rating}/10\n`;

  const shelves = detail.shelves || [];
  if (shelves.length > 0) {
    reply += '\n📍 **所在书架**\n';
    for (const s of shelves) {
      reply += `• ${s.shelf_name}`;
      if (s.physical_location) reply += ` (${s.physical_location})`;
      reply += '\n';
    }
  }

  if (detail.summary) {
    reply += `\n📖 **内容简介**\n${detail.summary.substring(0, 300)}${detail.summary.length > 300 ? '...' : ''}\n`;
  }

  return { reply, detail };

} catch (error) {
  const status = error.statusCode || 0;
  if (status === 404) {
    return { reply: `❌ 未找到图书 ID=${bookId}，该书可能已被删除。` };
  }
  console.error('get_book_detail 失败:', error.message);
  return { reply: `抱歉，获取图书详情失败。\n\n错误信息: ${error.message}` };
}

// ============================================================
// 工具三: isbn_lookup (智能录入助手)
// 后端路由: POST /api/smart-entry/isbn-lookup
// 请求体: { isbn: str }
// ============================================================

const isbn = ($input.first().json.isbn || '').replace(/[-\s]/g, '');
const baseUrl = $('GlobalConfig').item.json.API_BASE_URL || 'http://localhost:8000/api';

if (!isbn || isbn.length < 10) {
  return { reply: '请提供有效的 ISBN 编号（10位或13位数字）。例如：9787549021680' };
}

try {
  const result = await this.helpers.httpRequest({
    method: 'POST',
    url: `${baseUrl}/smart-entry/isbn-lookup`,
    body: { isbn },
    json: true,
    timeout: 30000,
  });

  if (!result.success) {
    return { reply: `📚 未找到 ISBN ${isbn} 的信息\n\n${result.message}` };
  }

  const book = result.data || {};
  const source = { douban: '豆瓣', google_books: 'Google Books', openlibrary: 'OpenLibrary' }[result.source] || result.source;

  let reply = `📚 找到以下图书信息（来源：${source}）\n\n`;
  reply += `**《${book.title || '未知书名'}》**\n`;
  if (book.author) reply += `✍️ 作者：${book.author}\n`;
  if (book.publisher) reply += `🏢 出版社：${book.publisher}\n`;
  if (book.publish_date) reply += `📅 出版日期：${book.publish_date}\n`;
  if (book.pages) reply += `📄 页数：${book.pages}\n`;
  if (book.price) reply += `💰 定价：${book.price}\n`;
  if (book.binding) reply += `📚 装帧：${book.binding}\n`;
  if (book.rating) reply += `⭐ 评分：${book.rating}/10\n`;
  if (book.summary) reply += `📖 简介：${book.summary.substring(0, 200)}...\n`;
  reply += `\n✅ 系统已自动填充录入表单，你可以去前端页面点击「确认录入」保存。`;

  return { reply, book };

} catch (error) {
  console.error('isbn_lookup 失败:', error.message);
  return { reply: `抱歉，ISBN 查询服务暂时不可用。\n\n错误信息: ${error.message}` };
}
