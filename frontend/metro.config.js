const { getDefaultConfig } = require("expo/metro-config");

module.exports = (() => {
  const config = getDefaultConfig(__dirname);
  // 不再需要 SVG transformer — 我们用 .js 模块导出 SVG 字符串
  return config;
})();
