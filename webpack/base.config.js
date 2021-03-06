const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = (env, argv) => {
  const devMode = argv.mode === 'development';
  const createBundleReport = false;
  return {
    devtool: devMode ? 'inline-cheap-module-source-map' : 'source-map',
    externals: ['fs'],
    mode: devMode ? 'development' : 'production',
    module: {
      rules: [
        { test: /\.ts$/, loader: 'ts-loader' },
        {
          test: /\.(sa|sc|c)ss$/,
          use: [
            {
              loader: MiniCssExtractPlugin.loader,
              options: {
                publicPath: ''
              }
            },
            'css-loader',
            'resolve-url-loader',
            {
              loader: 'sass-loader',
              options: {
                sourceMap: true
              }
            }
          ]
        },
        {
          test: /\.(eot|gif|jpg|otf|png|svg|ttf|woff|woff2)$/,
          use: 'file-loader'
        },
        {
          test: /\.html$/i,
          loader: 'html-loader',
          options: {
            esModule: false
          }
        }
      ]
    },
    output: {
      chunkFilename: '[name].js',
      filename: '[name].js'
    },
    plugins: [
      new MiniCssExtractPlugin({ filename: '[name].css' }),
      new BundleAnalyzerPlugin({
        analyzerMode: createBundleReport ? 'static' : 'disabled'
      })
    ],
    resolve: {
      extensions: ['.js', '.ts']
    }
  };
};
