import webpack from "webpack";

export const onCreateWebpackConfig = ({ actions }) => {
  actions.setWebpackConfig({
    plugins: [
      new webpack.ProvidePlugin({
        process: "webtorrent/polyfills/process-fast",
        Buffer: ["buffer", "Buffer"],
      }),
      new webpack.DefinePlugin({
        global: "globalThis",
      }),
    ],
    resolve: {
      alias: {
        "./lib/conn-pool.js": false,
        "./lib/utp.js": false,
        "bittorrent-dht": false,
        http: false,
        fs: false,
        "fs-chunk-store": "hybrid-chunk-store",
        "load-ip-set": false,
        net: false,
        os: false,
        ut_pex: false,
        crypto: false,
        stream: "readable-stream",
        path: "path-browserify",
      },
    },
  });
};
