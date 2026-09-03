const path = require('path');

// Carrega configurações do ambiente ou arquivo de configuração
const config = {
  disableHotReload: process.env.DISABLE_HOT_RELOAD === 'true',
};

module.exports = {
  devServer: {
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:8000",
        changeOrigin: true,
        ws: true,
      },
    },
  },
  webpack: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    configure: (webpackConfig) => {
      if (config.disableHotReload) {
        // Remove plugins de hot reload
        webpackConfig.plugins = webpackConfig.plugins.filter(
          (plugin) => plugin.constructor.name !== 'HotModuleReplacementPlugin'
        );

        // Desativa watch mode
        webpackConfig.watch = false;
        webpackConfig.watchOptions = { ignored: /.*/ };
      } else {
        // Ignora pastas desnecessárias para melhorar performance
        webpackConfig.watchOptions = {
          ...webpackConfig.watchOptions,
          ignored: [
            '**/node_modules/**',
            '**/.git/**',
            '**/build/**',
            '**/dist/**',
            '**/coverage/**',
            '**/public/**',
          ],
        };
      }

      return webpackConfig;
    },
  },
};
