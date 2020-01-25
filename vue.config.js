const CopyWebpackPlugin = require('copy-webpack-plugin');
const WriteFileWebpackPlugin = require('write-file-webpack-plugin');
const ScriptExtHtmlWebpackPlugin = require('script-ext-html-webpack-plugin');
const path = require('path');
const fs = require('fs');
const browserWarning = fs.readFileSync(__dirname + '/node_modules/@nimiq/browser-warning/dist/browser-warning.html.template');
// const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;


const buildName = process.env.build
    ? process.env.build
    : process.env.NODE_ENV === 'production'
        ? 'testnet'
        : 'local';

const cdnDomain = buildName === 'mainnet'
    ? 'https://cdn.nimiq.com'
    : 'https://cdn.nimiq-testnet.com';

const domain = buildName === 'mainnet'
    ? 'https://hub.nimiq.com'
    : buildName === 'testnet'
        ? 'https://hub.nimiq-testnet.com'
        : 'http://localhost:8080';

console.log('Building for:', buildName);

const configureWebpack = {
    plugins: [
        new CopyWebpackPlugin([
            { from: 'node_modules/@nimiq/vue-components/dist/img', to: 'img' },
            { from: 'node_modules/@nimiq/browser-warning/dist', to: './' },
        ]),
        new WriteFileWebpackPlugin(),
        // new BundleAnalyzerPlugin(),
    ],
    // Resolve config for yarn build
    resolve: {
        alias: {
            config: path.join(__dirname, `src/config/config.${buildName}.ts`)
        }
    },
    // Fix sourcemaps (https://www.mistergoodcat.com/post/the-joy-that-is-source-maps-with-vuejs-and-typescript)
    devtool: process.env.NODE_ENV === 'development'
        ? 'eval-source-map' // exact mapping; fast to build; large; disabled code minification and inlined maps
        : 'source-map', // exact mapping; slow to build; small; enabled code minification and extracted maps
    output: {
        devtoolModuleFilenameTemplate: info => {
            let $filename = 'sources://' + info.resourcePath;
            if (info.resourcePath.match(/\.vue$/) && !info.query.match(/type=script/)) {
                $filename = 'webpack-generated:///' + info.resourcePath + '?' + info.hash;
            }
            return $filename;
        },
        devtoolFallbackModuleFilenameTemplate: 'webpack:///[resource-path]?[hash]',
    },
};

const pages = {
    index: {
        // entry for the page
        entry: 'src/main.ts',
        // the source template
        template: 'public/index.html',
        // insert browser warning html templates
        browserWarning,
        cdnDomain,
        domain,
        // output as dist/index.html
        filename: 'index.html',
        // chunks to include on this page, by default includes
        // extracted common chunks and vendor chunks.
        chunks: ['chunk-vendors', 'chunk-common', 'index']
    },
    iframe: {
        // entry for the page
        entry: 'src/iframe.ts',
        // the source template
        template: 'public/iframe.html',
        // output as dist/iframe.html
        filename: 'iframe.html',
        // chunks to include on this page, by default includes
        // extracted common chunks and vendor chunks.
        chunks: ['chunk-vendors', 'chunk-common', 'iframe']
    },
    'cashlink-app': {
        // entry for the page
        entry: 'src/cashlink.ts',
        // the source template
        template: 'public/cashlink.html',
        // insert browser warning html templates
        browserWarning,
        cdnDomain,
        domain,
        // output as dist/cashlink/index.html
        filename: 'cashlink/index.html',
        // chunks to include on this page, by default includes
        // extracted common chunks and vendor chunks.
        chunks: ['chunk-vendors', 'chunk-common', 'cashlink-app']
    },
};

if (buildName === 'local' || buildName === 'testnet') {
    pages.demos = {
        // entry for the page
        entry: 'demos/Demo.ts',
        // the source template
        template: 'demos/index.html',
        // output as dist/demos.html
        filename: 'demos.html',
        // chunks to include on this page, by default includes
        // extracted common chunks and vendor chunks.
        chunks: ['chunk-vendors', 'chunk-common', 'demos']
    };
}

module.exports = {
    pages,
    configureWebpack,
    chainWebpack: config => {
        // Do not put prefetch/preload links into the landing pages
        config.plugins.delete('prefetch-index');
        config.plugins.delete('preload-index');
        config.plugins.delete('prefetch-iframe');
        config.plugins.delete('preload-iframe');
        config.plugins.delete('prefetch-cashlink-app');
        config.plugins.delete('preload-cashlink-app');
        config.plugins.delete('prefetch-demos');
        config.plugins.delete('preload-demos');

        config.module
            .rule('ts')
            .use('ts-loader')
            .loader('ts-loader')
            .tap(options => {
                options.configFile = `tsconfig.${buildName}.json`
                return options
            });

        config
            .plugin('script-ext-html-webpack-plugin')
            .use(ScriptExtHtmlWebpackPlugin, [{
                defaultAttribute: 'defer',
            }]);
    }
};
